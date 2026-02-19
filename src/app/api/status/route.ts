import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT GREATEST(
        COALESCE((SELECT MAX(updated_at) FROM players), '1970-01-01'),
        COALESCE((SELECT MAX(updated_at) FROM progressions), '1970-01-01'),
        COALESCE((SELECT MAX(created_at) FROM player_snapshots), '1970-01-01')
      ) AS last_update
    `);

    const row = (result as any)[0]?.[0] ?? (result as any)[0];
    const lastUpdate = row?.last_update ?? null;

    return NextResponse.json({
      lastSnapshot: lastUpdate,
    });
  } catch (error) {
    console.error('API /status error:', error);
    return NextResponse.json({ lastSnapshot: null });
  }
}
