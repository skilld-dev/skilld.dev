/// <reference types="@cloudflare/workers-types" />

import { registrySkillName } from './skill-frontmatter'

export interface RepositoryName {
  owner: string
  repo: string
}

/**
 * One Repository move: every registry row under `from` moves to `to` in one
 * D1 batch, and `from` stays as an alias that answers its URLs with a 301.
 * ADR-0015 says why the registry follows GitHub here.
 */
export interface RepositoryMove {
  /** The registry identity the rows carry now, exactly as stored. */
  from: RepositoryName
  /** The registry identity the rows carry after the move. */
  to: RepositoryName
  /** GitHub's own spelling of the new name, kept as the source identity. */
  source: RepositoryName
  /** GitHub's numeric Repository ID, which survives renames and transfers. */
  repositoryId: number
  /** Unix seconds. */
  movedAt: number
}

export type MoveSqlValue = string | number

export interface MoveStatement {
  sql: string
  params: MoveSqlValue[]
}

/** GitHub compares owner and Repository names without case. */
export function sameRepositoryName(left: RepositoryName, right: RepositoryName): boolean {
  return left.owner.toLowerCase() === right.owner.toLowerCase()
    && left.repo.toLowerCase() === right.repo.toLowerCase()
}

/**
 * The registry identity for a Repository GitHub now serves as `current`.
 *
 * The registry stores names in lowercase. When it already holds the new name,
 * in any case, the rows merge into that row and keep its spelling.
 */
export function movedRegistryName(current: RepositoryName, held: RepositoryName | null): RepositoryName {
  return held ?? { owner: current.owner.toLowerCase(), repo: current.repo.toLowerCase() }
}

/** The row the registry already holds under a name, with its GitHub identity. */
export interface HeldRepositoryName extends RepositoryName {
  /** The GitHub Repository ID the held row belongs to, when the registry knows it. */
  repositoryId: number | null
}

/**
 * What a move into the registry may do. A held name merges only when the
 * held row is not provably another Repository's: a stale row GitHub no
 * longer serves can occupy a name, and merging into it would absorb a
 * different Repository's rows. The move is refused for review instead.
 */
export type RepositoryMovePlan
  = | { _tag: 'merge', to: RepositoryName }
    | { _tag: 'held', heldBy: number }

export function planRepositoryMove(
  current: RepositoryName,
  held: HeldRepositoryName | null,
  repositoryId: number,
): RepositoryMovePlan {
  if (held?.repositoryId != null && held.repositoryId !== repositoryId)
    return { _tag: 'held', heldBy: held.repositoryId }
  return { _tag: 'merge', to: movedRegistryName(current, held) }
}

/**
 * The registry row that already holds a name, matched without case, or null.
 */
export async function findHeldRepositoryName(db: D1Database, name: RepositoryName): Promise<HeldRepositoryName | null> {
  const row = await db
    .prepare(`
      SELECT owner, repo, repository_id
      FROM repos
      WHERE owner = ?1 COLLATE NOCASE AND repo = ?2 COLLATE NOCASE
      ORDER BY (owner = lower(?1) AND repo = lower(?2)) DESC
      LIMIT 1`)
    .bind(name.owner, name.repo)
    .first<{ owner: string, repo: string, repository_id: number | null }>()
  return row ? { owner: row.owner, repo: row.repo, repositoryId: row.repository_id } : null
}

/** Apply one move as a single D1 batch, so it lands whole or not at all. */
export async function moveRepository(db: D1Database, move: RepositoryMove): Promise<void> {
  await db.batch(repositoryMoveStatements(move).map(statement => db.prepare(statement.sql).bind(...statement.params)))
}

// The registry name of the root Skill under the old name. A root Skill takes
// the Repository name, so a renamed Repository renames it.
const ROOT_SKILL = `(SELECT name FROM skills WHERE owner = :from_owner AND repo = :from_repo AND rendered_skill_path = 'SKILL.md' LIMIT 1)`
const movedSkillName = (column: string) => `CASE WHEN ${column} = ${ROOT_SKILL} THEN :root_name ELSE ${column} END`
const movedRowName = (row = '') => `CASE WHEN ${row}rendered_skill_path = 'SKILL.md' THEN :root_name ELSE ${row}name END`

interface KeyedTable {
  table: string
  repo?: string
  /** The Skill name column, for a table that holds Skills. */
  name?: string
  /** Rows the move leaves under the old name. */
  keep?: string
}

const skillTable = (table: string, options: Omit<KeyedTable, 'table'> = {}): KeyedTable => ({ table, name: 'name', ...options })

