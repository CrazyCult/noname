/**
 * Calcul OVR complet — PlayMFL
 * Inclut : postes primaire, secondaire, tertiaire,
 *          familiarité par matrice
 */

// ─────────────────────────────────────────────
// 1. COEFFICIENTS OFFICIELS PAR POSITION
// ─────────────────────────────────────────────

type Weights = { PAS: number; SHO: number; DEF: number; DRI: number; PAC: number; PHY: number; GK: number };

const POSITION_WEIGHTS: Record<string, Weights> = {
  // Attaquants
  ST:  { PAS: 0.10, SHO: 0.46, DEF: 0.00, DRI: 0.29, PAC: 0.10, PHY: 0.05, GK: 0.00 },
  CF:  { PAS: 0.24, SHO: 0.23, DEF: 0.00, DRI: 0.40, PAC: 0.13, PHY: 0.00, GK: 0.00 },
  // Ailiers
  LW:  { PAS: 0.24, SHO: 0.23, DEF: 0.00, DRI: 0.40, PAC: 0.13, PHY: 0.00, GK: 0.00 },
  RW:  { PAS: 0.24, SHO: 0.23, DEF: 0.00, DRI: 0.40, PAC: 0.13, PHY: 0.00, GK: 0.00 },
  // Milieux offensifs
  CAM: { PAS: 0.34, SHO: 0.21, DEF: 0.00, DRI: 0.38, PAC: 0.07, PHY: 0.00, GK: 0.00 },
  // Milieux centraux / latéraux
  CM:  { PAS: 0.43, SHO: 0.12, DEF: 0.10, DRI: 0.29, PAC: 0.00, PHY: 0.06, GK: 0.00 },
  LM:  { PAS: 0.43, SHO: 0.12, DEF: 0.10, DRI: 0.29, PAC: 0.00, PHY: 0.06, GK: 0.00 },
  RM:  { PAS: 0.43, SHO: 0.12, DEF: 0.10, DRI: 0.29, PAC: 0.00, PHY: 0.06, GK: 0.00 },
  // Milieux défensifs
  CDM: { PAS: 0.28, SHO: 0.00, DEF: 0.40, DRI: 0.17, PAC: 0.00, PHY: 0.15, GK: 0.00 },
  // Latéraux / Pistons
  LB:  { PAS: 0.19, SHO: 0.00, DEF: 0.44, DRI: 0.17, PAC: 0.10, PHY: 0.10, GK: 0.00 },
  RB:  { PAS: 0.19, SHO: 0.00, DEF: 0.44, DRI: 0.17, PAC: 0.10, PHY: 0.10, GK: 0.00 },
  LWB: { PAS: 0.19, SHO: 0.00, DEF: 0.44, DRI: 0.17, PAC: 0.10, PHY: 0.10, GK: 0.00 },
  RWB: { PAS: 0.19, SHO: 0.00, DEF: 0.44, DRI: 0.17, PAC: 0.10, PHY: 0.10, GK: 0.00 },
  // Défenseurs centraux
  CB:  { PAS: 0.05, SHO: 0.00, DEF: 0.64, DRI: 0.09, PAC: 0.02, PHY: 0.20, GK: 0.00 },
  // Gardiens (OVR = 100% GK attribute = overall du joueur)
  GK:  { PAS: 0.00, SHO: 0.00, DEF: 0.00, DRI: 0.00, PAC: 0.00, PHY: 0.00, GK: 1.00 },
};

// ─────────────────────────────────────────────
// 2. PÉNALITÉS DE FAMILIARITÉ (sur tous les attributs)
// ─────────────────────────────────────────────

type FamiliarityLevel = 'PRIMARY' | 'SECONDARY' | 'FAIRLY_FAMILIAR' | 'SOMEWHAT_FAMILIAR' | 'UNFAMILIAR';

const FAMILIARITY_PENALTIES: Record<FamiliarityLevel, number> = {
  PRIMARY: 0,
  SECONDARY: -1,
  FAIRLY_FAMILIAR: -5,
  SOMEWHAT_FAMILIAR: -8,
  UNFAMILIAR: -20,
};

// ─────────────────────────────────────────────
// 3. MATRICE DE FAMILIARITÉ PAR POSTE PRINCIPAL
// ─────────────────────────────────────────────

