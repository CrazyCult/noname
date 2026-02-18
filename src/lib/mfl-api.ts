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
 * Fetch a single player by ID from the MFL API.
 * Returns the player metadata including individual stats.
 */
export async function fetchPlayerById(id: number): Promise<MflPlayer | null> {
  try {
    const res = await fetch(`${BASE_URL}/players/${id}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.player ?? null;
  } catch {
    return null;
  }
}

export interface PlayerLiveData {
  pace: number; shooting: number; passing: number;
  dribbling: number; defense: number; physical: number;
  goalkeeping: number;
  revenueShare: number;
  offerStatus: number;
}

/**
 * Fetch multiple players by IDs in parallel.
 * Returns a map of player ID → metadata stats + live revenueShare/offerStatus.
 */
export async function fetchPlayersStats(
  ids: number[]
): Promise<Record<number, PlayerLiveData>> {
  const results = await Promise.allSettled(ids.map(fetchPlayerById));
  const statsMap: Record<number, PlayerLiveData> = {};

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const p = result.value;
      statsMap[p.id] = {
        pace: p.metadata.pace ?? 0,
        shooting: p.metadata.shooting ?? 0,
        passing: p.metadata.passing ?? 0,
        dribbling: p.metadata.dribbling ?? 0,
        defense: p.metadata.defense ?? 0,
        physical: p.metadata.physical ?? 0,
        goalkeeping: p.metadata.goalkeeping ?? 0,
        revenueShare: p.activeContract?.revenueShare ?? 0,
        offerStatus: p.offerStatus ?? 0,
      };
    }
  }

  return statsMap;
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
