/**
 * Derive long progression windows from our own player timeline.
 *
 * MFL's 24H endpoint remains the live signal. WEEK, MONTH, CURRENT_SEASON
 * and ALL are calculated locally from the backfilled MFL history followed by
 * absolute player snapshots, so they require no period-specific MFL calls.
 */
import 'dotenv/config';
import { getDb } from '../src/db';
import {
  playerHistoryEvents,
  playerSnapshots,
  players,
  progressions,
} from '../src/db/schema';
import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm';

const BATCH_SIZE = 1_000;
const DAY_MS = 86_400_000;
const SEASON_DAYS = 42;
const DERIVED_INTERVALS = ['WEEK', 'MONTH', 'CURRENT_SEASON', 'ALL'] as const;
const STAT_KEYS = [
  'overall',
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defense',
  'physical',
] as const;

type StatKey = (typeof STAT_KEYS)[number];
type State = Partial<Record<StatKey, number>>;
type TimelinePoint = { at: number; state: State };

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function currentState(player: {
  overall: number;
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  dribbling: number | null;
  defense: number | null;
  physical: number | null;
}): State {
  return {
    overall: player.overall,
    pace: player.pace ?? 0,
    shooting: player.shooting ?? 0,
    passing: player.passing ?? 0,
    dribbling: player.dribbling ?? 0,
    defense: player.defense ?? 0,
    physical: player.physical ?? 0,
  };
}

function snapshotState(snapshot: {
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defense: number;
  physical: number;
}): State {
  return {
    overall: snapshot.overall,
    pace: snapshot.pace,
    shooting: snapshot.shooting,
    passing: snapshot.passing,
    dribbling: snapshot.dribbling,
    defense: snapshot.defense,
    physical: snapshot.physical,
  };
}

function timelineForPlayer(
  historyRows: Array<{ eventDate: Date; values: Record<string, number> }>,
  snapshotRows: Array<{
    createdAt: Date;
    overall: number;
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defense: number;
    physical: number;
  }>,
): TimelinePoint[] {
  const timeline: TimelinePoint[] = [];
  let state: State = {};

  for (const row of historyRows) {
    for (const key of STAT_KEYS) {
      const value = numberOrUndefined(row.values[key]);
      if (value !== undefined) state[key] = value;
    }
    timeline.push({ at: row.eventDate.getTime(), state: { ...state } });
  }

  for (const snapshot of snapshotRows) {
    timeline.push({ at: snapshot.createdAt.getTime(), state: snapshotState(snapshot) });
  }

  return timeline.sort((left, right) => left.at - right.at);
}

function stateAtOrBefore(timeline: TimelinePoint[], cutoff: number): State | undefined {
  let result: State | undefined;
  for (const point of timeline) {
    if (point.at > cutoff) break;
    result = point.state;
  }
  return result;
}

function progressionFrom(current: State, baseline: State | undefined) {
  const value = (key: StatKey) => {
    const now = current[key] ?? 0;
    const then = baseline?.[key];
    return then === undefined ? 0 : now - then;
  };

  return {
    overall: value('overall'),
    pace: value('pace'),
    shooting: value('shooting'),
    passing: value('passing'),
    dribbling: value('dribbling'),
    defense: value('defense'),
    physical: value('physical'),
  };
}

