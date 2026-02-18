import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { players, progressions, playerSnapshots } from '@/db/schema';
import { desc, asc, sql } from 'drizzle-orm';
import type { PlayerRow, ProgressionInterval } from '@/types/mfl';

function getStartDate(interval: ProgressionInterval): Date {
  const now = new Date();
  switch (interval) {
    case '24H':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'WEEK':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'MONTH':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'CURRENT_SEASON': {
      const currentMonth = now.getMonth();
      const seasonStartYear = currentMonth < 9 ? now.getFullYear() - 1 : now.getFullYear();
      return new Date(seasonStartYear, 9, 1);
    }
    case 'ALL':
    default:
      return new Date('2020-01-01');
  }
}

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

    // Progression min/max filter (subquery on progressions table)
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

    // Sort column
    const sortColumn = (() => {
      switch (sortBy) {
        case 'id': return players.id;
        case 'name':
        case 'firstName': return players.firstName;
        case 'lastName': return players.lastName;
        case 'age': return players.age;
        default: return players.overall;
      }
    })();

    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Fetch players
    const playerRows = await db
      .select()
      .from(players)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset);

    const playerIds = playerRows.map((p) => p.id);

    // ── Progression data ──
    const progressionMap: Record<number, {
      overall: number; pace: number; shooting: number;
      passing: number; dribbling: number; defense: number; physical: number;
    }> = {};

    // ── Latest snapshot stats (for OVR calculation per position) ──
    const statsMap: Record<number, {
      pace: number; shooting: number; passing: number;
      dribbling: number; defense: number; physical: number;
    }> = {};

    if (playerIds.length > 0) {
      const idsJoin = sql.join(playerIds.map((id) => sql`${id}`), sql`, `);

      // Fetch latest snapshots for individual stats
      const latestSnapshots = await db
        .select()
        .from(playerSnapshots)
        .where(
          sql`${playerSnapshots.playerId} IN (${idsJoin})
            AND ${playerSnapshots.id} IN (
              SELECT MAX(id) FROM ${playerSnapshots}
              WHERE ${playerSnapshots.playerId} IN (${idsJoin})
              GROUP BY ${playerSnapshots.playerId}
            )`
        );

      for (const snap of latestSnapshots) {
        statsMap[snap.playerId] = {
          pace: snap.pace,
          shooting: snap.shooting,
          passing: snap.passing,
          dribbling: snap.dribbling,
          defense: snap.defense,
          physical: snap.physical,
        };
      }

      // Fetch progression data
      if (interval === 'ALL') {
        const progRows = await db
          .select()
          .from(progressions)
          .where(
            sql`${progressions.playerId} IN (${idsJoin}) AND ${progressions.interval} = 'ALL'`
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
      } else {
        const startDate = getStartDate(interval);

        const currentSnapshots = await db
          .select()
          .from(playerSnapshots)
          .where(
            sql`${playerSnapshots.playerId} IN (${idsJoin})
              AND ${playerSnapshots.id} IN (
                SELECT MAX(${playerSnapshots.id})
                FROM ${playerSnapshots}
                WHERE ${playerSnapshots.playerId} IN (${idsJoin})
                GROUP BY ${playerSnapshots.playerId}
              )`
          );

        const referenceSnapshots = await db
          .select()
          .from(playerSnapshots)
          .where(
            sql`${playerSnapshots.playerId} IN (${idsJoin})
              AND ${playerSnapshots.createdAt} >= ${startDate.toISOString()}
              AND ${playerSnapshots.id} IN (
                SELECT MIN(${playerSnapshots.id})
                FROM ${playerSnapshots}
                WHERE ${playerSnapshots.playerId} IN (${idsJoin})
                  AND ${playerSnapshots.createdAt} >= ${startDate.toISOString()}
                GROUP BY ${playerSnapshots.playerId}
              )`
          );

        const currentMap: Record<number, typeof currentSnapshots[number]> = {};
        for (const snap of currentSnapshots) currentMap[snap.playerId] = snap;

        const refMap: Record<number, typeof referenceSnapshots[number]> = {};
        for (const snap of referenceSnapshots) refMap[snap.playerId] = snap;

        for (const playerId of playerIds) {
          const current = currentMap[playerId];
          const reference = refMap[playerId];
          if (current && reference) {
            progressionMap[playerId] = {
              overall: current.overall - reference.overall,
              pace: current.pace - reference.pace,
              shooting: current.shooting - reference.shooting,
              passing: current.passing - reference.passing,
              dribbling: current.dribbling - reference.dribbling,
              defense: current.defense - reference.defense,
              physical: current.physical - reference.physical,
            };
          }
        }
      }
    }

    // Build response
    const data: PlayerRow[] = playerRows.map((p) => {
      const prog = progressionMap[p.id];
      const stats = statsMap[p.id];
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        overall: p.overall,
        age: p.age,
        positions: (p.positions as string[]) ?? [],
        nationalities: (p.nationalities as string[]) ?? [],
        ownerName: p.ownerName,
        progression: prog || undefined,
        pace: stats?.pace,
        shooting: stats?.shooting,
        passing: stats?.passing,
        dribbling: stats?.dribbling,
        defense: stats?.defense,
        physical: stats?.physical,
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