/**
 * Tables that hold one row per Skill. A merge keeps the row already under the
 * new name, so `UPDATE OR IGNORE` skips a clash and the delete clears it.
 *
 * The `embedding` marker stays under the old name on purpose. The vector ID
 * hashes owner, Repository, and name, so the old vector is an orphan the
 * nightly prune finds through that marker, and the missing marker under the
 * new name queues a fresh embedding.
 */
const SKILL_TABLES: KeyedTable[] = [
  skillTable('skill_likes'),
  skillTable('skill_revisions'),
  skillTable('skill_generated', { keep: `kind = 'embedding'` }),
  skillTable('skill_dirty'),
  skillTable('skill_trending_admissions'),
  skillTable('skill_trending_awards'),
  skillTable('weekly_skill_sends'),
  skillTable('supported_skills'),
  skillTable('activity'),
  skillTable('collection_skills_v2'),
  skillTable('artifact_run_checks', { repo: 'repository' }),
  skillTable('x_post_skills', { name: 'slug' }),
]

/**
 * Tables that hold one row per Repository.
 *
 * Discovery rows and skills.sh observations stay: they record the name a
 * source used. `repo_sync_progress` stays too, because a running sync job
 * reads its checkpoint by the name it was queued under.
 */
const REPOSITORY_TABLES: KeyedTable[] = [
  { table: 'repo_star_observations' },
  { table: 'repo_star_surges' },
  { table: 'repo_kind_overrides' },
  { table: 'repo_trust_overrides' },
  { table: 'skill_repo_eligibility' },
  { table: 'skill_repo_focus' },
  { table: 'skill_repo_review_sync_outbox' },
  { table: 'supported_repos' },
  { table: 'skillgen_repositories' },
  { table: 'user_starred_repos' },
  { table: 'skill_subscriptions' },
  { table: 'x_post_repos' },
]

// Every column but the key, so the copy under the new name keeps them all.
const REPOS_COLUMNS = [
  'default_branch',
  'stars',
  'forks',
  'pushed_at',
  'repo_created_at',
  'repo_meta_synced_at',
  'last_tree_sha',
  'repo_kind',
  'repo_kind_source',
  'repo_skill_count',
  'broken_since',
  'source_owner',
  'source_repo',
  'description',
  'tree_truncated_at',
  'repository_id',
].join(', ')

function moveRows({ table, repo = 'repo', name, keep }: KeyedTable): string[] {
  const where = `owner = :from_owner AND ${repo} = :from_repo${keep ? ` AND NOT (${keep})` : ''}`
  const rename = name === undefined ? '' : `, ${name} = ${movedSkillName(name)}`
  return [
    `UPDATE OR IGNORE ${table} SET owner = :to_owner, ${repo} = :to_repo${rename} WHERE ${where}`,
    `DELETE FROM ${table} WHERE ${where}`,
  ]
}

