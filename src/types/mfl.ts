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
  };
  ownedBy?: {
    walletAddress: string;
    name: string;
  };
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
  progression?: MflProgression;
  /** Individual stats from latest snapshot (for OVR calculation per position) */
  pace?: number;
  shooting?: number;
  passing?: number;
  dribbling?: number;
  defense?: number;
  physical?: number;
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
