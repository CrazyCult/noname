/** Raw player format from the MFL API */
export interface MflPlayer {
  id: number;
  metadata: {
    firstName: string;
    lastName: string;
    overall: number;
    age: number;
    // Official MFL field, present only once a retirement window is declared.
    retirementYears?: number;
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
    club?: {
      id: number;
      name: string;
      type: string; // "DEVELOPMENT_CENTER" | "CLUB" | ...
    };
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

/** Stored progression forecast for a player. */
export interface PlayerPrediction {
  predictedGain: number;
  predictedOverall: number;
  probabilityGain10: number;
  probabilityGain15: number;
  probabilityGain20: number;
  probabilityGain25: number;
  probabilityGain30: number;
  sampleSize: number;
  confidence: number;
  modelVersion: string;
}

/** Frontend-facing player with optional progression data */
export interface PlayerRow {
  id: number;
  firstName: string;
  lastName: string;
  overall: number;
  age: number;
  // Official MFL retirement window; absent until MFL has declared it.
  retirementYears: number | null;
  positions: string[];
  nationalities: string[];
  ownerName: string | null;
  revenueShare: number;
  clause: number;
  listingPrice: number | null;
  isDevCenter: boolean;
  progression?: MflProgression;
  prediction?: PlayerPrediction;
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

/** Complete player history */
export type PlayerHistory = PlayerHistoryEntry[];
