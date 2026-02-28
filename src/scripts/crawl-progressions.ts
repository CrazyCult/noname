/**
 * Progression Monitoring Crawler — Optimized
 *
 * Strategy (sequential, rate-limit safe):
 *   1. CURRENT_SEASON  (~27min)
 *   2. 24H             (~27min)
 *   3. WEEK            (~27min)
 *   Total: ~80min
 *
 * Usage:
 *   npx tsx src/scripts/crawl-progressions.ts           → Daily strategy (CURRENT_SEASON, 24H, WEEK)
 *   npx tsx src/scripts/crawl-progressions.ts 24H       → Single interval
 *   npx tsx src/scripts/crawl-progressions.ts --all     → All 5 intervals
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players, progressions } from '../db/schema';
import { fetchProgressions } from '../lib/mfl-api';
import { sql } from 'drizzle-orm';
import type { ProgressionInterval } from '../types/mfl';

// ── Config ──────────────────────────────────────────────
const BATCH_SIZE = 200;
const DELAY_MS = 1000; // 1s between batches (~1 req/s, safe for MFL API)
const MAX_RETRIES = 5;
const RATE_LIMIT_COOLDOWN_MS = 30_000; // 30s cooldown on 403

const VALID_INTERVALS: ProgressionInterval[] = [
  '24H',
  'WEEK',
  'MONTH',
  'ALL',
  'CURRENT_SEASON',
];

// Daily priority order (sequential)
const DAILY_INTERVALS: ProgressionInterval[] = [
  'CURRENT_SEASON',
  '24H',
  'WEEK',
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

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('403') || msg.includes('429') || msg.includes('rate');
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

      // 403/429 = rate limited → long cooldown
      if (isRateLimited(err)) {
        console.warn(
          `  [RATE-LIMITED ${attempt}/${retries}] ${interval}: ${msg} — cooling down ${RATE_LIMIT_COOLDOWN_MS / 1000}s`
        );
        await sleep(RATE_LIMIT_COOLDOWN_MS);
      } else {
        // Other errors → short exponential backoff
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`  [RETRY ${attempt}/${retries}] ${interval}: ${msg} — waiting ${backoff / 1000}s`);
        await sleep(backoff);
      }
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
  let inserted = 0;
  let failed = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  [${interval}] Starting — ${playerIds.length} players, ${totalBatches} batches`);
  console.log(`${'='.repeat(60)}`);

  for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = playerIds.slice(i, i + BATCH_SIZE);

    const data = await fetchWithRetry(batch, interval);

    const values = [];
    for (const playerId of batch) {
      // prog can be: null (API returns null → no progression), undefined (player absent from
      // response), or a partial object like {shooting:1} (only changed stats, overall omitted).
      // In all cases we use ??0 so stale DB values are always overwritten with current data.
      const prog = data[String(playerId)] ?? null;
      if (!prog) skipped++;
      values.push({
        playerId,
        interval,
        overall: prog?.overall ?? 0,
        pace: prog?.pace ?? 0,
        shooting: prog?.shooting ?? 0,
        passing: prog?.passing ?? 0,
        dribbling: prog?.dribbling ?? 0,
        defense: prog?.defense ?? 0,
        physical: prog?.physical ?? 0,
      });
    }

    if (values.length > 0) {
      try {
        await db
          .insert(progressions)
          .values(values)
          .onDuplicateKeyUpdate({
            set: {
              overall: sql`VALUES(${sql.raw('`overall`')})`,
              pace: sql`VALUES(${sql.raw('`pace`')})`,
              shooting: sql`VALUES(${sql.raw('`shooting`')})`,
              passing: sql`VALUES(${sql.raw('`passing`')})`,
              dribbling: sql`VALUES(${sql.raw('`dribbling`')})`,
              defense: sql`VALUES(${sql.raw('`defense`')})`,
              physical: sql`VALUES(${sql.raw('`physical`')})`,
            },
          });
        inserted += values.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [DB ERROR] ${interval} batch ${batchNum}: ${msg}`);
        failed += values.length;
      }
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

  // Verify what's actually in the DB
  const dbCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(progressions)
    .where(sql`${progressions.interval} = ${interval}`);
  const actualCount = dbCount[0].count;

  console.log(
    `[${interval}] Done in ${formatDuration(durationMs)} — ` +
      `${processed} processed, ${inserted} inserted, ${skipped} skipped, ${failed} failed`
  );
  console.log(`[${interval}] DB verification: ${actualCount} rows in progressions table`);

  return { processed, skipped, failed, durationMs };
}

// ── Main ────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  const globalStart = Date.now();

  const db = await getDb();
  const allPlayers = await db.select({ id: players.id }).from(players);
  const playerIds = allPlayers.map((p) => p.id);
  console.log(`Loaded ${playerIds.length} players from database`);

  let intervals: ProgressionInterval[];

  if (arg === '--all') {
    intervals = [...VALID_INTERVALS];
  } else if (arg && VALID_INTERVALS.includes(arg as ProgressionInterval)) {
    intervals = [arg as ProgressionInterval];
  } else if (arg) {
    console.error(`Invalid argument "${arg}". Use: ${VALID_INTERVALS.join(', ')} or --all`);
    process.exit(1);
  } else {
    intervals = [...DAILY_INTERVALS];
  }

  console.log(`Strategy: ${intervals.join(' → ')} (sequential)\n`);

  const results: { interval: ProgressionInterval; durationMs: number }[] = [];

  for (const interval of intervals) {
    const r = await crawlInterval(playerIds, interval);
    results.push({ interval, durationMs: r.durationMs });
  }

  const totalDuration = Date.now() - globalStart;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Summary:`);
  for (const r of results) {
    console.log(`    ${r.interval}: ${formatDuration(r.durationMs)}`);
  }
  console.log(`  Total: ${formatDuration(totalDuration)}`);
  console.log(`${'='.repeat(60)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Progressions] Fatal error:', err);
  process.exit(1);
});
