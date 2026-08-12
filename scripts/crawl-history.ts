/** Backfill immutable player experience events from the public MFL history API. */
import 'dotenv/config';
import { appendFileSync } from 'node:fs';
import { getDb } from '../src/db';
import { players, playerHistoryEvents } from '../src/db/schema';
import { gt, sql } from 'drizzle-orm';

const BASE_URL = process.env.MFL_API_URL || 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';
const MIN_DELAY_MS = 700;
const MAX_PLAYERS_PER_RUN = 15_000;
const requestedDelayMs = positiveIntegerEnv('HISTORY_DELAY_MS', MIN_DELAY_MS);
const requestedMaxPlayers = positiveIntegerEnv('HISTORY_MAX_PLAYERS', MAX_PLAYERS_PER_RUN);
const DELAY_MS = Math.max(MIN_DELAY_MS, requestedDelayMs);
const MAX_PLAYERS = Math.min(MAX_PLAYERS_PER_RUN, requestedMaxPlayers);
const START_AFTER_ID = nonNegativeIntegerEnv('HISTORY_START_AFTER_ID', 0);
const RATE_LIMIT_COOLDOWN_MS = positiveIntegerEnv('HISTORY_RATE_LIMIT_COOLDOWN_MS', 90_000);
const MAX_THROTTLE_ATTEMPTS = 3;

type HistoryEvent = { date: number; values: Record<string, number> };

class MflThrottleError extends Error {
  constructor(
    readonly playerId: number,
    readonly status: number,
  ) {
    super(`MFL kept returning HTTP ${status} for player ${playerId}`);
    this.name = 'MflThrottleError';
  }
}

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeWorkflowOutputs(nextStartAfterId: number, hasMore: boolean) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(outputPath, `next_start_after_id=${nextStartAfterId}\nhas_more=${hasMore}\n`);
}
function retryAfterMs(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

async function fetchHistory(playerId: number): Promise<HistoryEvent[]> {
  for (let attempt = 1; attempt <= MAX_THROTTLE_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/players/${playerId}/experiences/history`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'mfl-scout-history-backfill/1.0',
        },
      });
    } catch (error) {
      if (attempt === MAX_THROTTLE_ATTEMPTS) throw error;
      const waitMs = 2 ** attempt * 1000;
      console.warn(`[History] player ${playerId}: network error; retrying in ${waitMs / 1000}s`);
      await sleep(waitMs);
      continue;
    }

    if (response.ok) return response.json() as Promise<HistoryEvent[]>;

    const isThrottle = response.status === 403 || response.status === 429;
    const isServerError = response.status >= 500;
    if (!isThrottle && !isServerError) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (isThrottle) {
      if (attempt === MAX_THROTTLE_ATTEMPTS) {
        throw new MflThrottleError(playerId, response.status);
      }
      const waitMs = Math.max(retryAfterMs(response) ?? 0, RATE_LIMIT_COOLDOWN_MS);
      console.warn(`[History] player ${playerId}: HTTP ${response.status}; waiting ${Math.ceil(waitMs / 1000)}s before retrying`);
      await sleep(waitMs);
      continue;
    }

    if (attempt === MAX_THROTTLE_ATTEMPTS) {
      throw new Error(`HTTP ${response.status}`);
    }
    const waitMs = 2 ** attempt * 1000;
    console.warn(`[History] player ${playerId}: HTTP ${response.status}; retrying in ${waitMs / 1000}s`);
    await sleep(waitMs);
  }

  throw new Error(`No response for player ${playerId}`);
}

async function main() {
  if (requestedDelayMs < MIN_DELAY_MS) {
    console.warn(`[History] HISTORY_DELAY_MS was raised to the safe minimum of ${MIN_DELAY_MS}ms`);
  }
  if (requestedMaxPlayers > MAX_PLAYERS_PER_RUN) {
    console.warn(`[History] HISTORY_MAX_PLAYERS was capped at ${MAX_PLAYERS_PER_RUN}`);
  }

  const db = await getDb();
  const ids = await db.select({ id: players.id }).from(players)
    .where(gt(players.id, START_AFTER_ID))
    .orderBy(players.id)
    .limit(MAX_PLAYERS);

  if (ids.length === 0) {
    writeWorkflowOutputs(START_AFTER_ID, false);
    console.log(`[History] no players found after ID ${START_AFTER_ID}`);
    return;
  }

  console.log(`[History] starting ${ids.length} players after ID ${START_AFTER_ID} at one request every ${DELAY_MS}ms or slower`);

  let succeeded = 0;
  let failed = 0;
  let lastCompletedId = START_AFTER_ID;

  for (const [index, { id }] of ids.entries()) {
    try {
      const history = await fetchHistory(id);
      if (history.length) {
        await db.insert(playerHistoryEvents).values(history.map((event) => ({
          playerId: id,
          eventDate: new Date(event.date),
          values: event.values,
          fetchedAt: new Date(),
        }))).onDuplicateKeyUpdate({
          set: {
            values: sql`VALUES(${playerHistoryEvents.values})`,
            fetchedAt: sql`NOW()`,
          },
        });
      }
      succeeded++;
      lastCompletedId = id;
    } catch (error) {
      if (error instanceof MflThrottleError) {
        console.error(`[History] MFL rate limit persists at player ${id}. The imported rows are safe.`);
        console.error(`[History] Resume later with start_after_id=${lastCompletedId}.`);
        throw error;
      }
      failed++;
      lastCompletedId = id;
      console.error(`[History] player ${id}:`, error instanceof Error ? error.message : error);
    }

    if ((index + 1) % 100 === 0) {
      console.log(`[History] ${index + 1}/${ids.length}, failed=${failed}, resume_after=${lastCompletedId}`);
    }
    await sleep(DELAY_MS);
  }

  const hasMore = ids.length === MAX_PLAYERS;
  writeWorkflowOutputs(lastCompletedId, hasMore);
  console.log(`[History] complete: ${succeeded} succeeded, ${failed} failed`);
  console.log(`[History] Next run: start_after_id=${lastCompletedId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
