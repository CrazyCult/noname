/**
 * Progression Monitoring Crawler
 *
 * Fetches progression data for all players in the database
 * in batches of 200 and upserts the results.
 *
 * Usage: npx tsx src/scripts/crawl-progressions.ts [interval]
 * Sans argument : crawle TOUS les intervalles (24H, WEEK, MONTH, ALL, CURRENT_SEASON)
 * Avec argument : crawle un seul intervalle (ex: npx tsx src/scripts/crawl-progressions.ts 24H)
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players, progressions } from '../db/schema';
import { fetchProgressions } from '../lib/mfl-api';
import { sql } from 'drizzle-orm';
import type { ProgressionInterval } from '../types/mfl';

const BATCH_SIZE = 200;
const VALID_INTERVALS: ProgressionInterval[] = [
  '24H',
  'WEEK',
  'MONTH',
  'ALL',
  'CURRENT_SEASON',
];

async function crawlProgressions() {
  const requestedInterval = process.argv[2] as ProgressionInterval | undefined;

  if (requestedInterval && !VALID_INTERVALS.includes(requestedInterval)) {
    console.error(`Invalid interval "${requestedInterval}". Use: ${VALID_INTERVALS.join(', ')}`);
    process.exit(1);
  }

  const intervals = requestedInterval ? [requestedInterval] : VALID_INTERVALS;

  const db = await getDb();

  // Get all player IDs from the database
  const allPlayers = await db.select({ id: players.id }).from(players);
  const playerIds = allPlayers.map((p) => p.id);

  for (const interval of intervals) {
    console.log(`\n[Progressions] === ${interval} === Fetching for ${playerIds.length} players...`);

    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
      const batch = playerIds.slice(i, i + BATCH_SIZE);

      console.log(`[Progressions] ${interval} - Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} players)...`);

      const data = await fetchProgressions(batch, interval);

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

      processed += batch.length;
      console.log(`[Progressions] ${interval} - ${processed}/${playerIds.length} (skipped: ${skipped})`);

      // Small delay between batches
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`[Progressions] ${interval} done! ${processed} players (skipped ${skipped}).`);
  }

  console.log('\n[Progressions] All intervals complete!');
  process.exit(0);
}

crawlProgressions().catch((err) => {
  console.error('[Progressions] Fatal error:', err);
  process.exit(1);
});