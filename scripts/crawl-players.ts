/**
 * Player Indexation Crawler
 * Saves detailed stats + isDevCenter flag.
 * Usage: npx tsx scripts/crawl-players.ts
 */
import 'dotenv/config';
import { getDb } from '../src/db';
import { players } from '../src/db/schema';
import { fetchPlayersPage } from '../src/lib/mfl-api';
import { sql } from 'drizzle-orm';
import type { MflPlayer } from '../src/types/mfl';

async function crawlPlayers() {
  const db = await getDb();
  const crawlStartedAt = new Date();
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
      retirementYears: player.metadata.retirementYears ?? null,
      positions: player.metadata.positions,
      nationalities: player.metadata.nationalities,
      ownerAddress: player.ownedBy?.walletAddress ?? null,
      ownerName: player.ownedBy?.name ?? null,
      revenueShare: player.activeContract?.revenueShare ?? 0,
      clause: (player.activeContract?.totalRevenueShareLocked ?? 0) - (player.activeContract?.revenueShare ?? 0),
      pace: player.metadata.pace ?? 0,
      shooting: player.metadata.shooting ?? 0,
      passing: player.metadata.passing ?? 0,
      dribbling: player.metadata.dribbling ?? 0,
      defense: player.metadata.defense ?? 0,
      physical: player.metadata.physical ?? 0,
      goalkeeping: player.metadata.goalkeeping ?? 0,
      isDevCenter: player.activeContract?.club?.type === 'DEVELOPMENT_CENTER',
      isRetired: false,
      lastSeenAt: new Date(),
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
          retirementYears: sql`VALUES(${players.retirementYears})`,
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
          isDevCenter: sql`VALUES(${players.isDevCenter})`,
          isRetired: false,
          lastSeenAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        },
      });

    totalInserted += batch.length;
    console.log(`[Crawler] Inserted/updated ${batch.length} players (total: ${totalInserted})`);

    beforePlayerId = batch[batch.length - 1].id;
    await new Promise((r) => setTimeout(r, 500));
  }

  // This runs only after every MFL page completed successfully. Rows not seen
  // during this complete pass are retained for historical model training.
  await db.update(players)
    .set({ isRetired: true })
    .where(sql`${players.lastSeenAt} < ${crawlStartedAt}`);

  console.log(`[Crawler] Done! Total active players indexed: ${totalInserted}`);
  console.log('[Crawler] Players missing from the complete MFL index were marked as retired.');
  process.exit(0);
}

crawlPlayers().catch((err) => {
  console.error('[Crawler] Fatal error:', err);
  process.exit(1);
});
