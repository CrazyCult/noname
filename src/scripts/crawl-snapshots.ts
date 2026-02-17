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

const BATCH_SIZE = 200;

async function crawlSnapshots() {
  const db = await getDb();

  console.log('[Snapshots] Starting snapshot crawl...');
  console.log(`[Snapshots] Timestamp: ${new Date().toISOString()}`);

  // Récupérer tous les IDs de joueurs
  const allPlayers = await db.select({ id: players.id }).from(players);
  const playerIds = allPlayers.map((p) => p.id);

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

      // Insérer les snapshots dans la DB
      for (const [idStr, prog] of Object.entries(data)) {
        const playerId = Number(idStr);

        try {
          await db.insert(playerSnapshots).values({
            playerId,
            overall: prog.overall ?? 0,
            pace: prog.pace ?? 0,
            shooting: prog.shooting ?? 0,
            passing: prog.passing ?? 0,
            dribbling: prog.dribbling ?? 0,
            defense: prog.defense ?? 0,
            physical: prog.physical ?? 0,
            age: 0, // On ne connaît pas l'âge depuis les progressions, on met 0
          });

          inserted++;
        } catch (err) {
          console.error(`  ✗ Failed to insert snapshot for player ${playerId}: ${err.message}`);
          errors++;
        }
      }

      processed += batch.length;
      console.log(`[Snapshots] Progress: ${processed}/${playerIds.length} (${inserted} snapshots, ${errors} errors)`);

    } catch (err) {
      console.error(`[Snapshots] Batch ${batchNum} failed: ${err.message}`);
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
