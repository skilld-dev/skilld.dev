import type { H3Event } from 'h3'
import type { Platform } from '#shared/server/platform'
import type { SkillSearchQuery } from '#shared/skill-search-query'
import type { IntentOutcome, IntentReport } from './search-intent'
import type { SearchIntentDeps } from './search-intent-run'
import type { SearchMode } from './skill-search'
import type { RegistrySkill } from './skills-registry'
import { getHeader } from 'h3'
import { classifySearchQuery } from '#shared/skill-search-query'
import { runAfterResponse } from './after-response'
import { notBrokenSql } from './broken'
import { planIntentSearch } from './search-intent'
import { querySkills } from './skills-registry'

/**
 * The search box: one query, classified, answered by the right lane.
 *
 * - a GitHub URL or `owner/repo`: that Repository and its Skills, or the
 *   index flow when the registry does not hold it yet;
 * - `@login`: that owner's Skills;
 * - one word or a full Skill ref: the hybrid search, unchanged;
 * - a sentence: query understanding first, then the hybrid search.
 */

export type BoxRepository
  = | { _tag: 'indexed', owner: string, repo: string, stars: number, skillCount: number }
    | { _tag: 'not-indexed', owner: string, repo: string, url: string }

export interface SkillBoxSearchResult {
  kind: SkillSearchQuery['_tag']
  repository: BoxRepository | null
  /** The owner the results are limited to, when the query named one. */
  owner: string | null
  intent: IntentOutcome | null
  items: RegistrySkill[]
  total: number
  mode?: SearchMode
}

interface RepositoryRow {
  owner: string
  repo: string
  stars: number | null
  skill_count: number
}

const NOT_BROKEN_SQL = notBrokenSql('r')

/** Identities are stored lowercase, so an exact match keeps the primary key index. */
async function findRepository(db: D1Database, owner: string, repo: string): Promise<RepositoryRow | null> {
  return db.prepare(
    `SELECT r.owner, r.repo, r.stars,
       (SELECT COUNT(*) FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo AND s.source_resolved = 1) AS skill_count
     FROM repos r
     WHERE r.owner = ? AND r.repo = ? AND ${NOT_BROKEN_SQL}`,
  ).bind(owner, repo).first<RepositoryRow>()
}

async function ownerExists(db: D1Database, login: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM skills WHERE owner = ? AND source_resolved = 1 LIMIT 1').bind(login).first()
  return row !== null
}

