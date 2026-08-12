/**
 * Explainable nearest-neighbour model built from completed MFL trajectories.
 *
 * It matches players on age, OVR, primary-position family, the six attributes,
 * and the observed short-term progression curve. Minutes and match ratings are
 * deliberately excluded: they are not returned by the MFL endpoints we ingest.
 */
import 'dotenv/config';
import { getDb } from '../src/db';
import {
  players,
  playerHistoryEvents,
  playerPredictions,
  playerSnapshots,
  progressionObservations,
} from '../src/db/schema';
import { asc, gte, sql } from 'drizzle-orm';

const ATTRIBUTE_KEYS = [
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defense',
  'physical',
  'goalkeeping',
] as const;
const STATE_KEYS = ['age', 'overall', ...ATTRIBUTE_KEYS] as const;
const MODEL_VERSION = 'knn-profile-curve-v2';
const THRESHOLDS = [10, 15, 20, 25, 30] as const;
const MIN_NEIGHBOURS = 20;
const MAX_NEIGHBOURS = 200;
const MIN_CURVE_DAYS = 7;
const TARGET_CURVE_DAYS = 28;
const MAX_CURVE_DAYS = 56;

type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
type StateKey = (typeof STATE_KEYS)[number];
type State = Partial<Record<StateKey, number>>;
type Stats = Partial<Record<AttributeKey, number>>;

type Profile = {
  age: number;
  overall: number;
  position?: string;
  stats: Stats;
  weeklyMomentum?: number;
};

type HistoryPoint = {
  date: Date;
  state: State;
};

type Trajectory = Profile & {
  playerId: number;
  finalGain: number;
};

type Neighbour = Trajectory & {
  distance: number;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function copyKnownValues(state: State, values: Record<string, number>): void {
  for (const key of STATE_KEYS) {
    const value = asNumber(values[key]);
    if (value !== undefined) state[key] = value;
  }
}

function primaryPosition(positions: string[] | null): string | undefined {
  return positions?.[0]?.trim().toUpperCase() || undefined;
}

function positionFamily(position?: string): 'GK' | 'DEF' | 'MID' | 'ATT' | undefined {
  if (!position) return undefined;
  if (position === 'GK' || position.includes('KEEP')) return 'GK';
  if (
    position.includes('BACK') ||
    position.includes('DEF') ||
    position === 'CB' ||
    position === 'LB' ||
    position === 'RB'
  ) return 'DEF';
  if (position.includes('MID') || position === 'CM' || position === 'CDM' || position === 'CAM') return 'MID';
  return 'ATT';
}

function profileFromState(
  state: State,
  position?: string,
  weeklyMomentum?: number
): Profile | null {
  const age = asNumber(state.age);
  const overall = asNumber(state.overall);
  if (age === undefined || overall === undefined) return null;

  const stats: Stats = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = asNumber(state[key]);
    if (value !== undefined) stats[key] = value;
  }

  return { age, overall, position, stats, weeklyMomentum };
}

function profileMomentum(from: Profile, to: Profile, days: number): number | undefined {
  if (days < MIN_CURVE_DAYS) return undefined;

  const attributeChanges = ATTRIBUTE_KEYS
    .map((key) => {
      const start = from.stats[key];
      const end = to.stats[key];
      return start === undefined || end === undefined ? undefined : end - start;
    })
    .filter((change): change is number => change !== undefined);

  const attributeChange = attributeChanges.length
    ? attributeChanges.reduce((sum, change) => sum + change, 0) / attributeChanges.length
    : to.overall - from.overall;

  // OVR carries more product meaning while the attributes retain the shape of
  // the player's development. Normalising to one week makes 7-56 day curves comparable.
  const blendedChange = (to.overall - from.overall) * 0.6 + attributeChange * 0.4;
  return Number((blendedChange * 7 / days).toFixed(3));
}

