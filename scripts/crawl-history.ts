/** Backfill immutable player experience events from the public MFL history API. */
import 'dotenv/config';
import { appendFileSync } from 'node:fs';
import { getDb } from '../src/db';
import { players, playerHistoryEvents } from '../src/db/schema';
import { gt, sql } from 'drizzle-orm';

const BASE_URL = process.env.MFL_API_URL || 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';
const MIN_DELAY_MS = 200;
const DEFAULT_WORKERS = 4;
const MAX_PLAYERS_PER_RUN = 15_000;
const MAX_RUNTIME_MINUTES_LIMIT = 300;
const requestedDelayMs = positiveIntegerEnv('HISTORY_DELAY_MS', 250);
const requestedWorkers = positiveIntegerEnv('HISTORY_WORKERS', DEFAULT_WORKERS);
const requestedMaxPlayers = positiveIntegerEnv('HISTORY_MAX_PLAYERS', 4_000);
const requestedMaxRuntimeMinutes = positiveIntegerEnv('HISTORY_MAX_RUNTIME_MINUTES', 270);
let requestIntervalMs = Math.max(MIN_DELAY_MS, requestedDelayMs);
const WORKERS = Math.min(8, requestedWorkers);
const MAX_PLAYERS = Math.min(MAX_PLAYERS_PER_RUN, requestedMaxPlayers);
const MAX_RUNTIME_MS = Math.min(MAX_RUNTIME_MINUTES_LIMIT, requestedMaxRuntimeMinutes) * 60_000;
const START_AFTER_ID = nonNegativeIntegerEnv('HISTORY_START_AFTER_ID', 0);
const RATE_LIMIT_COOLDOWN_MS = positiveIntegerEnv('HISTORY_RATE_LIMIT_COOLDOWN_MS', 90_000);
const MAX_THROTTLE_ATTEMPTS = 3;
let nextRequestAt = 0;
let globalBlockedUntil = 0;
let limiterQueue = Promise.resolve();
let throttleCount = 0;
const REQUEST_TIMEOUT_MS = 30_000;

type HistoryEvent = { date: number; values: Record<string, number> };

class MflThrottleError extends Error {
  constructor(readonly playerId: number, readonly status: number) {
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
async function acquireRequestSlot() {
  let release!: () => void;
  const previous = limiterQueue;
  limiterQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const waitUntil = Math.max(nextRequestAt, globalBlockedUntil);
    const waitMs = waitUntil - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    nextRequestAt = Date.now() + requestIntervalMs;
  } finally {
    release();
  }
}

function applyGlobalThrottle(waitMs: number) {
  throttleCount++;
  requestIntervalMs = Math.min(5000, Math.ceil(requestIntervalMs * 1.75));
  globalBlockedUntil = Math.max(globalBlockedUntil, Date.now() + waitMs);
  console.warn(`[History] global throttle #${throttleCount}; interval=${requestIntervalMs}ms`);
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
      await acquireRequestSlot();
      response = await fetch(`${BASE_URL}/players/${playerId}/experiences/history`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'mfl-scout-history-backfill/1.1',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    if (!isThrottle && !isServerError) throw new Error(`HTTP ${response.status}`);

    if (isThrottle) {
      if (attempt === MAX_THROTTLE_ATTEMPTS) throw new MflThrottleError(playerId, response.status);
      const waitMs = Math.max(retryAfterMs(response) ?? 0, RATE_LIMIT_COOLDOWN_MS);
      applyGlobalThrottle(waitMs);
      console.warn(`[History] player ${playerId}: HTTP ${response.status}; waiting ${Math.ceil(waitMs / 1000)}s before retrying`);
      await sleep(waitMs);
      continue;
    }

    if (attempt === MAX_THROTTLE_ATTEMPTS) throw new Error(`HTTP ${response.status}`);
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
  if (requestedMaxRuntimeMinutes > MAX_RUNTIME_MINUTES_LIMIT) {
    console.warn(`[History] HISTORY_MAX_RUNTIME_MINUTES was capped at ${MAX_RUNTIME_MINUTES_LIMIT}`);
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

  console.log(`[History] controlled test: ${ids.length} players, ${WORKERS} workers, ${requestIntervalMs}ms global interval; time budget ${MAX_RUNTIME_MS / 60_000} minutes`);

  const startedAt = Date.now();
  let succeeded = 0;
  let failed = 0;
  let processed = 0;
  let lastCompletedId = START_AFTER_ID;
  let stoppedForTimeBudget = false;

  for (let offset = 0; offset < ids.length; offset += WORKERS) {
    if (Date.now() - startedAt >= MAX_RUNTIME_MS) {
      stoppedForTimeBudget = true;
      console.log(`[History] time budget reached; stopping cleanly after player ${lastCompletedId}`);
      break;
    }

    // Groups remain ordered: the resume cursor advances only after every
    // player in this group completed, so parallel completion cannot skip IDs.
    const group = ids.slice(offset, offset + WORKERS);
    const results = await Promise.all(group.map(async ({ id }) => {
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
        return { id, succeeded: true };
      } catch (error) {
        console.error(`[History] player ${id}:`, error instanceof Error ? error.message : error);
        return { id, succeeded: false };
      }
    }));

    for (const result of results) {
      processed++;
      if (result.succeeded) succeeded++; else failed++;
    }
    lastCompletedId = group[group.length - 1].id;

    if (processed % 100 < WORKERS) {
      const seconds = Math.max(1, (Date.now() - startedAt) / 1000);
      console.log(`[History] ${processed}/${ids.length}, failed=${failed}, throttles=${throttleCount}, rate=${(processed / seconds).toFixed(2)}/s, resume_after=${lastCompletedId}`);
    }
  }
  const hasMore = stoppedForTimeBudget || ids.length === MAX_PLAYERS;
  writeWorkflowOutputs(lastCompletedId, hasMore);
  console.log(`[History] batch complete: ${succeeded} succeeded, ${failed} failed, ${processed} processed, ${throttleCount} throttles`);
  console.log(`[History] Next run: start_after_id=${lastCompletedId}, has_more=${hasMore}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