/** The model spells "matt pocock" as `matt-pocock`; the login is `mattpocock`. */
async function verifiedOwner(db: D1Database, author: string | null): Promise<string | null> {
  if (!author)
    return null
  for (const candidate of new Set([author, author.replace(/-/g, '')])) {
    if (await ownerExists(db, candidate))
      return candidate
  }
  return null
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Bindings for {@link understandSearchQuery}. The model call shares the
 * guest API allowance's limiter under its own key, so a burst spends the
 * model budget, never search itself: over the limit, search runs on the
 * typed words. The client IP is the limiter key only and is never stored.
 */
export function searchIntentDeps(event: H3Event, platform: Platform): SearchIntentDeps {
  const limiter = platform.env.API_GUEST_RATE_LIMIT
  return {
    ai: platform.ai as unknown as SearchIntentDeps['ai'],
    // Global KV, not the per-colo Cache API: see SearchIntentDeps.storage.
    storage: useStorage('cache'),
    allow: async () => {
      if (!limiter)
        return true
      const ip = getHeader(event, 'cf-connecting-ip') ?? 'unknown'
      const { success } = await limiter.limit({ key: `search-intent:${ip}` })
      return success
    },
    schedule: promise => runAfterResponse(event, promise),
    digest: sha256Hex,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: () => Date.now(),
    // One event per model call or skip, never with the query. The field
    // validator needs each event as an object literal.
    report: (report) => {
      if (report._tag === 'skipped') {
        emitOperationalEvent(createWideEvent({ operation: 'search-intent', outcome: 'skipped', reason: report.reason }), intentReportLevel(report))
        return
      }
      emitOperationalEvent(createWideEvent({
        'operation': 'search-intent',
        'outcome': report.result,
        'reason': report._tag === 'late' ? 'late-reply' : 'model-call',
        'model.durationMs': report.modelMs,
      }), intentReportLevel(report))
    },
  }
}

/** A missing binding or a failing model is a fault. Everything else is information. */
export function intentReportLevel(report: IntentReport): 'info' | 'warn' {
  if (report._tag === 'skipped')
    return report.reason === 'binding-missing' ? 'warn' : 'info'
  return report.result === 'model-error' || report.result === 'invalid-response' ? 'warn' : 'info'
}

interface BoxSearchInput {
  q: string
  limit: number
  officialOwners: Set<string>
}

function empty(): { items: RegistrySkill[], total: number } {
  return { items: [], total: 0 }
}

/**
 * Answer one search box query. `intent` is what query understanding made of
 * an intent query, read before the answer cache so the cache key can name it.
 * It is null for every other kind.
 */
export async function searchSkillBox(
  event: H3Event,
  platform: Platform,
  input: BoxSearchInput,
  intent: IntentOutcome | null,
): Promise<SkillBoxSearchResult> {
  const query = classifySearchQuery(input.q)
  const { limit, officialOwners } = input
  const base = { kind: query._tag, repository: null, owner: null, intent: null }
  const search = (text: string) => querySkills(event, { search: text, limit, officialOwners })

  switch (query._tag) {
    case 'empty':
      return { ...base, ...empty() }

    case 'repository': {
      const { owner, repo, url } = query.repository
      const found = await findRepository(platform.db, owner, repo)
      if (found && found.skill_count > 0) {
        const listed = await querySkills(event, { owner: found.owner, repo: found.repo, limit, officialOwners })
        return {
          ...base,
          repository: { _tag: 'indexed', owner: found.owner, repo: found.repo, stars: found.stars ?? 0, skillCount: found.skill_count },
          owner: found.owner,
          items: listed.items,
          total: listed.total,
        }
      }
      // A bare `owner/repo` may be words ("ci/cd"), so it still searches.
      // A pasted URL is unambiguous: the answer is the index flow alone.
      const fallback = query.source === 'ref' ? await search(`${owner}/${repo}`) : empty()
      return { ...base, repository: { _tag: 'not-indexed', owner, repo, url }, ...fallback }
    }

    case 'owner': {
      const listed = await querySkills(event, { owner: query.login, limit, officialOwners })
      if (listed.total > 0)
        return { ...base, owner: query.login, items: listed.items, total: listed.total }
      return { ...base, ...(await search(query.login)) }
    }

    case 'skill':
      return { ...base, ...(await search(`${query.owner}/${query.repo}/${query.name}`)) }

    case 'name':
      return { ...base, ...(await search(query.text)) }

    case 'intent': {
      const plan = planIntentSearch(query.text, intent?._tag === 'understood' ? intent.understanding : null)
      const owner = await verifiedOwner(platform.db, plan.owner)
      const run = (ownerFilter: string | null) => querySkills(event, {
        search: plan.search,
        intent: { expansion: plan.expansion, boostCategories: plan.boostCategories, boostTerm: plan.boostTerm, nameTerms: plan.nameTerms },
        owner: ownerFilter ?? undefined,
        limit,
        officialOwners,
      })
      const scoped = owner ? await run(owner) : null
      // An owner with no match for the rest of the query is a hint, not a wall.
      const result = scoped && scoped.total > 0 ? scoped : await run(null)
      return {
        ...base,
        owner: result === scoped ? owner : null,
        intent,
        items: result.items,
        total: result.total,
        mode: result.mode,
      }
    }
  }
}
