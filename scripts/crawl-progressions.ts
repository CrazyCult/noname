/**
 * Progression Monitoring Crawler — avec crawl_logs
 */
import 'dotenv/config';
import { getDb } from '../src/db';
import { players, progressions, progressionObservations, crawlLogs } from '../src/db/schema';
import { fetchProgressions } from '../src/lib/mfl-api';
import { sql, eq, and, isNull } from 'drizzle-orm';
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
    for (const playerId of batch) {
      // prog can be: undefined (not in API response = no progression),
      // or a partial object like {shooting:1} (only changed stats, overall omitted).
      // Use ??0 for all fields so stale DB values are always overwritten.
      const prog = data[String(playerId)] ?? null;
      if (!prog) skipped++;
      values.push({
        playerId, interval,
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
        // Preserve the observation before refreshing the current-state table.
        await db.insert(progressionObservations).values(values.map(({ playerId, interval, ...stats }) => ({
          playerId,
          interval,
          ...stats,
          observedAt: new Date(),
        })));
        await db.insert(progressions).values(values).onDuplicateKeyUpdate({
          set: {
            overall: sql`VALUES(${sql.raw('`overall`')})`,
            pace: sql`VALUES(${sql.raw('`pace`')})`,
            shooting: sql`VALUES(${sql.raw('`shooting`')})`,
            passing: sql`VALUES(${sql.raw('`passing`')})`,
            dribbling: sql`VALUES(${sql.raw('`dribbling`')})`,
            defense: sql`VALUES(${sql.raw('`defense`')})`,
            physical: sql`VALUES(${sql.raw('`physical`')})`,
            // Force timestamp refresh even when values are unchanged (e.g. 0→0),
            // so the orphan purge can correctly identify untouched rows.
            updatedAt: sql`NOW()`,
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

  // Purge orphaned rows (players removed from `players` table) and rows not
  // touched by this crawl run. All processed rows have updatedAt=NOW() so
  // anything older than crawlStart is a true orphan.
  const crawlStart = new Date(startTime);
  const purgeResult = interval === '24H'
    ? await db.execute(sql`
        DELETE p FROM progressions p
        INNER JOIN players pl ON pl.id = p.player_id
        WHERE p.\`interval\` = ${interval}
          AND p.updated_at < ${crawlStart}
          AND pl.is_retired = false
          AND pl.retirement_years IS NULL
      `)
    : await db.execute(
        sql`DELETE FROM progressions WHERE \`interval\` = ${interval} AND updated_at < ${crawlStart}`
      );
  const purged = (purgeResult as any)[0]?.affectedRows ?? 0;

  // DB truth after purge
  const [dbRow] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      progressed: sql<number>`SUM(CASE WHEN overall >= 1 THEN 1 ELSE 0 END)`,
    })
    .from(progressions)
    .where(sql`${progressions.interval} = ${interval}`);
  const playersProgressed = Number(dbRow.progressed ?? 0);

  const durationMs = Date.now() - startTime;
  console.log(`[${interval}] Done in ${formatDuration(durationMs)} — ${inserted} inserted, ${skipped} skipped, ${failed} failed, ${purged} orphans purged`);
  console.log(`[${interval}] DB: ${dbRow.total} rows total, ${playersProgressed} with OVR >= 1`);

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
  const [allPlayers, fastPlayers] = await Promise.all([
    db.select({ id: players.id }).from(players),
    db.select({ id: players.id })
      .from(players)
      .where(and(
        eq(players.isRetired, false),
        isNull(players.retirementYears),
      )),
  ]);
  const allPlayerIds = allPlayers.map((player) => player.id);
  const fastPlayerIds = fastPlayers.map((player) => player.id);
  console.log(
    `Loaded ${allPlayerIds.length} total players; ${fastPlayerIds.length} eligible for fast 24H crawl`
  );

  let intervals: ProgressionInterval[];
  if (arg === '--all') intervals = [...VALID_INTERVALS];
  else if (arg && VALID_INTERVALS.includes(arg as ProgressionInterval)) intervals = [arg as ProgressionInterval];
  else if (arg) { console.error(`Invalid argument "${arg}"`); process.exit(1); }
  else intervals = [...DAILY_INTERVALS];

  console.log(`Strategy: ${intervals.join(' → ')}\n`);

  const globalStart = Date.now();
  for (const interval of intervals) {
    // 24H prioritises actionable prospects. Longer historical intervals keep
    // retirees and pre-retirees so their careers remain useful to the model.
    const playerIds = interval === '24H' ? fastPlayerIds : allPlayerIds;
    await crawlInterval(playerIds, interval);
  }

  console.log(`\nTotal: ${formatDuration(Date.now() - globalStart)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Progressions] Fatal error:', err);
  process.exit(1);
});
