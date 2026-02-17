import type {
  MflPlayer,
  MflProgressionsResponse,
  ProgressionInterval,
} from '@/types/mfl';

const BASE_URL =
  process.env.MFL_API_URL ||
  'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';

/**
 * Fetch a single page of players from the MFL API.
 * Uses cursor-based pagination via `beforePlayerId`.
 */
export async function fetchPlayersPage(
  beforePlayerId?: number
): Promise<MflPlayer[]> {
  const params = new URLSearchParams({
    limit: '1500',
    excludingMflOwned: 'true',
  });

  if (beforePlayerId) {
    params.set('beforePlayerId', String(beforePlayerId));
  }

  const res = await fetch(`${BASE_URL}/players?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`MFL API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch progressions for a batch of player IDs.
 * The API accepts comma-separated IDs (max ~200 per request).
 */
export async function fetchProgressions(
  playerIds: number[],
  interval: ProgressionInterval = 'WEEK'
): Promise<MflProgressionsResponse> {
  if (playerIds.length === 0) return {};

  const params = new URLSearchParams({
    playersIds: playerIds.join(','),
    interval,
  });

  const res = await fetch(`${BASE_URL}/players/progressions?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`MFL Progressions API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