async function main() {
  const db = await getDb();
  const now = new Date();
  const startedAt = now;
  const nowMs = now.getTime();

  const activePlayers = await db.select({
    id: players.id,
    overall: players.overall,
    pace: players.pace,
    shooting: players.shooting,
    passing: players.passing,
    dribbling: players.dribbling,
    defense: players.defense,
    physical: players.physical,
  }).from(players).where(eq(players.isRetired, false));

  console.log('[Derived progressions] ' + activePlayers.length + ' active players');
  let updated = 0;
  let missingBaseline = 0;

  const cutoffs = {
    WEEK: nowMs - 7 * DAY_MS,
    MONTH: nowMs - 30 * DAY_MS,
    CURRENT_SEASON: nowMs - SEASON_DAYS * DAY_MS,
  };

  for (let offset = 0; offset < activePlayers.length; offset += BATCH_SIZE) {
    const playerBatch = activePlayers.slice(offset, offset + BATCH_SIZE);
    const playerIds = playerBatch.map((player) => player.id);

    const [historyRows, snapshotRows] = await Promise.all([
      db.select({
        playerId: playerHistoryEvents.playerId,
        eventDate: playerHistoryEvents.eventDate,
        values: playerHistoryEvents.values,
      }).from(playerHistoryEvents)
        .where(and(
          inArray(playerHistoryEvents.playerId, playerIds),
          lte(playerHistoryEvents.eventDate, now),
        ))
        .orderBy(asc(playerHistoryEvents.playerId), asc(playerHistoryEvents.eventDate)),
      db.select({
        playerId: playerSnapshots.playerId,
        createdAt: playerSnapshots.createdAt,
        overall: playerSnapshots.overall,
        pace: playerSnapshots.pace,
        shooting: playerSnapshots.shooting,
        passing: playerSnapshots.passing,
        dribbling: playerSnapshots.dribbling,
        defense: playerSnapshots.defense,
        physical: playerSnapshots.physical,
      }).from(playerSnapshots)
        .where(and(
          inArray(playerSnapshots.playerId, playerIds),
          lte(playerSnapshots.createdAt, now),
        ))
        .orderBy(asc(playerSnapshots.playerId), asc(playerSnapshots.createdAt)),
    ]);

    const historyByPlayer = new Map<number, Array<(typeof historyRows)[number]>>();
    for (const row of historyRows) {
      const rows = historyByPlayer.get(row.playerId) || [];
      rows.push(row);
      historyByPlayer.set(row.playerId, rows);
    }

    const snapshotsByPlayer = new Map<number, Array<(typeof snapshotRows)[number]>>();
    for (const row of snapshotRows) {
      const rows = snapshotsByPlayer.get(row.playerId) || [];
      rows.push(row);
      snapshotsByPlayer.set(row.playerId, rows);
    }

    const values: Array<{
      playerId: number;
      interval: (typeof DERIVED_INTERVALS)[number];
      overall: number;
      pace: number;
      shooting: number;
      passing: number;
      dribbling: number;
      defense: number;
      physical: number;
      updatedAt: Date;
    }> = [];

    for (const player of playerBatch) {
      const timeline = timelineForPlayer(
        historyByPlayer.get(player.id) || [],
        snapshotsByPlayer.get(player.id) || [],
      );
      const current = currentState(player);
      const baselines = {
        WEEK: stateAtOrBefore(timeline, cutoffs.WEEK),
        MONTH: stateAtOrBefore(timeline, cutoffs.MONTH),
        CURRENT_SEASON: stateAtOrBefore(timeline, cutoffs.CURRENT_SEASON),
        ALL: timeline[0]?.state,
      };

      for (const interval of DERIVED_INTERVALS) {
        if (!baselines[interval]) missingBaseline++;
        values.push({
          playerId: player.id,
          interval,
          ...progressionFrom(current, baselines[interval]),
          updatedAt: now,
        });
      }
    }

    await db.insert(progressions).values(values).onDuplicateKeyUpdate({
      set: {
        overall: sql.raw('VALUES(overall)'),
        pace: sql.raw('VALUES(pace)'),
        shooting: sql.raw('VALUES(shooting)'),
        passing: sql.raw('VALUES(passing)'),
        dribbling: sql.raw('VALUES(dribbling)'),
        defense: sql.raw('VALUES(defense)'),
        physical: sql.raw('VALUES(physical)'),
        updatedAt: sql.raw('NOW()'),
      },
    });

    updated += values.length;
    if ((offset / BATCH_SIZE + 1) % 25 === 0 || offset + playerBatch.length === activePlayers.length) {
      console.log(
        '[Derived progressions] ' + Math.min(offset + playerBatch.length, activePlayers.length) +
        '/' + activePlayers.length + ' players'
      );
    }
  }

  // Remove derived-period rows left by retired players. The 24H rows are kept
  // intact because they are owned by the live MFL progression crawler.
  await db.delete(progressions).where(and(
    inArray(progressions.interval, [...DERIVED_INTERVALS]),
    lt(progressions.updatedAt, startedAt),
  ));

  console.log(
    '[Derived progressions] wrote ' + updated + ' rows; ' +
    missingBaseline + ' player-periods await history or an older snapshot'
  );
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('[Derived progressions] Fatal error:', error);
  process.exit(1);
});
