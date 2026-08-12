/** Explainable nearest-neighbour baseline built from completed MFL trajectories. */
import 'dotenv/config';
import { getDb } from '../src/db';
import { players, playerHistoryEvents, playerPredictions } from '../src/db/schema';
import { asc, sql } from 'drizzle-orm';

type State = { age?: number; overall?: number };
type Trajectory = { playerId: number; initialAge: number; initialOverall: number; finalGain: number };
const MODEL_VERSION = 'knn-history-v1';
const THRESHOLDS = [10, 15, 20, 25, 30] as const;

async function main() {
  const db = await getDb();
  const rows = await db.select().from(playerHistoryEvents)
    .orderBy(asc(playerHistoryEvents.playerId), asc(playerHistoryEvents.eventDate));
  const states = new Map<number, State>();
  const starts = new Map<number, Required<State>>();
  for (const row of rows) {
    const state = states.get(row.playerId) || {};
    Object.assign(state, row.values);
    states.set(row.playerId, state);
    if (!starts.has(row.playerId) && state.age && state.overall) starts.set(row.playerId, { age: state.age, overall: state.overall });
  }
  const trajectories: Trajectory[] = [];
  for (const [playerId, start] of starts) {
    const end = states.get(playerId);
    if (end?.overall && end.age && end.age > start.age) {
      trajectories.push({ playerId, initialAge: start.age, initialOverall: start.overall, finalGain: end.overall - start.overall });
    }
  }

  const current = await db.select({ id: players.id, age: players.age, overall: players.overall }).from(players);
  let written = 0;
  for (const player of current) {
    const neighbours = trajectories
      .filter((t) => t.playerId !== player.id)
      .map((t) => ({ ...t, distance: Math.abs(t.initialAge - player.age) * 3 + Math.abs(t.initialOverall - player.overall) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 200);
    if (neighbours.length < 20) continue;
    const gains = neighbours.map((n) => n.finalGain).sort((a, b) => a - b);
    const predictedGain = Math.round(gains.reduce((sum, gain) => sum + gain, 0) / gains.length);
    const probabilities = THRESHOLDS.map((threshold) => Math.round(100 * gains.filter((gain) => gain >= threshold).length / gains.length));
    const confidence = Math.min(100, Math.round(neighbours.length / 2));
    const value = {
      playerId: player.id, predictedGain, predictedOverall: player.overall + predictedGain,
      probabilityGain10: probabilities[0], probabilityGain15: probabilities[1], probabilityGain20: probabilities[2],
      probabilityGain25: probabilities[3], probabilityGain30: probabilities[4], sampleSize: neighbours.length,
      confidence, modelVersion: MODEL_VERSION, updatedAt: new Date(),
    };
    await db.insert(playerPredictions).values(value).onDuplicateKeyUpdate({ set: {
      predictedGain: sql`VALUES(${playerPredictions.predictedGain})`, predictedOverall: sql`VALUES(${playerPredictions.predictedOverall})`,
      probabilityGain10: sql`VALUES(${playerPredictions.probabilityGain10})`, probabilityGain15: sql`VALUES(${playerPredictions.probabilityGain15})`,
      probabilityGain20: sql`VALUES(${playerPredictions.probabilityGain20})`, probabilityGain25: sql`VALUES(${playerPredictions.probabilityGain25})`,
      probabilityGain30: sql`VALUES(${playerPredictions.probabilityGain30})`, sampleSize: sql`VALUES(${playerPredictions.sampleSize})`,
      confidence: sql`VALUES(${playerPredictions.confidence})`, modelVersion: sql`VALUES(${playerPredictions.modelVersion})`, updatedAt: sql`NOW()`,
    } });
    written++;
  }
  console.log(`[Predictor] ${written} predictions from ${trajectories.length} historical trajectories (${MODEL_VERSION})`);
}

main().catch((error) => { console.error(error); process.exit(1); });
