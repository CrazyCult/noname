import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { playerPredictions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }
  const db = await getDb();
  const [prediction] = await db.select().from(playerPredictions)
    .where(eq(playerPredictions.playerId, playerId)).limit(1);
  if (!prediction) return NextResponse.json({ error: 'Prediction unavailable' }, { status: 404 });
  return NextResponse.json(prediction, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
