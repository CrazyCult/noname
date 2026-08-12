import type {
  MflPlayer,
  MflPlayerResponse,
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
    // Keep MFL-owned/development players: excluding them biases the historical
    // training population and can hide newly minted players.
    excludingMflOwned: 'false',
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
 * Returns player + optional listing data.
 */
export async function fetchPlayerById(id: number): Promise<MflPlayerResponse | null> {
  try {
    const res = await fetch(`${BASE_URL}/players/${id}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.player) return null;
    return data as MflPlayerResponse;
  } catch {
    return null;
  }
}

export interface PlayerLiveData {
  pace: number; shooting: number; passing: number;
  dribbling: number; defense: number; physical: number;
  goalkeeping: number;
  revenueShare: number;
  clause: number;
  listingPrice: number | null;
}

/**
 * Fetch multiple players by IDs in batches of 10 to avoid rate-limiting.
 * Returns a map of player ID â†’ stats + live contract/listing data.
 */
export async function fetchPlayersStats(
  ids: number[]
): Promise<Record<number, PlayerLiveData>> {
  const statsMap: Record<number, PlayerLiveData> = {};
  const BATCH_SIZE = 10;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchPlayerById));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { player: p, listing } = result.value;
        const rs = p.activeContract?.revenueShare ?? 0;
        const totalLocked = p.activeContract?.totalRevenueShareLocked ?? 0;
        statsMap[p.id] = {
          pace: p.metadata.pace ?? 0,
          shooting: p.metadata.shooting ?? 0,
          passing: p.metadata.passing ?? 0,
          dribbling: p.metadata.dribbling ?? 0,
          defense: p.metadata.defense ?? 0,
          physical: p.metadata.physical ?? 0,
          goalkeeping: p.metadata.goalkeeping ?? 0,
          revenueShare: rs,
          clause: totalLocked - rs,
          listingPrice: listing?.status === 'AVAILABLE' ? listing.price : null,
        };
      }
    }

    // Small delay between batches to avoid rate-limiting
    if (i + BATCH_SIZE < ids.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return statsMap;
}

/**
 * Fetch progressions for a batch of player IDs.
 * The API accepts comma-separated IDs (max ~200 per request).
 *
 * For time-based intervals (24H, WEEK, MONTH) the API requires a `minDate`
 * unix timestamp in milliseconds â€” passing `interval=24H` returns the same
 * data as WEEK or CURRENT_SEASON (API limitation).
 * For CURRENT_SEASON and ALL the `interval` query param is used as-is.
 */
export async function fetchProgressions(
  playerIds: number[],
  interval: ProgressionInterval = 'WEEK'
): Promise<MflProgressionsResponse> {
  if (playerIds.length === 0) return {};

  const params = new URLSearchParams({ playersIds: playerIds.join(',') });

  const now = Date.now();
  switch (interval) {
    case '24H':
      params.set('minDate', String(now - 24 * 60 * 60 * 1000));
      break;
    case 'WEEK':
      params.set('minDate', String(now - 7 * 24 * 60 * 60 * 1000));
      break;
    case 'MONTH':
      params.set('minDate', String(now - 30 * 24 * 60 * 60 * 1000));
      break;
    default:
      // CURRENT_SEASON, ALL â†’ native interval param
      params.set('interval', interval);
  }

  const res = await fetch(`${BASE_URL}/players/progressions?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`MFL Progressions API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
