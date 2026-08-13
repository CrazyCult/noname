/**
 * Snapshot Crawler
 *
 * Stores an immutable snapshot of the absolute player state already indexed in
 * `players`. Progression totals are deliberately not written as absolute stats.
 *
 * Usage: npx tsx src/scripts/crawl-snapshots.ts
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players, playerSnapshots } from '../db/schema';
import { eq } from 'drizzle-orm';

async function crawlSnapshots() {
  const db = await getDb();

  console.log('[Snapshots] Starting snapshot crawl...');
  console.log(`[Snapshots] Timestamp: ${new Date().toISOString()}`);

  const allPlayers = await db.select().from(players)
    .where(eq(players.isRetired, false));
  const now = new Date();
  const BATCH_SIZE = 1000;
  let inserted = 0;
  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    const batch = allPlayers.slice(i, i + BATCH_SIZE);
    await db.insert(playerSnapshots).values(batch.map((player) => ({
      playerId: player.id, overall: player.overall, pace: player.pace ?? 0,
      shooting: player.shooting ?? 0, passing: player.passing ?? 0,
      dribbling: player.dribbling ?? 0, defense: player.defense ?? 0,
      physical: player.physical ?? 0, age: player.age, createdAt: now,
    })));
    inserted += batch.length;
  }

  console.log('\n=== Snapshot Crawl Complete ===');
  console.log(`Total players processed: ${allPlayers.length}`);
  console.log(`Snapshots inserted: ${inserted}`);
  console.log(`Completion time: ${new Date().toISOString()}`);

  process.exit(0);
}

crawlSnapshots().catch((err) => {
  console.error('[Snapshots] Fatal error:', err);
  process.exit(1);
});
