#!/bin/bash
set -e

echo "=== MFL Scout Crawl Started ==="
echo "Time: $(date)"

# Install dependencies if needed
npm install

# Run crawls
echo "Step 1/2: Crawling progressions ALL..."
npm run crawl:progressions ALL

echo "Step 2/2: Creating snapshot..."
npx tsx src/scripts/crawl-snapshots.ts

echo "=== Crawl Complete ==="