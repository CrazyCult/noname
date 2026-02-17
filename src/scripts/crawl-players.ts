/**
 * Player Indexation Crawler
 *
 * Fetches all players from the MFL API using cursor-based pagination
 * and upserts them into the local MySQL database.
 *
 * Usage: npx tsx src/scripts/crawl-players.ts
 */
import 'dotenv/config';
import { getDb } from '../db';
import { players } from '../db/schema';
import { fetchPlayersPage } from '../lib/mfl-api';
import { sql } from 'drizzle-orm';
import type { MflPlayer } from '../types/mfl';

async function crawlPlayers() {
  const db = await getDb();
  let beforePlayerId: number | undefined;
  let totalInserted = 0;
  let page = 0;

  console.log('[Crawler] Starting player indexation...');

  while (true) {
    page++;
    console.log(`[Crawler] Fetching page ${page} (before ID: ${beforePlayerId ?? 'start'})...`);

    const batch: MflPlayer[] = await fetchPlayersPage(beforePlayerId);

    if (batch.length === 0) {
      console.log('[Crawler] No more players to fetch.');
      break;
    }

    // Batch upsert players into the database
    const values = batch.map((player) => ({
      id: player.id,
      firstName: player.metadata.firstName,
      lastName: player.metadata.lastName,
      overall: player.metadata.overall,
      age: player.metadata.age,
      positions: player.metadata.positions,
      nationalities: player.metadata.nationalities,
      ownerAddress: player.ownedBy?.walletAddress ?? null,
      ownerName: player.ownedBy?.name ?? null,
    }));

    await db
      .insert(players)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          firstName: sql`VALUES(${players.firstName})`,
          lastName: sql`VALUES(${players.lastName})`,
          overall: sql`VALUES(${players.overall})`,
          age: sql`VALUES(${players.age})`,
          positions: sql`VALUES(${players.positions})`,
          nationalities: sql`VALUES(${players.nationalities})`,
          ownerAddress: sql`VALUES(${players.ownerAddress})`,
          ownerName: sql`VALUES(${players.ownerName})`,
        },
      });

    totalInserted += batch.length;
    console.log(`[Crawler] Inserted/updated ${batch.length} players (total: ${totalInserted})`);

    // Move cursor to the last player's ID for next page
    beforePlayerId = batch[batch.length - 1].id;

    // Small delay to avoid hammering the API
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[Crawler] Done! Total players indexed: ${totalInserted}`);
  process.exit(0);
}

crawlPlayers().catch((err) => {
  console.error('[Crawler] Fatal error:', err);
  process.exit(1);
});
