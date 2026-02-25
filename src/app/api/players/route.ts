import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { players, progressions } from '@/db/schema';
import { desc, asc, sql, eq, and } from 'drizzle-orm';
import type { PlayerRow, ProgressionInterval } from '@/types/mfl';
import { fetchPlayersStats } from '@/lib/mfl-api';
import { calculateAllPositionOvrs } from '@/lib/ovr-calculator';


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));
  const offset = (page - 1) * limit;

  const sortBy = searchParams.get('sortBy') || 'overall';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const search = searchParams.get('search') || '';
  const position = searchParams.get('position') || '';
  const minOverall = Number(searchParams.get('ovrMin')) || 0;
  const maxOverall = Number(searchParams.get('ovrMax')) || 0;
  const minAge = Number(searchParams.get('ageMin')) || 0;
  const maxAge = Number(searchParams.get('ageMax')) || 0;
  const interval = (searchParams.get('interval') as ProgressionInterval) || 'ALL';
  const progMinStr = searchParams.get('progMin') ?? '';
  const progMaxStr = searchParams.get('progMax') ?? '';
  const sortByProgression = sortBy === 'progression';

  try {
    const db = await getDb();

    // Build WHERE conditions
    const conditions = [];

    if (search) {
      conditions.push(
        sql`(${players.firstName} LIKE ${`%${search}%`} OR ${players.lastName} LIKE ${`%${search}%`})`
      );
    }

    if (position) {
      conditions.push(
        sql`JSON_CONTAINS(${players.positions}, ${JSON.stringify(position)})`
      );
    }

    if (minOverall > 0) {
      conditions.push(sql`${players.overall} >= ${minOverall}`);
    }
    if (maxOverall > 0) {
      conditions.push(sql`${players.overall} <= ${maxOverall}`);
    }
    if (minAge > 0) {
      conditions.push(sql`${players.age} >= ${minAge}`);
    }
    if (maxAge > 0) {
      conditions.push(sql`${players.age} <= ${maxAge}`);
    }

    // Progression OVR min/max filter
    if (progMinStr !== '') {
      const progMin = Number(progMinStr);
      conditions.push(
        sql`${players.id} IN (SELECT player_id FROM progressions WHERE \`interval\` = ${interval} AND overall >= ${progMin})`
      );
    }
    if (progMaxStr !== '') {
      const progMax = Number(progMaxStr);
      conditions.push(
        sql`${players.id} IN (SELECT player_id FROM progressions WHERE \`interval\` = ${interval} AND overall <= ${progMax})`
      );
    }

    const whereClause =
      conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

    // Count
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(players)
      .where(whereClause);
    const total = countResult[0].count;

    // ── Progression map ──
    const progressionMap: Record<number, {
      overall: number; pace: number; shooting: number;
      passing: number; dribbling: number; defense: number; physical: number;
    }> = {};

    let playerRows: (typeof players.$inferSelect)[];

    if (sortByProgression) {
      // LEFT JOIN with progressions to sort by progression overall
      const joinedRows = await db
        .select({
          id: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          overall: players.overall,
          age: players.age,
          positions: players.positions,
          nationalities: players.nationalities,
          ownerAddress: players.ownerAddress,
          ownerName: players.ownerName,
          revenueShare: players.revenueShare,
          clause: players.clause,
          listingPrice: players.listingPrice,
          updatedAt: players.updatedAt,
          progOverall: progressions.overall,
          progPace: progressions.pace,
          progShooting: progressions.shooting,
          progPassing: progressions.passing,
          progDribbling: progressions.dribbling,
          progDefense: progressions.defense,
          progPhysical: progressions.physical,
        })
        .from(players)
        .leftJoin(
          progressions,
          and(
            eq(progressions.playerId, players.id),
            eq(progressions.interval, interval),
          ),
        )
        .where(whereClause)
        .orderBy(
          sortOrder === 'desc'
            ? sql`COALESCE(${progressions.overall}, -2147483647) DESC`
            : sql`COALESCE(${progressions.overall}, 2147483647) ASC`,
        )
        .limit(limit)
        .offset(offset);

      // Build progressionMap from joined data & extract player rows
      playerRows = joinedRows.map((row) => {
        if (row.progOverall !== null) {
          progressionMap[row.id] = {
            overall: row.progOverall ?? 0,
            pace: row.progPace ?? 0,
            shooting: row.progShooting ?? 0,
            passing: row.progPassing ?? 0,
            dribbling: row.progDribbling ?? 0,
            defense: row.progDefense ?? 0,
            physical: row.progPhysical ?? 0,
          };
        }
        return {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          overall: row.overall,
          age: row.age,
          positions: row.positions,
          nationalities: row.nationalities,
          ownerAddress: row.ownerAddress,
          ownerName: row.ownerName,
          revenueShare: row.revenueShare,
          clause: row.clause,
          listingPrice: row.listingPrice,
          updatedAt: row.updatedAt,
        };
      });
    } else {
      // Standard sort path
      const sortColumn = (() => {
        switch (sortBy) {
          case 'id': return players.id;
          case 'name':
          case 'firstName': return players.firstName;
          case 'lastName': return players.lastName;
          case 'age': return players.age;
          case 'ownerName': return players.ownerName;
          case 'revenueShare': return players.revenueShare;
          case 'clause': return players.clause;
          case 'listingPrice': return players.listingPrice;
          default: return players.overall;
        }
      })();

      const orderFn = sortOrder === 'asc' ? asc : desc;

      playerRows = await db
        .select()
        .from(players)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      // Fetch progression data separately
      const playerIds = playerRows.map((p) => p.id);
      if (playerIds.length > 0) {
        const idsJoin = sql.join(playerIds.map((id) => sql`${id}`), sql`, `);

        const progRows = await db
          .select()
          .from(progressions)
          .where(
            sql`${progressions.playerId} IN (${idsJoin}) AND ${progressions.interval} = ${interval}`
          );

        for (const row of progRows) {
          progressionMap[row.playerId] = {
            overall: row.overall ?? 0,
            pace: row.pace ?? 0,
            shooting: row.shooting ?? 0,
            passing: row.passing ?? 0,
            dribbling: row.dribbling ?? 0,
            defense: row.defense ?? 0,
            physical: row.physical ?? 0,
          };
        }
      }
    }

    const playerIds = playerRows.map((p) => p.id);

    // ── Fetch absolute stats from MFL API for OVR calculation ──
    const statsMap = playerIds.length > 0 ? await fetchPlayersStats(playerIds) : {};

    // ── Write-back: persist live values to DB for global sorting ──
    const liveEntries = Object.entries(statsMap);
    if (liveEntries.length > 0) {
      Promise.allSettled(
        liveEntries.map(([idStr, live]) =>
          db.update(players)
            .set({
              revenueShare: live.revenueShare,
              clause: live.clause,
              listingPrice: live.listingPrice,
            })
            .where(eq(players.id, Number(idStr)))
        )
      ).catch(() => {});
    }

    // Build response with pre-computed position OVRs
    const data: PlayerRow[] = playerRows.map((p) => {
      const prog = progressionMap[p.id];
      const positions = (p.positions as string[]) ?? [];
      const stats = statsMap[p.id] ?? null;

      const positionOvrs = calculateAllPositionOvrs(
        positions,
        p.overall,
        stats,
      );

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        overall: p.overall,
        age: p.age,
        positions,
        nationalities: (p.nationalities as string[]) ?? [],
        ownerName: p.ownerName,
        revenueShare: stats?.revenueShare ?? p.revenueShare ?? 0,
        clause: stats?.clause ?? p.clause ?? 0,
        listingPrice: stats?.listingPrice ?? p.listingPrice ?? null,
        progression: prog || undefined,
        positionOvrs: positionOvrs.map(({ position, ovr }) => ({ position, ovr })),
      };
    });

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('API /players error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
