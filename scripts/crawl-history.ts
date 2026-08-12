/** Backfill immutable player experience events from the public MFL history API. */
import 'dotenv/config';
import { getDb } from '../src/db';
import { players, playerHistoryEvents } from '../src/db/schema';
import { gt, sql } from 'drizzle-orm';

const BASE_URL = process.env.MFL_API_URL || 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';
const DELAY_MS = Number(process.env.HISTORY_DELAY_MS || 250);
const START_AFTER_ID = Number(process.env.HISTORY_START_AFTER_ID || 0);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHistory(playerId: number, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(`${BASE_URL}/players/${playerId}/experiences/history`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) return response.json() as Promise<Array<{ date: number; values: Record<string, number> }>>;
    if (attempt === attempts || (response.status < 500 && response.status !== 429)) {
      throw new Error(`HTTP ${response.status}`);
    }
    await sleep(response.status === 429 ? 30_000 : 2 ** attempt * 1000);
  }
  return [];
}

async function main() {
  const db = await getDb();
  const ids = await db.select({ id: players.id }).from(players)
    .where(gt(players.id, START_AFTER_ID)).orderBy(players.id);
  let succeeded = 0;
  let failed = 0;

  for (const [index, { id }] of ids.entries()) {
    try {
      const history = await fetchHistory(id);
      if (history.length) {
        await db.insert(playerHistoryEvents).values(history.map((event) => ({
          playerId: id,
          eventDate: new Date(event.date),
          values: event.values,
          fetchedAt: new Date(),
        }))).onDuplicateKeyUpdate({ set: { values: sql`VALUES(${playerHistoryEvents.values})`, fetchedAt: sql`NOW()` } });
      }
      succeeded++;
    } catch (error) {
      failed++;
      console.error(`[History] player ${id}:`, error instanceof Error ? error.message : error);
    }
    if ((index + 1) % 100 === 0) console.log(`[History] ${index + 1}/${ids.length}, failed=${failed}`);
    await sleep(DELAY_MS);
  }
  console.log(`[History] complete: ${succeeded} succeeded, ${failed} failed`);
}

main().catch((error) => { console.error(error); process.exit(1); });
