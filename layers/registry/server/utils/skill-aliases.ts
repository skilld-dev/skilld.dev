/// <reference types="@cloudflare/workers-types" />

import type { ReadThroughCache } from '#shared/server/cache'
import { readCache, writeCache } from '#shared/server/cache'
import { repositoryPathSegments } from './repository-aliases'

/** An old Skill name and the name the Skill now lives under (ADR-0017). */
export interface SkillAlias {
  owner: string
  repo: string
  name: string
  targetName: string
}

interface SkillAliasRow {
  owner: string
  repo: string
  name: string
  target_name: string
}

export type RenamedSkillRoute
  = | { _tag: 'pass' }
    | { _tag: 'redirect', location: string }

export const SKILL_ALIASES_CACHE_KEY = 'skills:aliases:v1'
/** Seconds. A new alias waits at most this long before its URLs redirect. */
export const SKILL_ALIASES_CACHE_TTL = 15 * 60

// An admitted row under the old name means the author brought the name back.
const ALIAS_COLUMNS = `a.owner, a.repo, a.name, a.target_name`
const LIVE_NAME = `EXISTS (
  SELECT 1 FROM skills s
  WHERE s.owner = a.owner AND s.repo = a.repo AND s.name = a.name AND s.source_resolved = 1)`

export const SKILL_ALIASES_SQL = `
  SELECT ${ALIAS_COLUMNS}
  FROM skill_aliases a
  WHERE NOT ${LIVE_NAME}
`

function toAlias(row: SkillAliasRow): SkillAlias {
  return { owner: row.owner, repo: row.repo, name: row.name, targetName: row.target_name }
}

/** The alias an old Skill name answers with, matched without case, or null. */
export async function findSkillAlias(
  db: D1Database,
  skill: { owner: string, repo: string, name: string },
): Promise<SkillAlias | null> {
  const row = await db
    .prepare(`SELECT ${ALIAS_COLUMNS} FROM skill_aliases a WHERE a.owner = ? AND a.repo = ? AND a.name = ? AND NOT ${LIVE_NAME}`)
    .bind(skill.owner, skill.repo, skill.name)
    .first<SkillAliasRow>()
  return row ? toAlias(row) : null
}

export async function selectSkillAliases(db: D1Database): Promise<SkillAlias[]> {
  const rows = await db.prepare(SKILL_ALIASES_SQL).bind().all<SkillAliasRow>()
  return (rows.results ?? []).map(toAlias)
}

/**
 * Every live alias for this request, or null when neither store answers.
 *
 * This runs on every `/gh` Skill request, so the set comes from the cache. A
 * failure costs one request the redirect: the old URL renders what it did
 * before the rename. The wide event carries the reason.
 */
export async function loadSkillAliases(
  cache: ReadThroughCache,
  db: D1Database,
): Promise<SkillAlias[] | null> {
  const cached = await readCache<SkillAlias[]>(cache, SKILL_ALIASES_CACHE_KEY)
  if (Array.isArray(cached))
    return cached

  try {
    const aliases = await selectSkillAliases(db)
    await writeCache(cache, SKILL_ALIASES_CACHE_KEY, aliases, { ttl: SKILL_ALIASES_CACHE_TTL })
    return aliases
  }
  catch (error) {
    emitOperationalEvent(createWideEvent({
      operation: 'skill-aliases',
      outcome: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}

const aliasKey = (owner: string, repo: string, name: string) => `${owner}/${repo}/${name}`.toLowerCase()

export function indexSkillAliases(aliases: readonly SkillAlias[]): ReadonlyMap<string, SkillAlias> {
  return new Map(aliases.map(alias => [aliasKey(alias.owner, alias.repo, alias.name), alias]))
}

/**
 * Send a URL under a renamed Skill to the same place under its new name, in
 * one 301. The Skill page, its file deep links, and its agent `.md` copy all
 * follow. The owner and Repository segments and the query string stay.
 */
export function resolveRenamedSkillRoute(
  pathname: string,
  search: string,
  aliases: ReadonlyMap<string, SkillAlias>,
): RenamedSkillRoute {
  const path = repositoryPathSegments(pathname)
  const [segment, ...below] = path?.rest ?? []
  if (!path || !segment)
    return { _tag: 'pass' }

  const exact = aliases.get(aliasKey(path.owner, path.repo, segment))
  // `/gh/<owner>/<repo>/<name>.md` is the agent copy of the Skill page.
  const markdown = !exact && below.length === 0 && segment.toLowerCase().endsWith('.md')
    ? aliases.get(aliasKey(path.owner, path.repo, segment.slice(0, -'.md'.length)))
    : undefined
  const alias = exact ?? markdown
  if (!alias)
    return { _tag: 'pass' }

  const name = markdown ? `${alias.targetName}.md` : alias.targetName
  return {
    _tag: 'redirect',
    location: `/gh/${[path.owner, path.repo, name, ...below].join('/')}${search}`,
  }
}
