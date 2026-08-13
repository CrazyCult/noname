import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { players, progressions, playerPredictions } from '@/db/schema';
import { desc, asc, sql, eq, and } from 'drizzle-orm';
import type { PlayerRow, PlayerPrediction, ProgressionInterval } from '@/types/mfl';
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
  const hideDevCenter = searchParams.get('hideDevCenter') === 'true';
  const sortByProgression = sortBy === 'progression';

  try {
    const db = await getDb();

    // ── WHERE conditions ──
    const conditions = [eq(players.isRetired, false)];

    if (search) {
      conditions.push(
        sql`(${players.firstName} LIKE ${`%${search}%`} OR ${players.lastName} LIKE ${`%${search}%`})`
      );
    }
    if (position) {
      conditions.push(sql`JSON_CONTAINS(${players.positions}, ${JSON.stringify(position)})`);
    }
    if (minOverall > 0) conditions.push(sql`${players.overall} >= ${minOverall}`);
    if (maxOverall > 0) conditions.push(sql`${players.overall} <= ${maxOverall}`);
    if (minAge > 0) conditions.push(sql`${players.age} >= ${minAge}`);
    if (maxAge > 0) conditions.push(sql`${players.age} <= ${maxAge}`);
    if (hideDevCenter) conditions.push(sql`${players.isDevCenter} = false`);
    if (progMinStr !== '') {
      conditions.push(
        sql`${players.id} IN (SELECT player_id FROM progressions WHERE \`interval\` = ${interval} AND overall >= ${Number(progMinStr)})`
      );
    }
    if (progMaxStr !== '') {
      conditions.push(
        sql`${players.id} IN (SELECT player_id FROM progressions WHERE \`interval\` = ${interval} AND overall <= ${Number(progMaxStr)})`
      );
    }

    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

    // ── Count ──
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
      const joinedRows = await db
        .select({
          id: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          overall: players.overall,
          age: players.age,
          retirementYears: players.retirementYears,
          positions: players.positions,
          nationalities: players.nationalities,
          ownerAddress: players.ownerAddress,
          ownerName: players.ownerName,
          revenueShare: players.revenueShare,
          clause: players.clause,
          listingPrice: players.listingPrice,
          pace: players.pace,
          shooting: players.shooting,
          passing: players.passing,
          dribbling: players.dribbling,
          defense: players.defense,
          physical: players.physical,
          goalkeeping: players.goalkeeping,
          isDevCenter: players.isDevCenter,
          isRetired: players.isRetired,
          lastSeenAt: players.lastSeenAt,
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
          and(eq(progressions.playerId, players.id), eq(progressions.interval, interval)),
        )
        .where(whereClause)
        .orderBy(
          sortOrder === 'desc'
            ? sql`COALESCE(${progressions.overall}, -2147483647) DESC`
            : sql`COALESCE(${progressions.overall}, 2147483647) ASC`,
        )
        .limit(limit)
        .offset(offset);

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
          retirementYears: row.retirementYears,
          positions: row.positions,
          nationalities: row.nationalities,
          ownerAddress: row.ownerAddress,
          ownerName: row.ownerName,
          revenueShare: row.revenueShare,
          clause: row.clause,
          listingPrice: row.listingPrice,
          pace: row.pace,
          shooting: row.shooting,
          passing: row.passing,
          dribbling: row.dribbling,
          defense: row.defense,
          physical: row.physical,
          goalkeeping: row.goalkeeping,
          isDevCenter: row.isDevCenter,
          isRetired: row.isRetired,
          lastSeenAt: row.lastSeenAt,
          updatedAt: row.updatedAt,
        };
      });
    } else {
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

      playerRows = await db
        .select()
        .from(players)
        .where(whereClause)
        .orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
        .limit(limit)
        .offset(offset);

      const playerIds = playerRows.map((p) => p.id);
      if (playerIds.length > 0) {
        const idsJoin = sql.join(playerIds.map((id) => sql`${id}`), sql`, `);
        const progRows = await db
          .select()
          .from(progressions)
          .where(sql`${progressions.playerId} IN (${idsJoin}) AND ${progressions.interval} = ${interval}`);

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

    // ── Prediction map ──
    const predictionMap: Record<number, PlayerPrediction> = {};
    const playerIds = playerRows.map((player) => player.id);
    if (playerIds.length > 0) {
      const idsJoin = sql.join(playerIds.map((id) => sql`${id}`), sql`, `);
      const predictionRows = await db
        .select()
        .from(playerPredictions)
        .where(sql`${playerPredictions.playerId} IN (${idsJoin})`);

      for (const prediction of predictionRows) {
        predictionMap[prediction.playerId] = {
          predictedGain: prediction.predictedGain,
          predictedOverall: prediction.predictedOverall,
          probabilityGain10: prediction.probabilityGain10,
          probabilityGain15: prediction.probabilityGain15,
          probabilityGain20: prediction.probabilityGain20,
          probabilityGain25: prediction.probabilityGain25,
          probabilityGain30: prediction.probabilityGain30,
          sampleSize: prediction.sampleSize,
          confidence: prediction.confidence,
          modelVersion: prediction.modelVersion,
        };
      }
    }

    // ── Build response ──
    const data: PlayerRow[] = playerRows.map((p) => {
      const prog = progressionMap[p.id];
      const positions = (p.positions as string[]) ?? [];

      // ── FIX : null si stats toutes à 0 (pas encore crawlées) ──
      const pace = (p as any).pace ?? 0;
      const shooting = (p as any).shooting ?? 0;
      const defense = (p as any).defense ?? 0;
      const hasRealStats = pace > 0 || shooting > 0 || defense > 0;

      const statsFromDb = hasRealStats ? {
        pace,
        shooting,
        passing: (p as any).passing ?? 0,
        dribbling: (p as any).dribbling ?? 0,
        defense,
        physical: (p as any).physical ?? 0,
        goalkeeping: (p as any).goalkeeping ?? 0,
      } : null;

      const positionOvrs = calculateAllPositionOvrs(positions, p.overall, statsFromDb);

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        overall: p.overall,
        age: p.age,
        retirementYears: p.retirementYears ?? null,
        positions,
        nationalities: (p.nationalities as string[]) ?? [],
        ownerName: p.ownerName,
        revenueShare: p.revenueShare ?? 0,
        clause: p.clause ?? 0,
        listingPrice: p.listingPrice ?? null,
        isDevCenter: (p as any).isDevCenter ?? false,
        progression: prog || undefined,
        prediction: predictionMap[p.id],
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
