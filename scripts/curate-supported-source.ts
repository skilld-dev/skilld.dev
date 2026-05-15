/**
 * Emit SQL for supported-source curation.
 *
 * Examples:
 *   pnpm tsx scripts/curate-supported-source.ts repo include anthropics/skills --reason "Official Anthropic source" --tier core-official --emit-sql
 *   pnpm tsx scripts/curate-supported-source.ts repo exclude owner/repo --reason "Thin generated repo" --emit-sql
 *   pnpm tsx scripts/curate-supported-source.ts repo quarantine owner/repo --reason "Broken source metadata" --emit-sql
 *   pnpm tsx scripts/curate-supported-source.ts skill include owner/repo/name --reason "Curated exception" --emit-sql
 *   pnpm tsx scripts/curate-supported-source.ts skill exclude owner/repo/name --reason "Thin duplicate" --emit-sql
 */

import process from 'node:process'
import { parseArgs } from 'node:util'

const SUPPORT_TIERS = new Set(['core-official', 'trusted-author', 'curated', 'candidate'])
const SQUOTE_RE = /'/g

function escape(s: string): string {
  return s.replace(SQUOTE_RE, '\'\'')
}

function sqlString(s: string): string {
  return `'${escape(s)}'`
}

function usage(): never {
  console.error(`Usage:
  pnpm tsx scripts/curate-supported-source.ts repo <include|exclude|quarantine> <owner/repo> --reason <text> [--tier <tier>] [--reviewed-by <name>] --emit-sql
  pnpm tsx scripts/curate-supported-source.ts skill <include|exclude> <owner/repo/name|owner/name> --reason <text> [--reviewed-by <name>] --emit-sql

Tiers: core-official, trusted-author, curated, candidate`)
  process.exit(1)
}

function splitRepo(ref: string): { owner: string, repo: string } {
  const parts = ref.split('/').filter(Boolean)
  if (parts.length !== 2)
    usage()
  return { owner: parts[0]!, repo: parts[1]! }
}

function splitSkill(ref: string): { owner: string, repo: string | null, name: string } {
  const parts = ref.split('/').filter(Boolean)
  if (parts.length === 2)
    return { owner: parts[0]!, repo: null, name: parts[1]! }
  if (parts.length >= 3)
    return { owner: parts[0]!, repo: parts[1]!, name: parts.slice(2).join('/') }
  usage()
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'emit-sql': { type: 'boolean' },
    'reason': { type: 'string' },
    'reviewed-by': { type: 'string' },
    'tier': { type: 'string' },
    'notes': { type: 'string' },
  },
})

const [scope, action, ref] = positionals
const reason = values.reason?.trim()
const reviewedBy = values['reviewed-by']?.trim() || process.env.REVIEWED_BY || 'admin'
const notes = values.notes?.trim() || null
const now = Math.floor(Date.now() / 1000)

if (!scope || !action || !ref || !reason)
  usage()

const statements: string[] = []

if (scope === 'repo') {
  if (!['include', 'exclude', 'quarantine'].includes(action))
    usage()
  const { owner, repo } = splitRepo(ref)
  const tier = values.tier?.trim() || (action === 'include' ? 'curated' : 'candidate')
  if (!SUPPORT_TIERS.has(tier)) {
    console.error(`[curate] Unsupported tier: ${tier}`)
    usage()
  }
  const enabled = action === 'include' ? 1 : 0
  statements.push(
    `INSERT INTO supported_repos (
       owner, repo, support_tier, enabled, reason, reviewed_by, reviewed_at, notes, updated_at
     ) VALUES (
       ${sqlString(owner)}, ${sqlString(repo)}, ${sqlString(tier)}, ${enabled},
       ${sqlString(reason)}, ${sqlString(reviewedBy)}, ${now}, ${notes ? sqlString(notes) : 'NULL'}, ${now}
     )
     ON CONFLICT(owner, repo) DO UPDATE SET
       support_tier = excluded.support_tier,
       enabled = excluded.enabled,
       reason = excluded.reason,
       reviewed_by = excluded.reviewed_by,
       reviewed_at = excluded.reviewed_at,
       notes = excluded.notes,
       updated_at = excluded.updated_at;`,
  )

  if (action === 'quarantine') {
    statements.push(
      `INSERT INTO repo_trust_overrides (
         owner, repo, tier, source, reason, reviewed_by, reviewed_at, notes, updated_at
       ) VALUES (
         ${sqlString(owner)}, ${sqlString(repo)}, 'quarantined', 'manual',
         ${sqlString(reason)}, ${sqlString(reviewedBy)}, ${now}, ${notes ? sqlString(notes) : 'NULL'}, ${now}
       )
       ON CONFLICT(owner, repo) DO UPDATE SET
         tier = excluded.tier,
         source = excluded.source,
         reason = excluded.reason,
         reviewed_by = excluded.reviewed_by,
         reviewed_at = excluded.reviewed_at,
         notes = excluded.notes,
         updated_at = excluded.updated_at;`,
    )
  }
}
else if (scope === 'skill') {
  if (!['include', 'exclude'].includes(action))
    usage()
  const { owner, repo, name } = splitSkill(ref)
  statements.push(
    `INSERT INTO supported_skills (
       owner, name, repo, support_mode, reason, reviewed_by, reviewed_at, notes, updated_at
     ) VALUES (
       ${sqlString(owner)}, ${sqlString(name)}, ${repo ? sqlString(repo) : 'NULL'}, ${sqlString(action)},
       ${sqlString(reason)}, ${sqlString(reviewedBy)}, ${now}, ${notes ? sqlString(notes) : 'NULL'}, ${now}
     )
     ON CONFLICT(owner, repo, name) DO UPDATE SET
       repo = excluded.repo,
       support_mode = excluded.support_mode,
       reason = excluded.reason,
       reviewed_by = excluded.reviewed_by,
       reviewed_at = excluded.reviewed_at,
       notes = excluded.notes,
       updated_at = excluded.updated_at;`,
  )
}
else {
  usage()
}

console.error(`[curate] scope=${scope} action=${action} ref=${ref} statements=${statements.length} emit=${values['emit-sql'] ? 'yes' : 'no'}`)

if (!values['emit-sql']) {
  console.error('[curate] Dry run only. Add --emit-sql and pipe to wrangler d1 execute to apply.')
  process.exit(0)
}

console.log('-- curate-supported-source')
for (const statement of statements)
  console.log(statement)
