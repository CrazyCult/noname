


## Stack Technique

- **Framework** : Next.js 16 (App Router) avec TypeScript
- **Base de donnÃ©es** : MySQL via `mysql2` + Drizzle ORM
- **UI** : Tailwind CSS, TanStack Table, Framer Motion, Lucide Icons
- **Design** : ThÃ¨me sombre avec effets Glassmorphism

## Installation

```bash
# 1. Installer les dÃ©pendances
npm install

# 2. Configurer la base de donnÃ©es
cp .env.example .env
# Ã‰diter .env avec vos credentials MySQL

# 3. Pousser le schÃ©ma vers MySQL
npm run db:push

# 4. Indexer les joueurs depuis l'API MFL
npm run crawl:players

# 5. RÃ©cupÃ©rer les progressions
npm run crawl:progressions        # Default: WEEK
npm run crawl:progressions MONTH  # Ou: 24H, WEEK, MONTH, ALL, CURRENT_SEASON
npm run crawl:history             # Backfill des Ã©vÃ©nements historiques MFL
npm run crawl:snapshots           # Snapshot immuable des stats absolues
npm run predict:progressions      # Baseline KNN explicable

# 6. Lancer le serveur de dÃ©veloppement
npm run dev
```

## Architecture

```
src/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ api/players/route.ts   # API interne (filtrage, tri, pagination)
â”‚   â”œâ”€â”€ layout.tsx             # Layout racine
â”‚   â”œâ”€â”€ page.tsx               # Page d'accueil
â”‚   â””â”€â”€ globals.css            # Styles globaux + Glassmorphism
â”œâ”€â”€ components/
â”‚   â””â”€â”€ PlayerTable.tsx        # Tableau dynamique avec filtres
â”œâ”€â”€ db/
â”‚   â”œâ”€â”€ index.ts               # Connexion MySQL + Drizzle
â”‚   â””â”€â”€ schema.ts              # SchÃ©ma Drizzle (players, progressions)
â”œâ”€â”€ lib/
â”‚   â””â”€â”€ mfl-api.ts             # Client API MFL (fetch players & progressions)
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ crawl-players.ts       # Crawler d'indexation
â”‚   â””â”€â”€ crawl-progressions.ts  # Crawler de progressions
â””â”€â”€ types/
    â””â”€â”€ mfl.ts                 # Types TypeScript partagÃ©s
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de dÃ©veloppement |
| `npm run build` | Build de production |
| `npm run crawl:players` | Indexer tous les joueurs MFL |
| `npm run crawl:progressions [interval]` | Mettre Ã  jour les progressions |
| `npm run crawl:history` | Reprendre et conserver l'historique individuel MFL |
| `npm run predict:progressions` | Calculer gain attendu et probabilitÃ©s +10â€¦+30 |
| `npm run db:push` | Appliquer le schÃ©ma Ã  MySQL |
| `npm run db:studio` | Interface web Drizzle Studio |

## StratÃ©gie de DonnÃ©es

Le site utilise un systÃ¨me de **Crawler Ã  deux niveaux** :

1. **Indexation** : Pagination curseur sur `GET /players` (batches de 1500)
2. **Progressions** : Batches de 200 IDs sur `GET /players/progressions`

La base MySQL locale sert de cache haute performance â€” aucun appel API MFL depuis le navigateur.
