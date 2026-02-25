import { NextRequest, NextResponse } from 'next/server';

const MFL_API_URL =
  process.env.MFL_API_URL ||
  'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';

export interface ListingResult {
  playerId: number;
  listingPrice: number | null;
  sellerName?: string;
}

/**
 * POST /api/players/listings
 * Body: { ids: number[] }
 * Checks MFL API for active listings for the given player IDs.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = body.ids ?? [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 });
    }

    const BATCH_SIZE = 10;
    const results: ListingResult[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (id) => {
          const res = await fetch(`${MFL_API_URL}/players/${id}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return { playerId: id, listingPrice: null };
          const data = await res.json();
          const listing = data.listing;
          return {
            playerId: id,
            listingPrice: listing?.status === 'AVAILABLE' ? listing.price : null,
            sellerName: listing?.sellerName ?? undefined,
          } as ListingResult;
        })
      );

      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
      }

      if (i + BATCH_SIZE < ids.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[listings] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
