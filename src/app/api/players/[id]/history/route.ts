import { NextRequest, NextResponse } from 'next/server';
import { filterHistoryByInterval, type HistoryInterval } from '@/lib/history-filter';
import type { PlayerHistory } from '@/types/mfl';

const MFL_API_URL =
  process.env.MFL_API_URL ||
  'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const playerId = params.id;
  const searchParams = request.nextUrl.searchParams;
  const interval = (searchParams.get('interval') || 'ALL') as HistoryInterval;

  try {
    const url = `${MFL_API_URL}/players/${playerId}/experiences/history`;
    
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch player history' },
        { status: res.status }
      );
    }

    const fullHistory: PlayerHistory = await res.json();
    const filteredHistory = filterHistoryByInterval(fullHistory, interval);

    return NextResponse.json({
      playerId: Number(playerId),
      interval,
      total: fullHistory.length,
      filtered: filteredHistory.length,
      history: filteredHistory,
    });
  } catch (error) {
    console.error('Error fetching player history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}