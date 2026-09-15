import type { H3Event } from 'h3'
import type { DuplicateCandidate, DuplicateGroupRecommendation } from './skill-duplicate-canonical'
import type { RegistrySkill } from './skills-registry'
import { createError } from 'h3'
import { getDB } from '#server/utils/db'
import {
  canonicalTrustFirstSort,
  duplicateRankingSignals,
  findDuplicateCanonicalGroups,
  skillSlug,
} from './skill-duplicate-canonical'
import { searchPhraseBoost } from './skill-search-phrase'
import { nameMatchBoost, semanticSkillSearch } from './skill-semantic-search'

/**
 * Reciprocal Rank Fusion constant. 60 is the value from the original Cormack
 * et al. paper and the usual default: large enough that the top few ranks are
 * not wildly over-weighted, small enough that deep ranks still decay away.
 */
export const RRF_K = 60

/** Candidate pool depth per retriever. */
// Vectorize caps metadata-rich queries at 50. That metadata carries the
// owner/repo/name key needed to hydrate each opaque vector id.
export const SEMANTIC_TOP_K = 50
export const LEXICAL_TOP_K = 200

const WHITESPACE_RE = /\s+/
// FTS5 syntax characters. Left in the token they would be parsed as operators
// (or, for a stray quote, would terminate the string literal and throw).
const FTS_SYNTAX_RE = /["^*:(){}[\],]/g
const MATCHABLE_RE = /[\p{L}\p{N}]/u

export interface SkillKeyParts {
  owner: string
  repo: string
  name: string
}

export function skillKey(parts: SkillKeyParts): string {
  return `${parts.owner}/${parts.repo}/${parts.name}`
}

/**
 * Build an FTS5 MATCH expression: every token quoted (so syntax characters are
 * inert) and prefix-matched (so `test` reaches `testing`), joined with OR.
 *
 * OR, not FTS5's implicit AND. Requiring every token means a task-shaped query
 * only matches a skill containing all of its words: "stop memory leaks"
 * returned nothing at all, because no skill contains "stop". This lane exists
 * for recall, and BM25 still ranks documents matching more (and rarer) terms
 * above documents matching one common one.
 *
 * Returns null when the query has no matchable token, which callers must treat
 * as "skip the lexical lane" rather than "match everything".
 */
export function buildFtsMatchQuery(search: string): string | null {
  const tokens = search
    .split(WHITESPACE_RE)
    .map(token => token.replace(FTS_SYNTAX_RE, ''))
    .filter(token => MATCHABLE_RE.test(token))
  return tokens.length ? tokens.map(token => `"${token}"*`).join(' OR ') : null
}

/** The FTS columns that describe a skill's identity rather than its prose. */
const IDENTIFIER_FTS_COLUMNS = 'name owner repo display_name slug'

/**
 * Build an FTS5 MATCH restricted to identifier columns.
 *
 * Search wants `description` in scope; surfaces that answer "which skills *are*
 * this thing" do not. An unqualified MATCH searches every column, so after
 * 0087 added `description` a tag page would have widened from 64 to 247 hits
 * for `testing`. Callers that key a curated, indexable page off a single term
 * want this, not `buildFtsMatchQuery`.
 */
export function buildIdentifierFtsQuery(term: string): string | null {
  const cleaned = term.replace(FTS_SYNTAX_RE, '')
  if (!MATCHABLE_RE.test(cleaned))
    return null
  return `{${IDENTIFIER_FTS_COLUMNS}} : "${cleaned}"*`
}

export interface RankedList {
  keys: string[]
  weight: number
}

/**
 * Reciprocal Rank Fusion. Combines retrievers by rank rather than by score,
 * so the lanes need no score normalisation and a retriever with an oddly
 * compressed score range (bge cosine sits in a narrow band) cannot dominate.
 */
export function fuseRankings(lists: RankedList[], k: number = RRF_K): Map<string, number> {
  const fused = new Map<string, number>()
  for (const { keys, weight } of lists) {
    if (!keys.length)
      continue
    for (let rank = 0; rank < keys.length; rank++) {
      const key = keys[rank]!
      fused.set(key, (fused.get(key) ?? 0) + weight / (k + rank + 1))
    }
  }
  return fused
}

/**
 * An exact name match is worth roughly as much as one extra retriever placing
 * the skill first. Scaling matters: `nameMatchBoost` returns 0..1 while a
 * fused RRF score tops out near 2/RRF_K, so adding it raw would make the
 * lexical name check the only thing that ever decided the order.
 */
export const NAME_BOOST_SCALE = 1 / RRF_K

/** Exact identities stay first, including Skills without an embedding. */
function isExactIdentity(skill: RegistrySkill, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  return normalized.length > 0 && [skill.name, skill.displayName, skill.slug, skillKey(skill)]
    .some(identity => identity.toLowerCase() === normalized)
}

/** Provenance breaks relevance ties; it never substitutes for relevance. */
function trustRank(skill: RegistrySkill): number {
  return duplicateRankingSignals(toDuplicateCandidate(skill)).trustTierRank
}

/** Order by exact identity, relevance, then source provenance. */
export function rankSearchResults(
  skills: RegistrySkill[],
  scoreByKey: Map<string, number>,
  search: string,
): RegistrySkill[] {
  return skills
    .map(skill => ({
      skill,
      exact: Number(isExactIdentity(skill, search)),
      trust: trustRank(skill),
      score: (scoreByKey.get(skillKey(skill)) ?? 0)
        + nameMatchBoost(skill, search) * NAME_BOOST_SCALE
        + searchPhraseBoost(skill, search) * NAME_BOOST_SCALE,
    }))
    .sort((a, b) =>
      b.exact - a.exact
      || (a.exact && b.exact ? b.trust - a.trust : 0)
      || b.score - a.score
      || b.trust - a.trust
      || b.skill.stars - a.skill.stars
      || skillKey(a.skill).localeCompare(skillKey(b.skill)))
    .map(entry => entry.skill)
}

export interface AlternateSource {
  owner: string
  repo: string
  slug: string
}

export interface CollapsedSearchResult {
  skill: RegistrySkill
  /** Other repos carrying the same skill, canonical excluded. */
  alternateSources: AlternateSource[]
  /** Total repos carrying this skill, canonical included. */
  sourceCount: number
}

function toDuplicateCandidate(skill: RegistrySkill): DuplicateCandidate {
  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    display_name: skill.displayName,
    description: skill.description,
    rendered_raw_sha256: skill.renderedRawSha256,
    stars: skill.stars,
    pushed_at: skill.pushedAt,
    // Support tier is not on RegistrySkill; trust tier alone breaks the ties
    // that repository popularity does not.
    support_tier: null,
    trust_tier: skill.trustTier,
  }
}

