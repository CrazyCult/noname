/**
 * Test script for history filtering
 * 
 * Usage: npx tsx src/scripts/test-history-filter.ts
 */
import { filterHistoryByInterval, buildCompleteState } from '../lib/history-filter';
import type { PlayerHistory } from '../types/mfl';

// Exemple de données (basé sur le joueur 47686)
const sampleHistory: PlayerHistory = [
  {
    date: 1731496864395, // 13 nov 2024
    values: { age: 24, overall: 85, defense: 94, passing: 78, pace: 61, dribbling: 83, physical: 75, shooting: 54, goalkeeping: 0 }
  },
  {
    date: 1731610458497, // 14 nov 2024
    values: { passing: 79 }
  },
  {
    date: 1731684031454, // 15 nov 2024
    values: { physical: 76 }
  },
  {
    date: 1735163409475, // 26 déc 2024
    values: { overall: 89, physical: 77 }
  },
  {
    date: 1737987349871, // 27 jan 2025
    values: { age: 26 }
  },
  {
    date: 1771259996956, // 10 fév 2026
    values: { age: 35 }
  }
];

console.log('🧪 Test du filtrage d\'historique\n');
console.log('📊 Données de test:');
console.log(`   Total entries: ${sampleHistory.length}`);
console.log(`   Date range: ${new Date(sampleHistory[0].date).toLocaleDateString()} - ${new Date(sampleHistory[sampleHistory.length - 1].date).toLocaleDateString()}\n`);

// Test ALL
console.log('✅ Test interval: ALL');
const all = filterHistoryByInterval(sampleHistory, 'ALL');
console.log(`   Résultat: ${all.length} entries (attendu: ${sampleHistory.length})\n`);

// Test CURRENT_SEASON
console.log('✅ Test interval: CURRENT_SEASON');
const season = filterHistoryByInterval(sampleHistory, 'CURRENT_SEASON');
console.log(`   Résultat: ${season.length} entries`);
console.log(`   Dates: ${season.length > 0 ? `${new Date(season[0].date).toLocaleDateString()} - ${new Date(season[season.length - 1].date).toLocaleDateString()}` : 'aucune'}\n`);

// Test MONTH
console.log('✅ Test interval: MONTH');
const month = filterHistoryByInterval(sampleHistory, 'MONTH');
console.log(`   Résultat: ${month.length} entries`);
console.log(`   Dates: ${month.length > 0 ? `${new Date(month[0].date).toLocaleDateString()} - ${new Date(month[month.length - 1].date).toLocaleDateString()}` : 'aucune'}\n`);

// Test WEEK
console.log('✅ Test interval: WEEK');
const week = filterHistoryByInterval(sampleHistory, 'WEEK');
console.log(`   Résultat: ${week.length} entries`);
console.log(`   Dates: ${week.length > 0 ? `${new Date(week[0].date).toLocaleDateString()} - ${new Date(week[week.length - 1].date).toLocaleDateString()}` : 'aucune'}\n`);

// Test 24H
console.log('✅ Test interval: 24H');
const day = filterHistoryByInterval(sampleHistory, '24H');
console.log(`   Résultat: ${day.length} entries`);
console.log(`   Dates: ${day.length > 0 ? `${new Date(day[0].date).toLocaleDateString()} - ${new Date(day[day.length - 1].date).toLocaleDateString()}` : 'aucune'}\n`);

// Test buildCompleteState
console.log('✅ Test buildCompleteState');
const completeState = buildCompleteState(sampleHistory);
console.log(`   État final:`, completeState);
console.log('');

console.log('🎉 Tests terminés!\n');
console.log('💡 Note: Si MONTH/WEEK/24H retournent 0 ou 1 entry, c\'est normal.');
console.log('   Les données de test couvrent nov 2024 - fév 2026.');
console.log('   La date actuelle est: ' + new Date().toLocaleDateString());
