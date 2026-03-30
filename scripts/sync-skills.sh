#!/bin/bash
# Sync skills data from mastra-ai/skills-api and seed D1
# Usage: ./scripts/sync-skills.sh [--remote]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY="$PROJECT_DIR/server/data/skills-registry.json"
SEED_SQL="/tmp/seed-skills.sql"
D1_FLAG="${1:---local}"

echo "Downloading scraped-skills.json from mastra-ai/skills-api..."
BLOB_SHA=$(gh api repos/mastra-ai/skills-api/contents/src/registry/scraped-skills.json --jq '.sha')
gh api "repos/mastra-ai/skills-api/git/blobs/$BLOB_SHA" --jq '.content' | base64 -d > "$PROJECT_DIR/server/data/scraped-skills.json"

echo "Building compact registry..."
node -e "
const data = require('$PROJECT_DIR/server/data/scraped-skills.json')
const sourceSet = new Map()
const sources = []
for (const s of data.skills) {
  const k = s.owner + '/' + s.repo
  if (!sourceSet.has(k)) { sourceSet.set(k, sources.length); sources.push(k) }
}
const skills = data.skills.map(s => [
  s.name,
  sourceSet.get(s.owner + '/' + s.repo),
  s.displayName,
  s.installs
])
const out = JSON.stringify({ sources, skills })
require('fs').writeFileSync('$REGISTRY', out)
console.log(skills.length + ' skills, ' + sources.length + ' sources')
"

echo "Generating seed SQL..."
npx tsx "$SCRIPT_DIR/seed-skills.ts" 2>/dev/null > "$SEED_SQL"

echo "Running migration..."
npx wrangler d1 execute skilld-db "$D1_FLAG" --file="$PROJECT_DIR/migrations/0001_skills.sql"

echo "Seeding D1..."
npx wrangler d1 execute skilld-db "$D1_FLAG" --file="$SEED_SQL"

echo "Done."