/**
 * Collapse skills mirrored across repos into a single canonical row. Forked
 * skill collections put the same SKILL.md under several owners, and without
 * this the top of every result page is the same skill three times.
 *
 * Rank order is preserved: a group is emitted at the position of its
 * best-ranked member, so collapsing can never demote a relevant result.
 */
export function collapseSearchDuplicates(skills: RegistrySkill[], search = ''): CollapsedSearchResult[] {
  if (!skills.length)
    return []

  const skillByKey = new Map<string, RegistrySkill>()
  for (const skill of skills)
    skillByKey.set(skillKey(skill), skill)

  const groupByKey = new Map<string, DuplicateGroupRecommendation>()
  const groups = findDuplicateCanonicalGroups(skills.map(toDuplicateCandidate), (a, b) => {
    // A source chosen by exact identity must survive duplicate collapsing.
    const aExact = isExactIdentity(skillByKey.get(skillSlug(a))!, search)
    const bExact = isExactIdentity(skillByKey.get(skillSlug(b))!, search)
    return Number(bExact) - Number(aExact) || canonicalTrustFirstSort(a, b)
  })
  for (const group of groups) {
    for (const row of group.rows)
      groupByKey.set(skillSlug(row), group)
  }

  const emitted = new Set<DuplicateGroupRecommendation>()
  const collapsed: CollapsedSearchResult[] = []

  for (const skill of skills) {
    const group = groupByKey.get(skillKey(skill))
    if (!group) {
      collapsed.push({ skill, alternateSources: [], sourceCount: 1 })
      continue
    }
    if (emitted.has(group))
      continue
    emitted.add(group)

    const canonicalKey = skillSlug(group.canonical)
    collapsed.push({
      skill: skillByKey.get(canonicalKey) ?? skill,
      alternateSources: group.rows
        .filter(row => skillSlug(row) !== canonicalKey)
        .map(row => ({
          owner: row.owner,
          repo: row.repo,
          slug: skillByKey.get(skillSlug(row))?.slug ?? skillSlug(row),
        })),
      sourceCount: group.rows.length,
    })
  }

  return collapsed
}

