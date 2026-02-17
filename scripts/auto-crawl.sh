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
npm run crawl:snapshots

echo "=== Crawl Complete ==="