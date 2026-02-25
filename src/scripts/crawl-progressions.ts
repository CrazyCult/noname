/**
 * Progression Monitoring Crawler — Optimized
 *
 * Strategy:
 *   Phase 1 (parallel): CURRENT_SEASON + 24H
 *   Phase 2 (sequential): WEEK
 *
 * Usage:
 *   npx tsx src/scripts/crawl-progressions.ts           → Full strategy (phase 1 + 2)
 *   npx tsx src/scripts/crawl-progressions.ts 24H       → Single interval
 *   npx tsx src/scripts/crawl-progressions.ts --all      → All 5 intervals (parallel 2 by 2)
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players, progressions } from '../db/schema';
import { fetchProgressions } from '../lib/mfl-api';
import { sql } from 'drizzle-orm';
import type { ProgressionInterval } from '../types/mfl';

// ── Config ──────────────────────────────────────────────
const BATCH_SIZE = 200;
const DELAY_MS = 500; // 500ms between batches (was 2000ms)
const MAX_RETRIES = 3;
const CONCURRENCY = 2; // Max parallel interval workers

const VALID_INTERVALS: ProgressionInterval[] = [
  '24H',
  'WEEK',
  'MONTH',
  'ALL',
  'CURRENT_SEASON',
];

// Default daily strategy: priority order
const DAILY_STRATEGY: ProgressionInterval[][] = [
  ['CURRENT_SEASON', '24H'], // Phase 1: parallel
  ['WEEK'],                   // Phase 2: sequential
];

// ── Helpers ─────────────────────────────────────────────
function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const remaining = s % 60;
  return m > 0 ? `${m}m${remaining}s` : `${s}s`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  batch: number[],
  interval: ProgressionInterval,
  retries = MAX_RETRIES
): Promise<Record<string, { overall: number; pace: number; shooting: number; passing: number; dribbling: number; defense: number; physical: number }>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchProgressions(batch, interval);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === retries) {
        console.error(`  [FAIL] ${interval} batch after ${retries} attempts: ${msg}`);
        return {};
      }
      const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.warn(`  [RETRY ${attempt}/${retries}] ${interval}: ${msg} — waiting ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
  return {};
}

// ── Single interval crawler ─────────────────────────────
async function crawlInterval(
  playerIds: number[],
  interval: ProgressionInterval
): Promise<{ processed: number; skipped: number; failed: number; durationMs: number }> {
  const db = await getDb();
  const totalBatches = Math.ceil(playerIds.length / BATCH_SIZE);
  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[${interval}] Starting — ${playerIds.length} players, ${totalBatches} batches`);

  for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = playerIds.slice(i, i + BATCH_SIZE);

    const data = await fetchWithRetry(batch, interval);

    const values = [];
    for (const [idStr, prog] of Object.entries(data)) {
      if (!prog || prog.overall === null || prog.overall === undefined) {
        skipped++;
        continue;
      }
      values.push({
        playerId: Number(idStr),
        interval,
        overall: prog.overall ?? 0,
        pace: prog.pace ?? 0,
        shooting: prog.shooting ?? 0,
        passing: prog.passing ?? 0,
        dribbling: prog.dribbling ?? 0,
        defense: prog.defense ?? 0,
        physical: prog.physical ?? 0,
      });
    }

    if (values.length > 0) {
      await db
        .insert(progressions)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            overall: sql`VALUES(${progressions.overall})`,
            pace: sql`VALUES(${progressions.pace})`,
            shooting: sql`VALUES(${progressions.shooting})`,
            passing: sql`VALUES(${progressions.passing})`,
            dribbling: sql`VALUES(${progressions.dribbling})`,
            defense: sql`VALUES(${progressions.defense})`,
            physical: sql`VALUES(${progressions.physical})`,
          },
        });
    }

    if (Object.keys(data).length === 0 && batch.length > 0) {
      failed += batch.length;
    }

    processed += batch.length;

    // Progress log with ETA
    const elapsed = Date.now() - startTime;
    const avgPerBatch = elapsed / batchNum;
    const remaining = (totalBatches - batchNum) * avgPerBatch;

    if (batchNum % 50 === 0 || batchNum === totalBatches) {
      console.log(
        `[${interval}] ${batchNum}/${totalBatches} — ` +
        `${processed}/${playerIds.length} players — ` +
        `ETA: ${formatDuration(remaining)}`
      );
    }

    // Delay between batches (skip after last)
    if (i + BATCH_SIZE < playerIds.length) {
      await sleep(DELAY_MS);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[${interval}] Done in ${formatDuration(durationMs)} — ` +
    `${processed} processed, ${skipped} skipped, ${failed} failed`
  );

  return { processed, skipped, failed, durationMs };
}

// ── Parallel phase runner ───────────────────────────────
async function runPhase(
  playerIds: number[],
  intervals: ProgressionInterval[]
): Promise<void> {
  // Run up to CONCURRENCY intervals in parallel
  const chunks: ProgressionInterval[][] = [];
  for (let i = 0; i < intervals.length; i += CONCURRENCY) {
    chunks.push(intervals.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Starting parallel: ${chunk.join(' + ')}`);
    console.log(`${'='.repeat(60)}\n`);

    const results = await Promise.all(
      chunk.map((interval) => crawlInterval(playerIds, interval))
    );

    for (let j = 0; j < chunk.length; j++) {
      const r = results[j];
      console.log(
        `  ✓ ${chunk[j]}: ${formatDuration(r.durationMs)} ` +
        `(${r.processed} ok, ${r.skipped} skipped, ${r.failed} failed)`
      );
    }
  }
}

// ── Main ────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  const globalStart = Date.now();

  const db = await getDb();
  const allPlayers = await db.select({ id: players.id }).from(players);
  const playerIds = allPlayers.map((p) => p.id);
  console.log(`Loaded ${playerIds.length} players from database\n`);

  if (arg === '--all') {
    // All 5 intervals, 2 by 2
    const allIntervals = [...VALID_INTERVALS];
    await runPhase(playerIds, allIntervals);
  } else if (arg && VALID_INTERVALS.includes(arg as ProgressionInterval)) {
    // Single interval
    await crawlInterval(playerIds, arg as ProgressionInterval);
  } else if (arg) {
    console.error(`Invalid argument "${arg}". Use: ${VALID_INTERVALS.join(', ')} or --all`);
    process.exit(1);
  } else {
    // Default daily strategy: phase 1 parallel, phase 2 sequential
    for (let phase = 0; phase < DAILY_STRATEGY.length; phase++) {
      const intervals = DAILY_STRATEGY[phase];
      console.log(`\n>>> Phase ${phase + 1}/${DAILY_STRATEGY.length}: ${intervals.join(' + ')}`);
      await runPhase(playerIds, intervals);
    }
  }

  const totalDuration = Date.now() - globalStart;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  All done in ${formatDuration(totalDuration)}`);
  console.log(`${'='.repeat(60)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Progressions] Fatal error:', err);
  process.exit(1);
});
