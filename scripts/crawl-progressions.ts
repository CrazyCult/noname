/**
 * Progression Monitoring Crawler — avec crawl_logs
 */
import 'dotenv/config';
import { getDb } from '../src/db';
import { players, progressions, crawlLogs } from '../src/db/schema';
import { fetchProgressions } from '../src/lib/mfl-api';
import { sql, eq } from 'drizzle-orm';
import type { ProgressionInterval } from '../src/types/mfl';

const BATCH_SIZE = 200;
const DELAY_MS = 1000;
const MAX_RETRIES = 5;
const RATE_LIMIT_COOLDOWN_MS = 30_000;

const VALID_INTERVALS: ProgressionInterval[] = ['24H', 'WEEK', 'MONTH', 'ALL', 'CURRENT_SEASON'];
const DAILY_INTERVALS: ProgressionInterval[] = ['CURRENT_SEASON', '24H', 'WEEK'];

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('403') || msg.includes('429') || msg.includes('rate');
}

async function fetchWithRetry(batch: number[], interval: ProgressionInterval, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchProgressions(batch, interval);
    } catch (err) {
      if (attempt === retries) return {};
      if (isRateLimited(err)) {
        console.warn(`  [RATE-LIMITED ${attempt}/${retries}] cooling down ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
        await sleep(RATE_LIMIT_COOLDOWN_MS);
      } else {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  return {};
}

async function crawlInterval(playerIds: number[], interval: ProgressionInterval) {
  const db = await getDb();
  const startedAt = new Date();
  const startTime = Date.now();
  let processed = 0, skipped = 0, inserted = 0, failed = 0;

  // ── Log début ──
  const logResult = await db.insert(crawlLogs).values({
    type: 'progressions',
    interval,
    startedAt,
    status: 'running',
    playersProcessed: 0,
    playersProgressed: 0,
  });
  const logId = (logResult as any)[0]?.insertId ?? null;

  const totalBatches = Math.ceil(playerIds.length / BATCH_SIZE);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  [${interval}] Starting — ${playerIds.length} players, ${totalBatches} batches`);
  console.log(`${'='.repeat(60)}`);

  for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = playerIds.slice(i, i + BATCH_SIZE);
    const data = await fetchWithRetry(batch, interval);

    const values = [];
    for (const [idStr, prog] of Object.entries(data)) {
      if (!prog || prog.overall == null) { skipped++; continue; }
      values.push({
        playerId: Number(idStr), interval,
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
      try {
        await db.insert(progressions).values(values).onDuplicateKeyUpdate({
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
        console.error(`  [DB ERROR] ${interval} batch ${batchNum}`);
        failed += values.length;
      }
    }

    processed += batch.length;
    if (batchNum % 50 === 0 || batchNum === totalBatches) {
      const elapsed = Date.now() - startTime;
      const eta = ((elapsed / batchNum) * (totalBatches - batchNum));
      console.log(`[${interval}] ${batchNum}/${totalBatches} — ${processed}/${playerIds.length} — ETA: ${formatDuration(eta)}`);
    }

    if (i + BATCH_SIZE < playerIds.length) await sleep(DELAY_MS);
  }

  // Compter les joueurs avec OVR >= 1 pour cet intervalle
  const progressedResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(progressions)
    .where(sql`${progressions.interval} = ${interval} AND ${progressions.overall} >= 1`);
  const playersProgressed = progressedResult[0].count;

  const durationMs = Date.now() - startTime;
  console.log(`[${interval}] Done in ${formatDuration(durationMs)} — ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
  console.log(`[${interval}] Joueurs avec OVR >= 1 : ${playersProgressed}`);

  // ── Log fin ──
  if (logId) {
    await db.update(crawlLogs)
      .set({
        finishedAt: new Date(),
        status: failed > processed * 0.5 ? 'error' : 'success',
        playersProcessed: processed,
        playersProgressed,
      })
      .where(eq(crawlLogs.id, logId));
  }

  return { processed, skipped, failed, durationMs, playersProgressed };
}

async function main() {
  const arg = process.argv[2];
  const db = await getDb();
  const allPlayers = await db.select({ id: players.id }).from(players);
  const playerIds = allPlayers.map((p) => p.id);
  console.log(`Loaded ${playerIds.length} players from database`);

  let intervals: ProgressionInterval[];
  if (arg === '--all') intervals = [...VALID_INTERVALS];
  else if (arg && VALID_INTERVALS.includes(arg as ProgressionInterval)) intervals = [arg as ProgressionInterval];
  else if (arg) { console.error(`Invalid argument "${arg}"`); process.exit(1); }
  else intervals = [...DAILY_INTERVALS];

  console.log(`Strategy: ${intervals.join(' → ')}\n`);

  const globalStart = Date.now();
  for (const interval of intervals) {
    await crawlInterval(playerIds, interval);
  }

  console.log(`\nTotal: ${formatDuration(Date.now() - globalStart)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Progressions] Fatal error:', err);
  process.exit(1);
});
