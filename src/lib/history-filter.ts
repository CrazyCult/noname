export type HistoryInterval = 'ALL' | 'CURRENT_SEASON' | 'MONTH' | 'WEEK' | '24H';

export interface HistoryEntry {
  date: number;
  values: Record<string, number>;
}

/**
 * Filtre l'historique d'un joueur selon l'intervalle demandé
 * @param history - Tableau complet de l'historique
 * @param interval - Intervalle de temps à filtrer
 * @returns Historique filtré
 */
export function filterHistoryByInterval(
  history: HistoryEntry[],
  interval: HistoryInterval
): HistoryEntry[] {
  if (interval === 'ALL') {
    return history;
  }

  const now = Date.now();
  let startDate: number;

  switch (interval) {
    case '24H':
      // Dernières 24 heures
      startDate = now - (24 * 60 * 60 * 1000);
      break;

    case 'WEEK':
      // 7 derniers jours
      startDate = now - (7 * 24 * 60 * 60 * 1000);
      break;

    case 'MONTH':
      // 30 derniers jours
      startDate = now - (30 * 24 * 60 * 60 * 1000);
      break;

    case 'CURRENT_SEASON':
      // La saison MFL commence généralement en octobre
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      
      // Si on est avant octobre (mois 9), la saison a commencé en octobre de l'année précédente
      // Sinon, elle a commencé en octobre de cette année
      const seasonStartYear = currentMonth < 9 ? currentYear - 1 : currentYear;
      startDate = new Date(seasonStartYear, 9, 1).getTime(); // 1er octobre
      break;

    default:
      return history;
  }

  return history.filter(entry => entry.date >= startDate);
}

/**
 * Calcule la progression entre deux états
 * @param current - État actuel
 * @param previous - État précédent
 * @returns Différence de stats
 */
export function calculateProgression(
  current: Record<string, number>,
  previous: Record<string, number>
): Record<string, number> {
  const progression: Record<string, number> = {};
  
  for (const key in current) {
    if (previous[key] !== undefined) {
      progression[key] = current[key] - previous[key];
    }
  }
  
  return progression;
}

/**
 * Reconstruit l'état complet d'un joueur à partir de l'historique
 * (car l'historique ne contient que les changements incrémentiels)
 * @param history - Historique du joueur
 * @returns État complet actuel
 */
export function buildCompleteState(history: HistoryEntry[]): Record<string, number> {
  const state: Record<string, number> = {};
  
  // Parcourir l'historique dans l'ordre chronologique
  const sortedHistory = [...history].sort((a, b) => a.date - b.date);
  
  for (const entry of sortedHistory) {
    Object.assign(state, entry.values);
  }
  
  return state;
}
