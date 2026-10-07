/// <reference types="@cloudflare/workers-types" />

import type { ReadThroughCache } from '#shared/server/cache'
import type { RepositoryName } from './repository-move'
import { readCache, writeCache } from '#shared/server/cache'

/** An old Repository name and the registry identity it moved to. */
export interface RepositoryAlias {
  owner: string
  repo: string
  targetOwner: string
  targetRepo: string
  /** The root Skill name under the old name, when the move renamed it. */
  rootSkill: string | null
  targetRootSkill: string | null
}

interface RepositoryAliasRow {
  owner: string
  repo: string
  target_owner: string
  target_repo: string
  root_skill: string | null
  target_root_skill: string | null
}

export type MovedRepositoryRoute
  = | { _tag: 'pass' }
    | { _tag: 'redirect', location: string }

export const REPOSITORY_ALIASES_CACHE_KEY = 'repos:aliases:v1'
/** Seconds. A new alias waits at most this long before its URLs redirect. */
export const REPOSITORY_ALIASES_CACHE_TTL = 15 * 60

// A registry row under an old name means GitHub gave that name to another
// Repository and the registry admitted it, so the name is live again.
const ALIAS_COLUMNS = `a.owner, a.repo, a.target_owner, a.target_repo, a.root_skill, a.target_root_skill`
const LIVE_NAME = `EXISTS (SELECT 1 FROM repos r WHERE a.owner = r.owner AND a.repo = r.repo)`

export const REPOSITORY_ALIASES_SQL = `
  SELECT ${ALIAS_COLUMNS}
  FROM repo_aliases a
  WHERE NOT ${LIVE_NAME}
`

function toAlias(row: RepositoryAliasRow): RepositoryAlias {
  return {
    owner: row.owner,
    repo: row.repo,
    targetOwner: row.target_owner,
    targetRepo: row.target_repo,
    rootSkill: row.root_skill,
    targetRootSkill: row.target_root_skill,
  }
}

/** The alias an old name answers with, matched without case, or null. */
export async function findRepositoryAlias(db: D1Database, name: RepositoryName): Promise<RepositoryAlias | null> {
  const row = await db
    .prepare(`SELECT ${ALIAS_COLUMNS} FROM repo_aliases a WHERE a.owner = ?1 AND a.repo = ?2 AND NOT ${LIVE_NAME}`)
    .bind(name.owner, name.repo)
    .first<RepositoryAliasRow>()
  return row ? toAlias(row) : null
}

export async function selectRepositoryAliases(db: D1Database): Promise<RepositoryAlias[]> {
  const rows = await db.prepare(REPOSITORY_ALIASES_SQL).bind().all<RepositoryAliasRow>()
  return (rows.results ?? []).map(toAlias)
}

/**
 * Every live alias for this request, or null when neither store answers.
 *
 * This runs on every `/gh` request, so the set comes from the cache. A
 * failure costs one request the redirect: the old URL renders what it did
 * before the move. Failing the request would cost the visitor the page. The
 * wide event carries the reason, so an outage shows up as a spike.
 */
export async function loadRepositoryAliases(
  cache: ReadThroughCache,
  db: D1Database,
): Promise<RepositoryAlias[] | null> {
  const cached = await readCache<RepositoryAlias[]>(cache, REPOSITORY_ALIASES_CACHE_KEY)
  if (Array.isArray(cached))
    return cached

  try {
    const aliases = await selectRepositoryAliases(db)
    await writeCache(cache, REPOSITORY_ALIASES_CACHE_KEY, aliases, { ttl: REPOSITORY_ALIASES_CACHE_TTL })
    return aliases
  }
  catch (error) {
    emitOperationalEvent(createWideEvent({
      operation: 'repository-aliases',
      outcome: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}

const aliasKey = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase()

export function indexRepositoryAliases(aliases: readonly RepositoryAlias[]): ReadonlyMap<string, RepositoryAlias> {
  return new Map(aliases.map(alias => [aliasKey(alias.owner, alias.repo), alias]))
}

/**
 * The owner and Repository segments of a `/gh` path, when it has both. Only
 * these paths can sit under a moved Repository.
 */
export function repositoryPathSegments(pathname: string): { owner: string, repo: string, rest: string[] } | null {
  if (!pathname.startsWith('/gh/'))
    return null
  const [owner, repo, ...rest] = pathname.slice('/gh/'.length).split('/')
  return owner && repo ? { owner, repo, rest } : null
}

/**
 * Send a URL under a moved Repository to the same place under its new name,
 * in one 301. The Repository hub, every Skill page, file deep links, and the
 * agent `.md` copies all move. The query string stays.
 */
export function resolveMovedRepositoryRoute(
  pathname: string,
  search: string,
  aliases: ReadonlyMap<string, RepositoryAlias>,
): MovedRepositoryRoute {
  const path = repositoryPathSegments(pathname)
  if (!path)
    return { _tag: 'pass' }

  const exact = aliases.get(aliasKey(path.owner, path.repo))
  // `/gh/<owner>/<repo>.md` is the agent copy of the Repository hub.
  const markdown = !exact && path.rest.length === 0 && path.repo.toLowerCase().endsWith('.md')
    ? aliases.get(aliasKey(path.owner, path.repo.slice(0, -'.md'.length)))
    : undefined
  const alias = exact ?? markdown
  if (!alias)
    return { _tag: 'pass' }

  const repo = markdown ? `${alias.targetRepo}.md` : alias.targetRepo
  const [skill, ...below] = path.rest
  const rest = skill === undefined ? [] : [movedSkillSegment(skill, alias), ...below]
  return {
    _tag: 'redirect',
    location: `/gh/${[alias.targetOwner, repo, ...rest].join('/')}${search}`,
  }
}

/** A root Skill takes the Repository name, so its segment moves with it. */
function movedSkillSegment(segment: string, alias: RepositoryAlias): string {
  if (!alias.rootSkill || !alias.targetRootSkill)
    return segment
  const lower = segment.toLowerCase()
  if (lower === alias.rootSkill)
    return alias.targetRootSkill
  if (lower === `${alias.rootSkill}.md`)
    return `${alias.targetRootSkill}.md`
  return segment
}
