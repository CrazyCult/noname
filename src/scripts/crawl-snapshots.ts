/**
 * Snapshot Crawler
 *
 * Crawle les progressions ALL et les stocke comme snapshot historique
 * À exécuter toutes les 12h pour construire un historique incrémental
 *
 * Usage: npx tsx src/scripts/crawl-snapshots.ts
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players, playerSnapshots } from '../db/schema';
import { fetchProgressions } from '../lib/mfl-api';
import { sql } from 'drizzle-orm';

const BATCH_SIZE = 200;

async function crawlSnapshots() {
  const db = await getDb();

  console.log('[Snapshots] Starting snapshot crawl...');
  console.log(`[Snapshots] Timestamp: ${new Date().toISOString()}`);

  // Récupérer tous les joueurs (ID + age)
  const allPlayers = await db
    .select({ id: players.id, age: players.age })
    .from(players);
  const playerIds = allPlayers.map((p) => p.id);
  const ageMap = new Map(allPlayers.map((p) => [p.id, p.age]));

  console.log(`[Snapshots] Fetching ALL progressions for ${playerIds.length} players...`);

  let processed = 0;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
    const batch = playerIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(playerIds.length / BATCH_SIZE);

    console.log(`[Snapshots] Batch ${batchNum}/${totalBatches} (${batch.length} players)...`);

    try {
      // Récupérer les progressions ALL pour ce batch
      const data = await fetchProgressions(batch, 'ALL');

      // Batch insert des snapshots
      const values = [];
      for (const [idStr, prog] of Object.entries(data)) {
        const playerId = Number(idStr);
        values.push({
          playerId,
          overall: prog.overall ?? 0,
          pace: prog.pace ?? 0,
          shooting: prog.shooting ?? 0,
          passing: prog.passing ?? 0,
          dribbling: prog.dribbling ?? 0,
          defense: prog.defense ?? 0,
          physical: prog.physical ?? 0,
          age: ageMap.get(playerId) ?? 0,
        });
      }

      if (values.length > 0) {
        await db.insert(playerSnapshots).values(values);
        inserted += values.length;
      }

      processed += batch.length;
      console.log(`[Snapshots] Progress: ${processed}/${playerIds.length} (${inserted} snapshots, ${errors} errors)`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Snapshots] Batch ${batchNum} failed: ${message}`);
      errors += batch.length;
    }

    // Délai entre les batches pour éviter de surcharger l'API
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\n=== Snapshot Crawl Complete ===');
  console.log(`Total players processed: ${processed}`);
  console.log(`Snapshots inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);
  console.log(`Completion time: ${new Date().toISOString()}`);

  process.exit(0);
}

crawlSnapshots().catch((err) => {
  console.error('[Snapshots] Fatal error:', err);
  process.exit(1);
});
