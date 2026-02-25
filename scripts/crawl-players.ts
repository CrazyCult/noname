/**
 * Player Indexation Crawler
 *
 * Fetches all players from the MFL API using cursor-based pagination
 * and upserts them into the local MySQL database.
 * Now also saves detailed stats (pace, shooting, etc.) to avoid live API calls.
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
      revenueShare: player.activeContract?.revenueShare ?? 0,
      clause: (player.activeContract?.totalRevenueShareLocked ?? 0) - (player.activeContract?.revenueShare ?? 0),
      // ── Stats détaillées ──
      pace: player.metadata.pace ?? 0,
      shooting: player.metadata.shooting ?? 0,
      passing: player.metadata.passing ?? 0,
      dribbling: player.metadata.dribbling ?? 0,
      defense: player.metadata.defense ?? 0,
      physical: player.metadata.physical ?? 0,
      goalkeeping: player.metadata.goalkeeping ?? 0,
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
          revenueShare: sql`VALUES(${players.revenueShare})`,
          clause: sql`VALUES(${players.clause})`,
          pace: sql`VALUES(${players.pace})`,
          shooting: sql`VALUES(${players.shooting})`,
          passing: sql`VALUES(${players.passing})`,
          dribbling: sql`VALUES(${players.dribbling})`,
          defense: sql`VALUES(${players.defense})`,
          physical: sql`VALUES(${players.physical})`,
          goalkeeping: sql`VALUES(${players.goalkeeping})`,
        },
      });

    totalInserted += batch.length;
    console.log(`[Crawler] Inserted/updated ${batch.length} players (total: ${totalInserted})`);

    beforePlayerId = batch[batch.length - 1].id;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[Crawler] Done! Total players indexed: ${totalInserted}`);
  process.exit(0);
}

crawlPlayers().catch((err) => {
  console.error('[Crawler] Fatal error:', err);
  process.exit(1);
});
