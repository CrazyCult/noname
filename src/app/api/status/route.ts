import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();

    // Compteurs OVR >= 1 par intervalle (depuis progressions)
    const intervalRows = await db.execute(sql`
      SELECT
        \`interval\`,
        COUNT(*) AS total_players,
        SUM(CASE WHEN overall >= 1 THEN 1 ELSE 0 END) AS players_progressed,
        MAX(updated_at) AS last_updated
      FROM progressions
      GROUP BY \`interval\`
    `);
    const intervalData = (intervalRows as any)[0] ?? intervalRows;

    const intervals: Record<string, { totalPlayers: number; playersProgressed: number; lastUpdated: string | null }> = {};
    for (const row of intervalData as any[]) {
      intervals[row.interval] = {
        totalPlayers: Number(row.total_players ?? 0),
        playersProgressed: Number(row.players_progressed ?? 0),
        lastUpdated: row.last_updated ? new Date(row.last_updated).toISOString() : null,
      };
    }

    // 5 derniers crawls terminés
    const logsRows = await db.execute(sql`
      SELECT id, type, \`interval\`, started_at, finished_at, players_processed, players_progressed, status
      FROM crawl_logs
      WHERE status != 'running'
      ORDER BY started_at DESC
      LIMIT 5
    `);
    const logsData = (logsRows as any)[0] ?? logsRows;

    const recentCrawls = (logsData as any[]).map((row) => ({
      id: row.id,
      type: row.type,
      interval: row.interval ?? null,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? null,
      playersProcessed: Number(row.players_processed ?? 0),
      playersProgressed: Number(row.players_progressed ?? 0),
      status: row.status,
    }));

    // Crawl en cours ?
    const runningRows = await db.execute(sql`
      SELECT id, type, \`interval\`, started_at
      FROM crawl_logs
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `);
    const runningData = (runningRows as any)[0] ?? runningRows;
    const running = (runningData as any[])[0] ?? null;
    const currentCrawl = running ? {
      type: running.type,
      interval: running.interval ?? null,
      startedAt: running.started_at,
    } : null;

    return NextResponse.json({ intervals, recentCrawls, currentCrawl });
  } catch (error) {
    console.error('API /status error:', error);
    return NextResponse.json({ intervals: {}, recentCrawls: [], currentCrawl: null });
  }
}
