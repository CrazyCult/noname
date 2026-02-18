import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { playerSnapshots } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const db = await getDb();
    const result = await db
      .select({ lastSnapshot: sql<string>`MAX(${playerSnapshots.createdAt})` })
      .from(playerSnapshots);

    return NextResponse.json({
      lastSnapshot: result[0]?.lastSnapshot ?? null,
    });
  } catch (error) {
    console.error('API /status error:', error);
    return NextResponse.json({ lastSnapshot: null });
  }
}