const MOVE_SQL: string[] = [
  // The row under the new name has to exist before any row that references it.
  `INSERT OR IGNORE INTO repos (owner, repo, ${REPOS_COLUMNS})
   SELECT :to_owner, :to_repo, ${REPOS_COLUMNS} FROM repos WHERE owner = :from_owner AND repo = :from_repo`,
  `UPDATE repos SET repository_id = :repository_id, source_owner = :source_owner, source_repo = :source_repo
   WHERE owner = :to_owner AND repo = :to_repo`,

  // The old name becomes an alias. A repeat of the same move keeps the first
  // date and the root Skill it saw.
  `INSERT INTO repo_aliases (owner, repo, repository_id, target_owner, target_repo, root_skill, target_root_skill, moved_at)
   SELECT :from_owner, :from_repo, :repository_id, :to_owner, :to_repo, root.name,
     CASE WHEN root.name IS NULL THEN NULL ELSE :root_name END, :moved_at
   FROM (SELECT ${ROOT_SKILL} AS name) AS root
   WHERE true
   ON CONFLICT (owner, repo) DO UPDATE SET
     repository_id = excluded.repository_id,
     target_owner = excluded.target_owner,
     target_repo = excluded.target_repo,
     root_skill = COALESCE(excluded.root_skill, repo_aliases.root_skill),
     target_root_skill = CASE WHEN COALESCE(excluded.root_skill, repo_aliases.root_skill) IS NULL THEN NULL ELSE :root_name END,
     moved_at = CASE
       WHEN repo_aliases.target_owner = excluded.target_owner AND repo_aliases.target_repo = excluded.target_repo
       THEN repo_aliases.moved_at
       ELSE excluded.moved_at
     END`,
  // An older alias points straight at the new name, so no redirect chains.
  `UPDATE repo_aliases
   SET target_owner = :to_owner, target_repo = :to_repo,
     target_root_skill = CASE WHEN target_root_skill IS NULL THEN NULL ELSE :root_name END
   WHERE target_owner = :from_owner AND target_repo = :from_repo`,
  // The new name is live, so it is nobody's alias. This also ends a move back.
  `DELETE FROM repo_aliases WHERE owner = :to_owner AND repo = :to_repo`,

  // Social posts key a Skill by its `owner/name` slug.
  `UPDATE OR IGNORE skill_social_posts
   SET skill_slug = (
     SELECT :to_owner || '/' || ${movedRowName('s.')}
     FROM skills s
     WHERE s.owner = :from_owner AND s.repo = :from_repo AND s.slug = skill_social_posts.skill_slug
     LIMIT 1)
   WHERE skill_slug IN (SELECT slug FROM skills WHERE owner = :from_owner AND repo = :from_repo)`,
  `DELETE FROM skill_social_posts
   WHERE skill_slug IN (
     SELECT slug FROM skills
     WHERE owner = :from_owner AND repo = :from_repo AND slug <> :to_owner || '/' || ${movedRowName()})`,

  // A collection that already lists the Skill under the new name keeps one entry.
  `DELETE FROM collection_skills_v2
   WHERE owner = :from_owner AND repo = :from_repo
     AND EXISTS (
       SELECT 1 FROM collection_skills_v2 kept
       WHERE kept.collection_id = collection_skills_v2.collection_id
         AND kept.owner = :to_owner AND kept.repo = :to_repo
         AND kept.name = ${movedSkillName('collection_skills_v2.name')})`,
  ...SKILL_TABLES.flatMap(moveRows),

  `UPDATE OR IGNORE skills
   SET owner = :to_owner, repo = :to_repo, name = ${movedRowName()}, slug = :to_owner || '/' || ${movedRowName()}
   WHERE owner = :from_owner AND repo = :from_repo`,
  `DELETE FROM skills WHERE owner = :from_owner AND repo = :from_repo`,
  // Trust, indexability, and the counters read the moved and merged rows.
  `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
   SELECT owner, repo, name, 'repository_moved', :moved_at, 0 FROM skills WHERE owner = :to_owner AND repo = :to_repo`,
  // The agent sitemap lists these routes, and the old ones now answer 301.
  // '0' sorts right after '/', so the range is every route under the old name
  // and stays on the route index.
  `DELETE FROM ai_ready_pages
   WHERE route = :old_route OR (route >= :old_route || '/' AND route < :old_route || '0')`,

  ...REPOSITORY_TABLES.flatMap(moveRows),
  `DELETE FROM repos WHERE owner = :from_owner AND repo = :from_repo`,
]

const TOKEN = /:([a-z_]+)/g

/**
 * The statements of one move, in order, each with exactly the parameters it
 * uses. D1 rejects a statement bound with more values than it names.
 */
export function repositoryMoveStatements(move: RepositoryMove): MoveStatement[] {
  const values = moveValues(move)
  return MOVE_SQL.map((template) => {
    const order: string[] = []
    const sql = template.replace(TOKEN, (_, token: string) => {
      if (!order.includes(token))
        order.push(token)
      return `?${order.indexOf(token) + 1}`
    })
    return { sql, params: order.map(token => values[token]!) }
  })
}

/**
 * The same move as one SQL script with the values inlined, for
 * `wrangler d1 execute --file`. Wrangler runs a file in one transaction.
 */
export function repositoryMoveSql(move: RepositoryMove): string {
  const values = moveValues(move)
  const header = `-- Move ${move.from.owner}/${move.from.repo} to ${move.to.owner}/${move.to.repo} (Repository ${move.repositoryId})`
  const statements = MOVE_SQL.map(template => `${template.replace(TOKEN, (_, token: string) => sqlLiteral(values[token]!))};`)
  return [header, ...statements].join('\n')
}

function moveValues(move: RepositoryMove): Record<string, MoveSqlValue> {
  if (sameRepositoryName(move.from, move.to))
    throw new Error(`A Repository cannot move to its own name: ${move.from.owner}/${move.from.repo}`)
  return {
    from_owner: move.from.owner,
    from_repo: move.from.repo,
    to_owner: move.to.owner,
    to_repo: move.to.repo,
    source_owner: move.source.owner,
    source_repo: move.source.repo,
    repository_id: move.repositoryId,
    moved_at: move.movedAt,
    root_name: registrySkillName('.', move.to.repo),
    old_route: `/gh/${move.from.owner}/${move.from.repo}`.toLowerCase(),
  }
}

function sqlLiteral(value: MoveSqlValue): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new Error(`Expected an integer SQL value, got ${value}`)
    return String(value)
  }
  return `'${value.replaceAll('\'', '\'\'')}'`
}
