#!/bin/bash
set -e

# Ce script tourne sur la machine locale (celle qui héberge MySQL).
# Il est appelé par crontab 2x/jour.
# Prérequis : npm install déjà fait dans le repo.

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=== MFL Scout Crawl Started ==="
echo "Time: $(date)"

echo "Step 1/2: Crawling progressions ALL..."
npm run crawl:progressions ALL

echo "Step 2/2: Creating snapshot..."
npm run crawl:snapshots

echo "=== Crawl Complete ==="