function historyMomentum(points: HistoryPoint[], start: Profile, startDate: Date): number | undefined {
  const candidates = points
    .map((point) => {
      const days = (point.date.getTime() - startDate.getTime()) / 86_400_000;
      return { point, days };
    })
    .filter(({ days }) => days >= MIN_CURVE_DAYS && days <= MAX_CURVE_DAYS)
    .sort((a, b) => Math.abs(a.days - TARGET_CURVE_DAYS) - Math.abs(b.days - TARGET_CURVE_DAYS));

  if (!candidates.length) return undefined;
  const selected = candidates[0];
  const end = profileFromState(selected.point.state, start.position);
  return end ? profileMomentum(start, end, selected.days) : undefined;
}

function observationMomentum(
  observations: Array<{
    interval: string;
    overall: number | null;
    pace: number | null;
    shooting: number | null;
    passing: number | null;
    dribbling: number | null;
    defense: number | null;
    physical: number | null;
  }>
): number | undefined {
  const signal = (observation: (typeof observations)[number]) => {
    const attributes = [
      observation.pace,
      observation.shooting,
      observation.passing,
      observation.dribbling,
      observation.defense,
      observation.physical,
    ].map(asNumber).filter((value): value is number => value !== undefined);
    const averageAttributeGain = attributes.length
      ? attributes.reduce((sum, value) => sum + value, 0) / attributes.length
      : asNumber(observation.overall) ?? 0;
    return (asNumber(observation.overall) ?? 0) * 0.6 + averageAttributeGain * 0.4;
  };

  // WEEK is the direct MFL progression curve. Keep several observations to
  // smooth a one-off event; use 24H only while a weekly curve is unavailable.
  const week = observations.filter((observation) => observation.interval === 'WEEK').slice(-4);
  if (week.length) return Number((week.reduce((sum, observation) => sum + signal(observation), 0) / week.length).toFixed(3));

  const day = observations.filter((observation) => observation.interval === '24H').slice(-4);
  if (!day.length) return undefined;
  return Number((day.reduce((sum, observation) => sum + signal(observation), 0) / day.length * 7).toFixed(3));
}

function snapshotMomentum(
  snapshots: Array<{
    createdAt: Date;
    overall: number;
    pace: number | null;
    shooting: number | null;
    passing: number | null;
    dribbling: number | null;
    defense: number | null;
    physical: number | null;
  }>,
  position?: string
): number | undefined {
  if (snapshots.length < 2) return undefined;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const days = (last.createdAt.getTime() - first.createdAt.getTime()) / 86_400_000;
  if (days < MIN_CURVE_DAYS) return undefined;

  const toState = (snapshot: (typeof snapshots)[number]): State => ({
    overall: snapshot.overall,
    age: 0,
    pace: snapshot.pace ?? undefined,
    shooting: snapshot.shooting ?? undefined,
    passing: snapshot.passing ?? undefined,
    dribbling: snapshot.dribbling ?? undefined,
    defense: snapshot.defense ?? undefined,
    physical: snapshot.physical ?? undefined,
  });
  const from = profileFromState(toState(first), position);
  const to = profileFromState(toState(last), position);
  return from && to ? profileMomentum(from, to, days) : undefined;
}

function statDistance(left: Stats, right: Stats): number {
  const differences = ATTRIBUTE_KEYS
    .map((key) => {
      const a = left[key];
      const b = right[key];
      return a === undefined || b === undefined ? undefined : Math.abs(a - b);
    })
    .filter((difference): difference is number => difference !== undefined);

  return differences.length
    ? differences.reduce((sum, difference) => sum + difference, 0) / differences.length
    : 0;
}

function positionDistance(left?: string, right?: string): number {
  if (!left || !right) return 0;
  if (left === right) return 0;
  return positionFamily(left) === positionFamily(right) ? 1.5 : 4;
}

function curveDistance(left?: number, right?: number): number {
  if (left === undefined || right === undefined) return 0.75;
  return Math.min(8, Math.abs(left - right)) * 0.8;
}

function distance(left: Profile, right: Profile): number {
  return (
    Math.abs(left.age - right.age) * 3 +
    Math.abs(left.overall - right.overall) * 1.75 +
    statDistance(left.stats, right.stats) * 0.6 +
    positionDistance(left.position, right.position) +
    curveDistance(left.weeklyMomentum, right.weeklyMomentum)
  );
}

