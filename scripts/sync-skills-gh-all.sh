#!/bin/bash
# Sync skills for every repo in officialRepos into D1.
# Usage: ./scripts/sync-skills-gh-all.sh [--remote]
#   default applies to --local only.
#   --remote also applies to the remote D1.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/server/data/official-repos.ts"
OUT_SQL="/tmp/sync-skills-gh-all.sql"
APPLY_REMOTE=0

for arg in "$@"; do
  case "$arg" in
    --remote) APPLY_REMOTE=1 ;;
  esac
done

# Extract every "owner: 'X', repo: 'Y'" line into "X/Y".
mapfile -t REPOS < <(
  grep -E "^\s*\{ owner:" "$MANIFEST" \
    | sed -E "s/.*owner: '([^']+)', repo: '([^']+)'.*/\1\/\2/"
)

echo "[sync-all] ${#REPOS[@]} repos to sync"
: > "$OUT_SQL"

OK=0
FAIL=0
FAILED=()
for slug in "${REPOS[@]}"; do
  echo "[sync-all] $slug"
  if npx tsx "$SCRIPT_DIR/sync-skills-gh.ts" "$slug" >> "$OUT_SQL" 2>/tmp/sync-skills-gh-all.err; then
    OK=$((OK+1))
  else
    FAIL=$((FAIL+1))
    FAILED+=("$slug")
    echo "[sync-all]   FAILED: $(tail -3 /tmp/sync-skills-gh-all.err | tr '\n' ' ')"
  fi
done

echo "[sync-all] generated SQL for $OK repos ($FAIL failed). Wrote $OUT_SQL ($(wc -l < "$OUT_SQL") lines)."
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "[sync-all] failed repos:"
  printf '  %s\n' "${FAILED[@]}"
fi

echo "[sync-all] applying to local D1..."
npx wrangler d1 execute skilld-db --local --file="$OUT_SQL"

if [ "$APPLY_REMOTE" = "1" ]; then
  echo "[sync-all] applying to remote D1..."
  npx wrangler d1 execute skilld-db --remote --file="$OUT_SQL"
fi

echo "[sync-all] done."