const POSITION_FAMILIARITY: Record<string, Record<string, FamiliarityLevel>> = {
  GK:  { GK: 'PRIMARY' },
  CB:  { CB: 'PRIMARY', LB: 'FAIRLY_FAMILIAR', RB: 'FAIRLY_FAMILIAR', CDM: 'FAIRLY_FAMILIAR' },
  LB:  { LB: 'PRIMARY', LWB: 'SECONDARY', CB: 'FAIRLY_FAMILIAR', LM: 'FAIRLY_FAMILIAR', RB: 'SOMEWHAT_FAMILIAR' },
  RB:  { RB: 'PRIMARY', RWB: 'SECONDARY', CB: 'FAIRLY_FAMILIAR', RM: 'FAIRLY_FAMILIAR', LB: 'SOMEWHAT_FAMILIAR' },
  LWB: { LWB: 'PRIMARY', LB: 'SECONDARY', LM: 'FAIRLY_FAMILIAR', LW: 'FAIRLY_FAMILIAR' },
  RWB: { RWB: 'PRIMARY', RB: 'SECONDARY', RM: 'FAIRLY_FAMILIAR', RW: 'FAIRLY_FAMILIAR' },
  CDM: { CDM: 'PRIMARY', CM: 'FAIRLY_FAMILIAR', CB: 'FAIRLY_FAMILIAR' },
  CM:  { CM: 'PRIMARY', CDM: 'FAIRLY_FAMILIAR', CAM: 'FAIRLY_FAMILIAR', LM: 'FAIRLY_FAMILIAR', RM: 'FAIRLY_FAMILIAR' },
  LM:  { LM: 'PRIMARY', CM: 'FAIRLY_FAMILIAR', LW: 'FAIRLY_FAMILIAR', LB: 'FAIRLY_FAMILIAR', LWB: 'FAIRLY_FAMILIAR' },
  RM:  { RM: 'PRIMARY', CM: 'FAIRLY_FAMILIAR', RW: 'FAIRLY_FAMILIAR', RB: 'FAIRLY_FAMILIAR', RWB: 'FAIRLY_FAMILIAR' },
  CAM: { CAM: 'PRIMARY', CM: 'FAIRLY_FAMILIAR', CF: 'FAIRLY_FAMILIAR', LW: 'SOMEWHAT_FAMILIAR', RW: 'SOMEWHAT_FAMILIAR' },
  LW:  { LW: 'PRIMARY', LM: 'FAIRLY_FAMILIAR', CF: 'FAIRLY_FAMILIAR', ST: 'SOMEWHAT_FAMILIAR', CAM: 'SOMEWHAT_FAMILIAR' },
  RW:  { RW: 'PRIMARY', RM: 'FAIRLY_FAMILIAR', CF: 'FAIRLY_FAMILIAR', ST: 'SOMEWHAT_FAMILIAR', CAM: 'SOMEWHAT_FAMILIAR' },
  CF:  { CF: 'PRIMARY', ST: 'SECONDARY', CAM: 'FAIRLY_FAMILIAR', LW: 'FAIRLY_FAMILIAR', RW: 'FAIRLY_FAMILIAR' },
  ST:  { ST: 'PRIMARY', CF: 'SECONDARY', LW: 'SOMEWHAT_FAMILIAR', RW: 'SOMEWHAT_FAMILIAR' },
};

// ─────────────────────────────────────────────
// 4. LOGIQUE DE FAMILIARITÉ
// ─────────────────────────────────────────────

function getPositionFamiliarity(
  playerPositions: string[],
  targetPosition: string,
): FamiliarityLevel {
  const primaryPos = playerPositions[0];

  // Poste principal
  if (primaryPos === targetPosition) return 'PRIMARY';

  // Poste secondaire ou tertiaire (listé dans metadata.positions)
  if (playerPositions.includes(targetPosition)) return 'SECONDARY';

  // Matrice de familiarité selon poste principal
  if (primaryPos && POSITION_FAMILIARITY[primaryPos]) {
    return POSITION_FAMILIARITY[primaryPos][targetPosition] || 'UNFAMILIAR';
  }

  return 'UNFAMILIAR';
}

// ─────────────────────────────────────────────
// 5. CALCUL OVR
// ─────────────────────────────────────────────

export interface PlayerStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defense: number;
  physical: number;
  goalkeeping: number;
}

export interface PositionOvr {
  position: string;
  ovr: number;
  familiarity: FamiliarityLevel;
}

/**
 * Calcule l'OVR d'un joueur pour un poste cible donné.
 * Pour GK : OVR = goalkeeping (= overall du joueur GK)
 */
export function calculateOVR(
  stats: PlayerStats,
  playerPositions: string[],
  targetPosition: string,
): number | null {
  const weights = POSITION_WEIGHTS[targetPosition];
  if (!weights) return null;

  // Pénalité familiarité
  const familiarityLevel = getPositionFamiliarity(playerPositions, targetPosition);
  const penalty = FAMILIARITY_PENALTIES[familiarityLevel];

  // Stats ajustées (floor à 0)
  const adjusted = {
    PAS: Math.max(0, stats.passing + penalty),
    SHO: Math.max(0, stats.shooting + penalty),
    DEF: Math.max(0, stats.defense + penalty),
    DRI: Math.max(0, stats.dribbling + penalty),
    PAC: Math.max(0, stats.pace + penalty),
    PHY: Math.max(0, stats.physical + penalty),
    GK: Math.max(0, stats.goalkeeping + penalty),
  };

  // OVR = somme pondérée
  let ovr = 0;
  for (const [key, weight] of Object.entries(weights)) {
    ovr += adjusted[key as keyof typeof adjusted] * weight;
  }

  return Math.max(0, Math.round(ovr));
}

/**
 * Calcule l'OVR pour chaque position d'un joueur (primaire, secondaire, tertiaire).
 * Pour le poste primaire, on utilise l'OVR stocké en DB (= valeur officielle MFL).
 * Pour les autres, on calcule avec la formule + pénalité de familiarité.
 *
 * `stats` peut être null si pas de snapshot dispo — dans ce cas,
 * seul le poste primaire aura un OVR (celui de la DB).
 */
export function calculateAllPositionOvrs(
  positions: string[],
  primaryOverall: number,
  stats: PlayerStats | null,
): PositionOvr[] {
  return positions.map((pos, i) => {
    if (i === 0) {
      return { position: pos, ovr: primaryOverall, familiarity: 'PRIMARY' as FamiliarityLevel };
    }

    if (!stats) {
      return { position: pos, ovr: primaryOverall, familiarity: 'SECONDARY' as FamiliarityLevel };
    }

    const familiarity = getPositionFamiliarity(positions, pos);
    const ovr = calculateOVR(stats, positions, pos);

    return {
      position: pos,
      ovr: ovr ?? primaryOverall,
      familiarity,
    };
  });
}