export type SearchMode = 'hybrid' | 'lexical' | 'semantic'

export interface HybridSearchResult {
  /** Candidate keys (`owner/repo/name`), best first. */
  keys: string[]
  scoreByKey: Map<string, number>
  /** Which lanes actually contributed, for observability and tests. */
  mode: SearchMode
}

/**
 * BM25 column weights for `skills_fts(name, owner, repo, display_name, slug,
 * description)`. Identity fields outweigh prose so an exact skill name beats a
 * passing mention, while description still carries enough weight to serve a
 * task-shaped query.
 *
 * Exported so the relevance suite ranks with the production expression rather
 * than a copy that can drift away from it.
 */
export const LEXICAL_BM25_RANK = 'bm25(skills_fts, 10.0, 3.0, 3.0, 8.0, 5.0, 1.0)'

export const LEXICAL_SEARCH_SQL = `SELECT owner, repo, name FROM skills_fts
       WHERE skills_fts MATCH ?
       ORDER BY CASE WHEN name = ? COLLATE NOCASE OR display_name = ? COLLATE NOCASE OR slug = ? COLLATE NOCASE THEN 1 ELSE 0 END DESC,
         ${LEXICAL_BM25_RANK}
       LIMIT ?`

async function lexicalSkillSearch(event: H3Event, search: string): Promise<string[] | null> {
  const match = buildFtsMatchQuery(search)
  if (!match)
    return []
  const db = getDB(event)
  const identity = search.trim().split('/')
  // FTS cannot match a phrase across owner, repo and name columns.
  // Resolve a full identity directly, including nested Skill names.
  const exact = identity.length >= 3
    ? db.prepare(`SELECT owner, repo, name FROM skills
        WHERE owner = ? COLLATE NOCASE AND repo = ? COLLATE NOCASE AND name = ? COLLATE NOCASE`)
        .bind(identity[0], identity[1], identity.slice(2).join('/'))
        .all<SkillKeyParts>()
    : Promise.resolve({ results: [] as SkillKeyParts[] })
  const results = await Promise.all([
    exact,
    db.prepare(LEXICAL_SEARCH_SQL).bind(match, search.trim(), search.trim(), search.trim(), LEXICAL_TOP_K).all<SkillKeyParts>(),
  ]).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'skill-lexical-search', outcome: 'failed' }))
    return null
  })
  return results === null ? null : [...new Set(results.flatMap(result => result.results ?? []).map(skillKey))]
}

/**
 * Retrieve skill candidates from both the lexical and semantic lanes and fuse
 * them. Lexical retrieval keeps Skills awaiting an embedding reachable.
 * Semantic retrieval finds relevant Skills without matching query words.
 */
export async function hybridSkillSearch(event: H3Event, search: string): Promise<HybridSearchResult> {
  const [lexicalKeys, semanticHits] = await Promise.all([
    lexicalSkillSearch(event, search),
    semanticSkillSearch(event, search, SEMANTIC_TOP_K),
  ])

  if (lexicalKeys === null && semanticHits === null)
    throw createError({ statusCode: 503, statusMessage: 'Search is temporarily unavailable.' })

  const semanticKeys = semanticHits?.map(skillKey) ?? []
  const hasLexical = Boolean(lexicalKeys?.length)
  const hasSemantic = semanticKeys.length > 0

  // Lexical is weighted slightly higher: an FTS hit means the query terms are
  // genuinely present, whereas the semantic lane always returns its nearest
  // neighbours regardless of how far away they are.
  const scoreByKey = fuseRankings([
    { keys: lexicalKeys ?? [], weight: 1.2 },
    { keys: semanticKeys, weight: 1 },
  ])

  const keys = [...scoreByKey.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key)

  let mode: SearchMode = 'hybrid'
  if (!hasSemantic)
    mode = 'lexical'
  else if (!hasLexical)
    mode = 'semantic'

  return { keys, scoreByKey, mode }
}
