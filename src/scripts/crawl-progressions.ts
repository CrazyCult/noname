/**
 * Progression Monitoring Crawler
 *
 * Fetches progression data for all players in the database
 * in batches of 200 and upserts the results.
 *
 * Usage: npx tsx src/scripts/crawl-progressions.ts [interval]
 * Intervals: 24H, WEEK, MONTH, ALL, CURRENT_SEASON (default: WEEK)
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players, progressions } from '../db/schema';
import { fetchProgressions } from '../lib/mfl-api';
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
  const interval = (process.argv[2] as ProgressionInterval) || 'WEEK';

  if (!VALID_INTERVALS.includes(interval)) {
    console.error(`Invalid interval "${interval}". Use: ${VALID_INTERVALS.join(', ')}`);
    process.exit(1);
  }

  const db = await getDb();

  // Get all player IDs from the database
  const allPlayers = await db.select({ id: players.id }).from(players);
  const playerIds = allPlayers.map((p) => p.id);

  console.log(`[Progressions] Fetching ${interval} progressions for ${playerIds.length} players...`);

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
    const batch = playerIds.slice(i, i + BATCH_SIZE);

    console.log(`[Progressions] Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} players)...`);

    const data = await fetchProgressions(batch, interval);

    for (const [idStr, prog] of Object.entries(data)) {
      const playerId = Number(idStr);

      // ✅ Vérification ajoutée ici
      if (!prog || prog.overall === null || prog.overall === undefined) {
        skipped++;
        continue;
      }

      await db
        .insert(progressions)
        .values({
          playerId,
          interval,
          overall: prog.overall ?? 0,
          pace: prog.pace ?? 0,
          shooting: prog.shooting ?? 0,
          passing: prog.passing ?? 0,
          dribbling: prog.dribbling ?? 0,
          defense: prog.defense ?? 0,
          physical: prog.physical ?? 0,
        })
        .onDuplicateKeyUpdate({
          set: {
            overall: prog.overall ?? 0,
            pace: prog.pace ?? 0,
            shooting: prog.shooting ?? 0,
            passing: prog.passing ?? 0,
            dribbling: prog.dribbling ?? 0,
            defense: prog.defense ?? 0,
            physical: prog.physical ?? 0,
          },
        });
    }

    processed += batch.length;
    console.log(`[Progressions] Processed ${processed}/${playerIds.length} (skipped: ${skipped})`);

    // Small delay between batches
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[Progressions] Done! Updated ${interval} progressions for ${processed} players (skipped ${skipped} players with missing data).`);
  process.exit(0);
}

crawlProgressions().catch((err) => {
  console.error('[Progressions] Fatal error:', err);
  process.exit(1);
});