function weight(neighbour: Neighbour): number {
  return 1 / (1 + neighbour.distance);
}

function weightedMean(neighbours: Neighbour[], value: (neighbour: Neighbour) => number): number {
  const denominator = neighbours.reduce((sum, neighbour) => sum + weight(neighbour), 0);
  if (!denominator) return 0;
  return neighbours.reduce((sum, neighbour) => sum + value(neighbour) * weight(neighbour), 0) / denominator;
}

function probability(neighbours: Neighbour[], threshold: number): number {
  return Math.round(
    100 * weightedMean(neighbours, (neighbour) => neighbour.finalGain >= threshold ? 1 : 0)
  );
}

function confidence(neighbours: Neighbour[], hasCurve: boolean): number {
  const sampleCoverage = Math.min(1, neighbours.length / 100);
  const meanDistance = weightedMean(neighbours, (neighbour) => neighbour.distance);
  const similarity = Math.max(0, 1 - Math.min(30, meanDistance) / 30);
  const curveCoverage = hasCurve ? 1 : 0.8;
  return Math.max(15, Math.min(95, Math.round(100 * (sampleCoverage * 0.6 + similarity * 0.4) * curveCoverage)));
}

async function main() {
  const db = await getDb();
  const [historyRows, playerRows, snapshotRows, observationRows] = await Promise.all([
    db.select({
      playerId: playerHistoryEvents.playerId,
      eventDate: playerHistoryEvents.eventDate,
      values: playerHistoryEvents.values,
    }).from(playerHistoryEvents)
      .orderBy(asc(playerHistoryEvents.playerId), asc(playerHistoryEvents.eventDate)),
    db.select({
      id: players.id,
      age: players.age,
      overall: players.overall,
      positions: players.positions,
      pace: players.pace,
      shooting: players.shooting,
      passing: players.passing,
      dribbling: players.dribbling,
      defense: players.defense,
      physical: players.physical,
      goalkeeping: players.goalkeeping,
    }).from(players),
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
      .where(gte(playerSnapshots.createdAt, new Date(Date.now() - MAX_CURVE_DAYS * 86_400_000)))
      .orderBy(asc(playerSnapshots.playerId), asc(playerSnapshots.createdAt)),
    db.select({
      playerId: progressionObservations.playerId,
      interval: progressionObservations.interval,
      overall: progressionObservations.overall,
      pace: progressionObservations.pace,
      shooting: progressionObservations.shooting,
      passing: progressionObservations.passing,
      dribbling: progressionObservations.dribbling,
      defense: progressionObservations.defense,
      physical: progressionObservations.physical,
      observedAt: progressionObservations.observedAt,
    }).from(progressionObservations)
      .where(gte(progressionObservations.observedAt, new Date(Date.now() - MAX_CURVE_DAYS * 86_400_000)))
      .orderBy(asc(progressionObservations.playerId), asc(progressionObservations.observedAt)),
  ]);

  const playersById = new Map(playerRows.map((player) => [player.id, player]));
  const pointsByPlayer = new Map<number, HistoryPoint[]>();
  const states = new Map<number, State>();
  const starts = new Map<number, { profile: Profile; date: Date }>();

  for (const row of historyRows) {
    const state = { ...(states.get(row.playerId) || {}) };
    copyKnownValues(state, row.values);
    states.set(row.playerId, state);

    const date = new Date(row.eventDate);
    const points = pointsByPlayer.get(row.playerId) || [];
    points.push({ date, state: { ...state } });
    pointsByPlayer.set(row.playerId, points);

    if (!starts.has(row.playerId)) {
      const position = primaryPosition(playersById.get(row.playerId)?.positions ?? null);
      const start = profileFromState(state, position);
      if (start) starts.set(row.playerId, { profile: start, date });
    }
  }

  const trajectories: Trajectory[] = [];
  for (const [playerId, start] of starts) {
    const endState = states.get(playerId);
    const end = endState
      ? profileFromState(endState, start.profile.position)
      : null;
    if (!end || end.age <= start.profile.age) continue;

    const weeklyMomentum = historyMomentum(
      pointsByPlayer.get(playerId) || [],
      start.profile,
      start.date
    );
    trajectories.push({
      ...start.profile,
      weeklyMomentum,
      playerId,
      finalGain: end.overall - start.profile.overall,
    });
  }

  const snapshotsByPlayer = new Map<number, Array<(typeof snapshotRows)[number]>>();
  for (const snapshot of snapshotRows) {
    const list = snapshotsByPlayer.get(snapshot.playerId) || [];
    list.push(snapshot);
    snapshotsByPlayer.set(snapshot.playerId, list);
  }

  const observationsByPlayer = new Map<number, Array<(typeof observationRows)[number]>>();
  for (const observation of observationRows) {
    const list = observationsByPlayer.get(observation.playerId) || [];
    list.push(observation);
    observationsByPlayer.set(observation.playerId, list);
  }

  let written = 0;
  let withCurve = 0;
  for (const player of playerRows) {
    const position = primaryPosition(player.positions);
    const weeklyMomentum = observationMomentum(observationsByPlayer.get(player.id) || [])
      ?? snapshotMomentum(snapshotsByPlayer.get(player.id) || [], position);
    if (weeklyMomentum !== undefined) withCurve++;

    const profile: Profile = {
      age: player.age,
      overall: player.overall,
      position,
      stats: {
        pace: player.pace ?? undefined,
        shooting: player.shooting ?? undefined,
        passing: player.passing ?? undefined,
        dribbling: player.dribbling ?? undefined,
        defense: player.defense ?? undefined,
        physical: player.physical ?? undefined,
        goalkeeping: player.goalkeeping ?? undefined,
      },
      weeklyMomentum,
    };

    const neighbours = trajectories
      .filter((trajectory) => trajectory.playerId !== player.id)
      .map((trajectory) => ({ ...trajectory, distance: distance(profile, trajectory) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_NEIGHBOURS);

    if (neighbours.length < MIN_NEIGHBOURS) continue;

    const predictedGain = Math.max(0, Math.round(weightedMean(neighbours, (neighbour) => neighbour.finalGain)));
    const probabilities = THRESHOLDS.map((threshold) => probability(neighbours, threshold));
    const value = {
      playerId: player.id,
      predictedGain,
      predictedOverall: player.overall + predictedGain,
      probabilityGain10: probabilities[0],
      probabilityGain15: probabilities[1],
      probabilityGain20: probabilities[2],
      probabilityGain25: probabilities[3],
      probabilityGain30: probabilities[4],
      sampleSize: neighbours.length,
      confidence: confidence(neighbours, weeklyMomentum !== undefined),
      modelVersion: MODEL_VERSION,
      updatedAt: new Date(),
    };

    await db.insert(playerPredictions).values(value).onDuplicateKeyUpdate({
      set: {
        predictedGain: sql.raw('VALUES(predicted_gain)'),
        predictedOverall: sql.raw('VALUES(predicted_overall)'),
        probabilityGain10: sql.raw('VALUES(probability_gain_10)'),
        probabilityGain15: sql.raw('VALUES(probability_gain_15)'),
        probabilityGain20: sql.raw('VALUES(probability_gain_20)'),
        probabilityGain25: sql.raw('VALUES(probability_gain_25)'),
        probabilityGain30: sql.raw('VALUES(probability_gain_30)'),
        sampleSize: sql.raw('VALUES(sample_size)'),
        confidence: sql.raw('VALUES(confidence)'),
        modelVersion: sql.raw('VALUES(model_version)'),
        updatedAt: sql.raw('NOW()'),
      },
    });
    written++;
  }

  console.log(
    '[Predictor] ' + written + ' predictions from ' + trajectories.length +
    ' historical trajectories; ' + withCurve + ' players have a recent curve (' + MODEL_VERSION + ')'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
