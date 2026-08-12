/**
 * One-time reconciliation for MFL's official pre-retirement indicator.
 *
 * Reads the normal paginated /players feed (no per-player requests) and writes
 * only players for which MFL currently exposes retirementYears = 1, 2 or 3.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getDb } from '../src/db';
import { players } from '../src/db/schema';
import { fetchPlayersPage } from '../src/lib/mfl-api';

type RetirementCandidate = {
  id: number;
  age: number;
  retirementYears: number;
};

async function syncRetirementStatuses() {
  const db = await getDb();
  let beforePlayerId: number | undefined;
  let pages = 0;
  let updated = 0;

  console.log('[Retirement sync] Starting official status reconciliation...');

  while (true) {
    pages++;
    const batch = await fetchPlayersPage(beforePlayerId);

    if (batch.length === 0) break;

    const candidates: RetirementCandidate[] = batch.flatMap((player) => {
      const retirementYears = player.metadata.retirementYears;
      if (retirementYears == null || retirementYears < 1 || retirementYears > 3) {
        return [];
      }

      return [{
        id: player.id,
        age: player.metadata.age,
        retirementYears,
      }];
    });

    if (candidates.length > 0) {
      const ids = sql.join(candidates.map(({ id }) => sql`${id}`), sql`, `);
      const ages = sql.join(
        candidates.map(({ id, age }) => sql`WHEN ${id} THEN ${age}`),
        sql` `,
      );
      const retirementYears = sql.join(
        candidates.map(({ id, retirementYears }) => sql`WHEN ${id} THEN ${retirementYears}`),
        sql` `,
      );

      await db.execute(sql`
        UPDATE ${players}
        SET
          ${players.age} = CASE ${players.id} ${ages} ELSE ${players.age} END,
          ${players.retirementYears} = CASE ${players.id} ${retirementYears} ELSE ${players.retirementYears} END
        WHERE ${players.id} IN (${ids})
      `);

      updated += candidates.length;
    }

    beforePlayerId = batch[batch.length - 1].id;
    console.log(`[Retirement sync] Page ${pages}: ${candidates.length} official warnings (total: ${updated})`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`[Retirement sync] Done. Updated ${updated} officially pre-retired players across ${pages} pages.`);
}

syncRetirementStatuses().catch((error) => {
  console.error('[Retirement sync] Fatal error:', error);
  process.exit(1);
});
