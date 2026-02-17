# API Documentation - Player History

## Endpoint: `/api/players/[id]/history`

Récupère l'historique complet des statistiques d'un joueur avec filtrage par intervalle de temps.

### URL
```
GET /api/players/[id]/history?interval={interval}
```

### Paramètres

| Paramètre | Type | Requis | Valeurs possibles | Défaut | Description |
|-----------|------|--------|-------------------|--------|-------------|
| `id` | number | Oui | - | - | ID du joueur |
| `interval` | string | Non | `24H`, `WEEK`, `MONTH`, `CURRENT_SEASON`, `ALL` | `ALL` | Période de temps à filtrer |

### Intervalles disponibles

- **24H** : Dernières 24 heures
- **WEEK** : 7 derniers jours
- **MONTH** : 30 derniers jours
- **CURRENT_SEASON** : Depuis le 1er octobre de la saison en cours
- **ALL** : Tout l'historique

### Exemple de requête

```bash
# Récupérer l'historique du mois
curl http://localhost:3000/api/players/47686/history?interval=MONTH

# Récupérer tout l'historique
curl http://localhost:3000/api/players/47686/history?interval=ALL
```

### Exemple de réponse

```json
{
  "playerId": 47686,
  "interval": "MONTH",
  "total": 45,
  "filtered": 12,
  "history": [
    {
      "date": 1731496864395,
      "values": {
        "age": 24,
        "overall": 85,
        "defense": 94,
        "passing": 78,
        "pace": 61,
        "dribbling": 83,
        "physical": 75,
        "shooting": 54,
        "goalkeeping": 0
      }
    },
    {
      "date": 1731610458497,
      "values": {
        "passing": 79
      }
    }
  ]
}
```

### Champs de réponse

| Champ | Type | Description |
|-------|------|-------------|
| `playerId` | number | ID du joueur |
| `interval` | string | Intervalle appliqué |
| `total` | number | Nombre total d'entrées dans l'historique complet |
| `filtered` | number | Nombre d'entrées après filtrage |
| `history` | array | Tableau des entrées d'historique |
| `history[].date` | number | Timestamp Unix (millisecondes) |
| `history[].values` | object | Changements de statistiques à cette date |

### Notes importantes

1. **Historique incrémentiel** : L'API MFL ne renvoie que les changements de stats à chaque date, pas l'état complet
2. **Filtrage côté serveur** : Le filtrage par intervalle est effectué côté serveur pour optimiser les performances
3. **Cache** : Considérer l'ajout d'un cache pour réduire les appels à l'API MFL externe

## Composant React

### PlayerHistory

Composant React pour afficher l'historique d'un joueur avec sélection d'intervalle.

```tsx
import PlayerHistoryView from '@/components/PlayerHistory';

function MyPage() {
  return <PlayerHistoryView playerId={47686} defaultInterval="WEEK" />;
}
```

### Props

| Prop | Type | Requis | Défaut | Description |
|------|------|--------|--------|-------------|
| `playerId` | number | Oui | - | ID du joueur |
| `defaultInterval` | HistoryInterval | Non | `WEEK` | Intervalle par défaut |

## Utilitaires

### filterHistoryByInterval

Fonction utilitaire pour filtrer l'historique côté client.

```typescript
import { filterHistoryByInterval } from '@/lib/history-filter';

const filteredHistory = filterHistoryByInterval(history, 'MONTH');
```

### buildCompleteState

Reconstruit l'état complet d'un joueur en combinant tous les changements incrémentiels.

```typescript
import { buildCompleteState } from '@/lib/history-filter';

const currentState = buildCompleteState(history);
// { age: 35, overall: 91, defense: 98, ... }
```

## Pages disponibles

- `/players/[id]` : Page de visualisation de l'historique d'un joueur

Exemple : http://localhost:3000/players/47686
