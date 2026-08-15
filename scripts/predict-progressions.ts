/**
 * Retired-career nearest-neighbour model.
 *
 * Complete, sustained careers are used as training data. Each historical state
 * predicts the OVR still available until retirement, rather than replaying the
 * player's entire gain from minting. This keeps the target aligned with the
 * age and OVR of the player being viewed.
 *
 * The public MFL endpoints collected here do not expose match appearances,
 * minutes, or ratings. "Activity" below is therefore an observable-career
 * quality gate, never a claim that match participation is proven.
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
import { and, asc, gte, inArray, ne, sql } from 'drizzle-orm';

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
const MODEL_VERSION = 'knn-retired-official-pot-prior-v4';

// Official MFL guide distribution for the OVR-to-POT gap of players minted
// at age 24-25: 1-2=20%, 3-5=40%, 6-9=31%, 10-15=7%, 16+=2%.
// Midpoints give an indicative mean gap of about 5.5 OVR. Only P(gap>=10)
// is directly supported (9%); higher stored thresholds remain empirical.
const OFFICIAL_GUIDE_AGE = 24.5;
const OFFICIAL_MEAN_GAP = 5.5;
const OFFICIAL_PROBABILITY_GAIN_10 = 9;
const OFFICIAL_PRIOR_MAX_WEIGHT = 0.35;
const OFFICIAL_PRIOR_FADE_YEARS = 6;
const THRESHOLDS = [10, 15, 20, 25, 30] as const;
const MIN_NEIGHBOURS = 20;
const MAX_NEIGHBOURS = 200;
const MIN_CURVE_DAYS = 7;
const TARGET_CURVE_DAYS = 28;
const MAX_CURVE_DAYS = 56;
const TRAINING_BATCH_SIZE = 1_000;
const PREDICTION_BATCH_SIZE = 500;

// MFL seasons last six weeks. A player can retire from age 32 onwards, but the
// guide says most retire between 34 and 36. This intentionally conservative
// threshold avoids treating an ordinary mid-career player as terminal.
const RETIRED_AGE_FLOOR = 34;
const MIN_CAREER_AGE_SPAN = 2;
const MIN_ACTIVITY_SCORE = 70;
const SEASON_DAYS = 42;

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

type TrainingSample = Profile & {
  playerId: number;
  remainingGain: number;
  activityScore: number;
  retirementAge: number;
};

type Neighbour = TrainingSample & {
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

  const blendedChange = (to.overall - from.overall) * 0.6 + attributeChange * 0.4;
  return Number((blendedChange * 7 / days).toFixed(3));
}

function historyMomentum(points: HistoryPoint[], start: Profile, startDate: Date): number | undefined {
  const candidates = points
    .map((point) => ({
      point,
      days: (point.date.getTime() - startDate.getTime()) / 86_400_000,
    }))
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

  const week = observations.filter((observation) => observation.interval === 'WEEK').slice(-4);
  if (week.length) {
    return Number((week.reduce((sum, observation) => sum + signal(observation), 0) / week.length).toFixed(3));
  }

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
    age: 0,
    overall: snapshot.overall,
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

function activityScore(points: HistoryPoint[], start: Profile, end: Profile, startDate: Date): number {
  const careerSeasons = end.age - start.age;
  const careerDays = (points[points.length - 1].date.getTime() - startDate.getTime()) / 86_400_000;
  const distinctAges = new Set(
    points
      .map((point) => asNumber(point.state.age))
      .filter((age): age is number => age !== undefined)
  ).size;

  // A complete historical career should cover its season-age span, have
  // repeated progress records, and expose states across that span. These are
  // reliability signals only; they cannot certify individual match minutes.
  const calendarCoverage = Math.min(1, careerDays / Math.max(SEASON_DAYS, careerSeasons * SEASON_DAYS * 0.75));
  const recordDensity = Math.min(1, points.length / Math.max(8, careerSeasons * 4));
  const ageCoverage = Math.min(1, distinctAges / Math.max(1, careerSeasons + 1));
  return Math.round(100 * (calendarCoverage * 0.4 + recordDensity * 0.4 + ageCoverage * 0.2));
}

function isReliableRetiredCareer(
  points: HistoryPoint[],
  start: Profile,
  end: Profile,
  startDate: Date
): { eligible: boolean; activityScore: number } {
  const score = activityScore(points, start, end, startDate);
  return {
    eligible:
      end.age >= RETIRED_AGE_FLOOR &&
      end.age - start.age >= MIN_CAREER_AGE_SPAN &&
      score >= MIN_ACTIVITY_SCORE,
    activityScore: score,
  };
}

function buildTrainingSamples(
  playerId: number,
  points: HistoryPoint[],
  start: Profile,
  startDate: Date,
  end: Profile
): TrainingSample[] {
  const career = isReliableRetiredCareer(points, start, end, startDate);
  if (!career.eligible) return [];

  // One state per age keeps a player with many raw events from dominating the
  // training set. The first state of a season is the fairest comparison to a
  // player currently at that same age.
  const stateByAge = new Map<number, Profile>();
  for (const point of points) {
    const profile = profileFromState(point.state, start.position);
    if (!profile || profile.age > end.age || stateByAge.has(profile.age)) continue;
    stateByAge.set(profile.age, {
      ...profile,
      weeklyMomentum: historyMomentum(points, profile, point.date),
    });
  }

  return [...stateByAge.values()]
    .filter((profile) => profile.age < end.age && end.overall >= profile.overall)
    .map((profile) => ({
      ...profile,
      playerId,
      remainingGain: end.overall - profile.overall,
      activityScore: career.activityScore,
      retirementAge: end.age,
    }));
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
  return positionFamily(left) === positionFamily(right) ? 2 : 5;
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
    positionDistance(left.position, rigtype TrainingIndex = {
  all: TrainingSample[];
  byPosition: Map<string, TrainingSample[]>;
  playerCountsByPosition: Map<string, number>;
};

function buildTrainingIndex(samples: TrainingSample[]): TrainingIndex {
  const byPosition = new Map<string, TrainingSample[]>();
  const playerIdsByPosition = new Map<string, Set<number>>();

  for (const sample of samples) {
    if (!sample.position) continue;
    const position = sample.position;
    const positionSamples = byPosition.get(position) || [];
    positionSamples.push(sample);
    byPosition.set(position, positionSamples);

    const playerIds = playerIdsByPosition.get(position) || new Set<number>();
    playerIds.add(sample.playerId);
    playerIdsByPosition.set(position, playerIds);
  }

  return {
    all: samples,
    byPosition,
    playerCountsByPosition: new Map(
      [...playerIdsByPosition.entries()].map(([position, playerIds]) => [position, playerIds.size])
    ),
  };
}

function selectNeighbours(profile: Profile, index: TrainingIndex): Neighbour[] {
  const exactPosition = profile.position ? index.byPosition.get(profile.position) : undefined;
  const exactPlayerCount = profile.position
    ? index.playerCountsByPosition.get(profile.position) ?? 0
    : 0;
  const pool = exactPosition && exactPlayerCount >= MIN_NEIGHBOURS
    ? exactPosition
    : index.all;

  // Several states of the same retired player may be in the training set.
  // Keep only their closest state before sorting, avoiding a large temporary
  // array for every live player prediction.
  const closestByPlayer = new Map<number, Neighbour>();
  for (const sample of pool) {
    const candidate: Neighbour = { ...sample, distance: distance(profile, sample) };
    const previous = closestByPlayer.get(candidate.playerId);
    if (!previous || candidate.distance < previous.distance) {
      closestByPlayer.set(candidate.playerId, candidate);
    }
  }

  return [...closestByPlayer.values()]
    .sort((left, right) => left.distance - right.distance)
    .slice(0, MAX_NEIGHBOURS);
}
e);
    if (neighbours.length === MAX_NEIGHBOURS) break;
  }
  return neighbours;
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
    100 * weightedMean(neighbours, (neighbour) => neighbour.remainingGain >= threshold ? 1 : 0)
  );
}

function officialPriorWeight(age: number): number {
  const distance = Math.abs(age - OFFICIAL_GUIDE_AGE);
  return OFFICIAL_PRIOR_MAX_WEIGHT * Math.max(0, 1 - distance / OFFICIAL_PRIOR_FADE_YEARS);
}

function calibrateWithOfficialGuide(
  age: number,
  empiricalGain: number,
  empiricalProbabilities: number[]
): { gain: number; probabilities: number[] } {
  const priorWeight = officialPriorWeight(age);
  if (priorWeight === 0) {
    return { gain: empiricalGain, probabilities: empiricalProbabilities };
  }

  const gain = Math.max(
    0,
    Math.round(empiricalGain * (1 - priorWeight) + OFFICIAL_MEAN_GAP * priorWeight)
  );

  const empiricalGain10 = empiricalProbabilities[0];
  const calibratedGain10 = Math.round(
    empiricalGain10 * (1 - priorWeight) + OFFICIAL_PROBABILITY_GAIN_10 * priorWeight
  );

  // MFL does not publish exact +15/+20/+25/+30 probabilities. Preserve the
  // empirical tail shape and rescale it by the calibrated P(+10).
  const tailScale = empiricalGain10 > 0 ? calibratedGain10 / empiricalGain10 : 0;
  const probabilities = empiricalProbabilities.map((value, index) => {
    if (index === 0) return calibratedGain10;
    return Math.min(calibratedGain10, Math.max(0, Math.round(value * tailScale)));
  });

  // Enforce a valid survival curve: P(+N) can never rise with N.
  for (let index = 1; index < probabilities.length; index++) {
    probabilities[index] = Math.min(probabilities[index], probabilities[index - 1]);
  }

  return { gain, probabilities };
}

function confidence(neighbours: Neighbour[], hasCurve: boolean): number {
  const sampleCoverage = Math.min(1, neighbours.length / 100);
  const meanDistance = weightedMean(neighbours, (neighbour) => neighbour.distance);
  const similarity = Math.max(0, 1 - Math.min(30, meanDistance) / 30);
  const activityReliability = weightedMean(neighbours, (neighbour) => neighbour.activityScore) / 100;
  const curveCoverage = hasCurve ? 1 : 0.8;
  return Math.max(
    15,
    Math.min(
      95,
      Math.round(100 * (sampleCoverage * 0.5 + similarity * 0.3 + activityReliability * 0.2) * curveCoverage)
    )
  );
}

async function main() {
  const db = await getDb();
  const playerRows = await db.select({
    id: players.id,
    age: players.age,
    isRetired: players.isRetired,
    overall: players.overall,
    positions: players.positions,
    pace: players.pace,
    shooting: players.shooting,
    passing: players.passing,
    dribbling: players.dribbling,
    defense: players.defense,
    physical: players.physical,
    goalkeeping: players.goalkeeping,
  }).from(players);

  const playersById = new Map(playerRows.map((player) => [player.id, player]));

  // History is the largest table. Read only plausible completed-career
  // candidates and discard each batch as soon as its training states are built.
  // This keeps the predictor below the hosted runner's memory limit.
  const { trainingSamples, retiredCareerIds } = await (async () => {
    const samples: TrainingSample[] = [];
    const careerIds = new Set<number>();
    const candidateIds = playerRows
      .filter((player) => player.age >= RETIRED_AGE_FLOOR)
      .map((player) => player.id);

    for (let offset = 0; offset < candidateIds.length; offset += TRAINING_BATCH_SIZE) {
      const batchIds = candidateIds.slice(offset, offset + TRAINING_BATCH_SIZE);
      const historyRows = await db.select({
        playerId: playerHistoryEvents.playerId,
        eventDate: playerHistoryEvents.eventDate,
        values: playerHistoryEvents.values,
      }).from(playerHistoryEvents)
        .where(inArray(playerHistoryEvents.playerId, batchIds))
        .orderBy(asc(playerHistoryEvents.playerId), asc(playerHistoryEvents.eventDate));

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

      for (const [playerId, start] of starts) {
        const endState = states.get(playerId);
        const end = endState ? profileFromState(endState, start.profile.position) : null;
        if (!end) continue;

        const playerSamples = buildTrainingSamples(
          playerId,
          pointsByPlayer.get(playerId) || [],
          start.profile,
          start.date,
          end
        );
        if (playerSamples.length) {
          careerIds.add(playerId);
          samples.push(...playerSamples);
        }
      }

      if ((offset / TRAINING_BATCH_SIZE + 1) % 25 === 0 || offset + batchIds.length === candidateIds.length) {
        console.log(
          '[Predictor] Training history ' + Math.min(offset + batchIds.length, candidateIds.length) +
          '/' + candidateIds.length
        );
      }
    }

    return { trainingSamples: samples, retiredCareerIds: careerIds };
  })();

  if (retiredCareerIds.size < MIN_NEIGHBOURS) {
    throw new Error(
      '[Predictor] Need at least ' + MIN_NEIGHBOURS +
      ' reliable retired careers; found ' + retiredCareerIds.size
    );
  }

  const trainingIndex = buildTrainingIndex(trainingSamples);

  // Never present an old model as a current v4 prediction.
  await db.delete(playerPredictions)
    .where(ne(playerPredictions.modelVersion, MODEL_VERSION));

  const activePlayers = playerRows.filter((player) => !player.isRetired);
  let written = 0;
  let withCurve = 0;
  const recentSince = new Date(Date.now() - MAX_CURVE_DAYS * 86_400_000);

  // Fetch curve inputs and write predictions in bounded batches. Loading all
  // observations for all players was the source of the 4 GB heap failure.
  for (let offset = 0; offset < activePlayers.length; offset += PREDICTION_BATCH_SIZE) {
    const playerBatch = activePlayers.slice(offset, offset + PREDICTION_BATCH_SIZE);
    const playerIds = playerBatch.map((player) => player.id);
    const [snapshotRows, observationRows] = await Promise.all([
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
          gte(playerSnapshots.createdAt, recentSince),
        ))
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
        .where(and(
          inArray(progressionObservations.playerId, playerIds),
          gte(progressionObservations.observedAt, recentSince),
        ))
        .orderBy(asc(progressionObservations.playerId), asc(progressionObservations.observedAt)),
    ]);

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

    const values = [];
    for (const player of playerBatch) {
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

      const neighbours = selectNeighbours(profile, trainingIndex);
      if (neighbours.length < MIN_NEIGHBOURS) continue;

      const empiricalGain = Math.max(
        0,
        Math.round(weightedMean(neighbours, (neighbour) => neighbour.remainingGain))
      );
      const empiricalProbabilities = THRESHOLDS.map(
        (threshold) => probability(neighbours, threshold)
      );
      const calibrated = calibrateWithOfficialGuide(
        player.age,
        empiricalGain,
        empiricalProbabilities
      );
      const predictedGain = Math.min(99 - player.overall, calibrated.gain);
      const probabilities = calibrated.probabilities;

      values.push({
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
      });
    }

    if (values.length) {
      await db.insert(playerPredictions).values(values).onDuplicateKeyUpdate({
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
      written += values.length;
    }

    if ((offset / PREDICTION_BATCH_SIZE + 1) % 25 === 0 || offset + playerBatch.length === activePlayers.length) {
      console.log(
        '[Predictor] Predictions ' + Math.min(offset + playerBatch.length, activePlayers.length) +
        '/' + activePlayers.length
      );
    }
  }

  console.log(
    '[Predictor] ' + written + ' predictions from ' + retiredCareerIds.size +
    ' reliable retired careers (' + trainingSamples.length + ' training states); ' +
    withCurve + ' players have a recent curve (' + MODEL_VERSION + ')'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
