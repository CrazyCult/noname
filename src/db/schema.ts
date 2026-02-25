import {
  mysqlTable,
  int,
  varchar,
  json,
  timestamp,
  index,
  primaryKey,
  boolean,
} from 'drizzle-orm/mysql-core';

export const players = mysqlTable(
  'players',
  {
    id: int('id').primaryKey(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    overall: int('overall').notNull(),
    age: int('age').notNull(),
    positions: json('positions').$type<string[]>(),
    nationalities: json('nationalities').$type<string[]>(),
    ownerAddress: varchar('owner_address', { length: 255 }),
    ownerName: varchar('owner_name', { length: 255 }),
    revenueShare: int('revenue_share').default(0),
    clause: int('clause').default(0),
    listingPrice: int('listing_price'),
    pace: int('pace').default(0),
    shooting: int('shooting').default(0),
    passing: int('passing').default(0),
    dribbling: int('dribbling').default(0),
    defense: int('defense').default(0),
    physical: int('physical').default(0),
    goalkeeping: int('goalkeeping').default(0),
    isDevCenter: boolean('is_dev_center').default(false),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    overallIdx: index('overall_idx').on(table.overall),
    ageIdx: index('age_idx').on(table.age),
    revenueShareIdx: index('revenue_share_idx').on(table.revenueShare),
    listingPriceIdx: index('listing_price_idx').on(table.listingPrice),
    isDevCenterIdx: index('is_dev_center_idx').on(table.isDevCenter),
  })
);

export const progressions = mysqlTable(
  'progressions',
  {
    playerId: int('player_id')
      .notNull()
      .references(() => players.id),
    interval: varchar('interval', { length: 20 })
      .notNull()
      .$type<'24H' | 'WEEK' | 'MONTH' | 'ALL' | 'CURRENT_SEASON'>(),
    overall: int('overall').default(0),
    pace: int('pace').default(0),
    shooting: int('shooting').default(0),
    passing: int('passing').default(0),
    dribbling: int('dribbling').default(0),
    defense: int('defense').default(0),
    physical: int('physical').default(0),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.playerId, table.interval] }),
  })
);

export const playerSnapshots = mysqlTable(
  'player_snapshots',
  {
    id: int('id').primaryKey().autoincrement(),
    playerId: int('player_id')
      .notNull()
      .references(() => players.id),
    overall: int('overall').notNull(),
    pace: int('pace').notNull(),
    shooting: int('shooting').notNull(),
    passing: int('passing').notNull(),
    dribbling: int('dribbling').notNull(),
    defense: int('defense').notNull(),
    physical: int('physical').notNull(),
    age: int('age').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    playerIdx: index('player_idx').on(table.playerId),
    createdAtIdx: index('created_at_idx').on(table.createdAt),
    playerDateIdx: index('player_date_idx').on(table.playerId, table.createdAt),
  })
);
