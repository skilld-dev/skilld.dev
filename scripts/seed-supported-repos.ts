/**
 * Seed supported_repos from the curated officialRepos manifest.
 *
 * Preview:
 *   npx tsx scripts/seed-supported-repos.ts
 *
 * Apply:
 *   npx tsx scripts/seed-supported-repos.ts --emit-sql \
 *     > /tmp/skilld-supported-repos.sql
 *   npx wrangler d1 execute skilld-db --remote --file=/tmp/skilld-supported-repos.sql
 */

import process from 'node:process'
import { initialSupportedRepos } from '../server/utils/supported-sources'

const EMIT_SQL = process.argv.includes('--emit-sql')
const REVIEWED_BY = process.env.REVIEWED_BY || 'system'

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')
const sqlString = (s: string) => `'${escape(s)}'`

function main() {
  const now = Math.floor(Date.now() / 1000)
  console.error(`[supported-repos] repos=${initialSupportedRepos.length} emit=${EMIT_SQL ? 'yes' : 'no'}`)

  if (!EMIT_SQL)
    return

  console.log('-- seed-supported-repos')
  for (const repo of initialSupportedRepos) {
    console.log(
      `INSERT INTO supported_repos (
         owner, repo, support_tier, enabled, reason, reviewed_by, reviewed_at, updated_at
       ) VALUES (
         ${sqlString(repo.owner)}, ${sqlString(repo.repo)}, ${sqlString(repo.supportTier)}, 1,
         ${sqlString(repo.reason)}, ${sqlString(REVIEWED_BY)}, ${now}, ${now}
       )
       ON CONFLICT(owner, repo) DO UPDATE SET
         support_tier = excluded.support_tier,
         enabled = excluded.enabled,
         reason = excluded.reason,
         reviewed_by = excluded.reviewed_by,
         reviewed_at = excluded.reviewed_at,
         updated_at = excluded.updated_at;`,
    )
  }
}

main()
