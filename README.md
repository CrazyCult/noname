


## Stack Technique

- **Framework** : Next.js 16 (App Router) avec TypeScript
- **Base de données** : MySQL via `mysql2` + Drizzle ORM
- **UI** : Tailwind CSS, TanStack Table, Framer Motion, Lucide Icons
- **Design** : Thème sombre avec effets Glassmorphism

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer la base de données
cp .env.example .env
# Éditer .env avec vos credentials MySQL

# 3. Pousser le schéma vers MySQL
npm run db:push

# 4. Indexer les joueurs depuis l'API MFL
npm run crawl:players

# 5. Récupérer les progressions
npm run crawl:progressions        # Default: WEEK
npm run crawl:progressions MONTH  # Ou: 24H, WEEK, MONTH, ALL, CURRENT_SEASON
npm run crawl:history             # Backfill des événements historiques MFL
npm run crawl:snapshots           # Snapshot immuable des stats absolues
npm run predict:progressions      # Baseline KNN explicable

# 6. Lancer le serveur de développement
npm run dev
```

## Architecture

```
src/
├── app/
│   ├── api/players/route.ts   # API interne (filtrage, tri, pagination)
│   ├── layout.tsx             # Layout racine
│   ├── page.tsx               # Page d'accueil
│   └── globals.css            # Styles globaux + Glassmorphism
├── components/
│   └── PlayerTable.tsx        # Tableau dynamique avec filtres
├── db/
│   ├── index.ts               # Connexion MySQL + Drizzle
│   └── schema.ts              # Schéma Drizzle (players, progressions)
├── lib/
│   └── mfl-api.ts             # Client API MFL (fetch players & progressions)
├── scripts/
│   ├── crawl-players.ts       # Crawler d'indexation
│   └── crawl-progressions.ts  # Crawler de progressions
└── types/
    └── mfl.ts                 # Types TypeScript partagés
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run crawl:players` | Indexer tous les joueurs MFL |
| `npm run crawl:progressions [interval]` | Mettre à jour les progressions |
| `npm run crawl:history` | Reprendre et conserver l'historique individuel MFL |
| `npm run predict:progressions` | Calculer gain attendu et probabilités +10…+30 |
| `npm run db:push` | Appliquer le schéma à MySQL |
| `npm run db:studio` | Interface web Drizzle Studio |

## Stratégie de Données

Le site utilise un système de **Crawler à deux niveaux** :

1. **Indexation** : Pagination curseur sur `GET /players` (batches de 1500)
2. **Progressions** : Batches de 200 IDs sur `GET /players/progressions`

La base MySQL locale sert de cache haute performance — aucun appel API MFL depuis le navigateur.
