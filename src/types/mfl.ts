/** Raw player format from the MFL API */
export interface MflPlayer {
  id: number;
  metadata: {
    firstName: string;
    lastName: string;
    overall: number;
    age: number;
    positions: string[];
    nationalities: string[];
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defense: number;
    physical: number;
    goalkeeping: number;
  };
  ownedBy?: {
    walletAddress: string;
    name: string;
  };
  activeContract?: {
    revenueShare: number;
    totalRevenueShareLocked: number;
  };
  offerStatus?: number;
}

/** Listing info returned alongside a player */
export interface MflListing {
  listingResourceId: string;
  status: string;
  price: number;
  sellerAddress: string;
  sellerName: string;
  createdDateTime: number;
}

/** Full response from GET /players/:id */
export interface MflPlayerResponse {
  player: MflPlayer;
  listing?: MflListing;
}

/** Progression values for a single player */
export interface MflProgression {
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defense: number;
  physical: number;
}

/** API response for progressions: keys are player IDs */
export type MflProgressionsResponse = Record<string, MflProgression>;

/** Interval types supported by the MFL API */
export type ProgressionInterval =
  | '24H'
  | 'WEEK'
  | 'MONTH'
  | 'ALL'
  | 'CURRENT_SEASON';

/** Frontend-facing player with optional progression data */
export interface PlayerRow {
  id: number;
  firstName: string;
  lastName: string;
  overall: number;
  age: number;
  positions: string[];
  nationalities: string[];
  ownerName: string | null;
  revenueShare: number;
  clause: number;
  listingPrice: number | null;
  progression?: MflProgression;
  /** OVR pré-calculé par position (primaire, secondaire, tertiaire) */
  positionOvrs: { position: string; ovr: number }[];
}

/** Player history entry from MFL API */
export interface PlayerHistoryEntry {
  date: number;
  values: {
    age?: number;
    overall?: number;
    defense?: number;
    passing?: number;
    pace?: number;
    dribbling?: number;
    physical?: number;
    shooting?: number;
    goalkeeping?: number;
  };
}

/** Complete player history response */
export type PlayerHistory = PlayerHistoryEntry[];
