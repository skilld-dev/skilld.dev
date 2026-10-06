import { CLUSTERS } from '../data/clusters'

/**
 * Query understanding for natural-language searches.
 *
 * A small Workers AI model turns "make my UI less generic" into search terms
 * and soft filters, and the existing hybrid search runs on them. Everything in
 * this file is pure: the model call itself is injected, so the fallback rules
 * are testable without a binding.
 *
 * The model never decides what a result is. It only rewrites the query. When
 * it is slow, wrong, rate limited, or missing, search runs on the words the
 * visitor typed.
 */

/**
 * Native Workers AI model, billed in neurons on the Workers AI allowance.
 * Partner models (`anthropic/*`) bill against AI Gateway credits, which are
 * exhausted (see send-digests.ts), so this must stay a `@cf/` model.
 */
export const SEARCH_INTENT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

/** Bump when the prompt or the parser changes, so cached answers expire. */
export const SEARCH_INTENT_PROMPT_VERSION = 1

/**
 * After this, search runs on the typed words and the model reply is cached
 * when it lands. Measured in production on 2026-10-06 over 24 calls: this
 * model's inference alone took p50 614ms, p90 815ms, max 1256ms. The first
 * budget, 800ms, sat under the p90, so most first answers were dropped.
 */
export const SEARCH_INTENT_BUDGET_MS = 1200

export const SEARCH_INTENT_MAX_TOKENS = 96

const MAX_TERMS = 6
const MAX_TERMS_CHARS = 80
const MAX_FILTER_CHARS = 40

/** Tracks that can boost a result: only those with classifier categories. */
const BOOSTABLE_TRACKS = CLUSTERS.filter(cluster => cluster.categories.length > 0)
const TRACK_CATEGORIES = new Map(BOOSTABLE_TRACKS.map(cluster => [cluster.slug, cluster.categories]))

/** What the model returns once parsed. Every field is optional evidence. */
export interface QueryUnderstanding {
  /** Search terms that a matching Skill's name or description would contain. */
  terms: string
  /** A track slug with classifier categories, or null. */
  track: string | null
  /** A library, language, or platform the query names, or null. */
  framework: string | null
  /** A GitHub login the query names, or null. The server checks it exists. */
  author: string | null
}

export function searchIntentSystemPrompt(): string {
  const tracks = BOOSTABLE_TRACKS.map(cluster => `${cluster.slug}: ${cluster.label}`).join('\n')
  return `You rewrite a developer's search for agent skills into search terms.
A skill is a SKILL.md file that teaches a coding agent one kind of work.

Return JSON with four string fields:
- "terms": 2 to 6 lowercase keywords that the name or description of a matching skill would contain. Fix typos. Expand abbreviations, such as "pr" to "pull request". Drop filler words such as my, a, better, help, want, how.
- "track": the slug of the one track below that fits the task, or "none".
- "framework": the library, language, or platform the query names, in lowercase, or "none".
- "author": the GitHub login of a person or organization the query names, or "none".

Tracks:
${tracks}

Use only words from the query, their corrected spelling, or close synonyms. Keep the subject of the query and the outcome the developer wants, such as distinctive, faster, or secure. Never reduce a specific request to a generic topic. Never answer with generic words such as skill, agent, or coding. Never invent a library or an author.

Examples:
${SEARCH_INTENT_EXAMPLES.map(([query, answer]) => `${query} => ${JSON.stringify(answer)}`).join('\n')}`
}

/**
 * Few-shot examples. None of them is a query from the evaluation set in the
 * search pull request, so they teach the shape without grading themselves.
 */
const SEARCH_INTENT_EXAMPLES: [string, Record<'terms' | 'track' | 'framework' | 'author', string>][] = [
  ['check my code before i merge', { terms: 'code review', track: 'code-review', framework: 'none', author: 'none' }],
  ['unit test a react component', { terms: 'react component unit testing', track: 'testing', framework: 'react', author: 'none' }],
  ['make the landing page look less bland', { terms: 'distinctive landing page design', track: 'design', framework: 'none', author: 'none' }],
  ['my docs read like a robot wrote them', { terms: 'natural human documentation writing', track: 'anti-slop', framework: 'none', author: 'none' }],
  ['nxt image optimisation', { terms: 'nuxt image optimization', track: 'performance', framework: 'nuxt', author: 'none' }],
  ['addyosmani web perf', { terms: 'web performance', track: 'performance', framework: 'none', author: 'addyosmani' }],
]

/** JSON mode schema. String fields with "none", because JSON mode drops null unions. */
export function searchIntentResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        terms: { type: 'string' },
        track: { type: 'string', enum: [...BOOSTABLE_TRACKS.map(cluster => cluster.slug), 'none'] },
        framework: { type: 'string' },
        author: { type: 'string' },
      },
      required: ['terms', 'track', 'framework', 'author'],
    },
  } as const
}

const TERM_CHARS_RE = /[^\p{L}\p{N}\s.#+/-]/gu
const WHITESPACE_RE = /\s+/g
const FILTER_RE = /^[a-z\d][a-z\d.+#-]*(?: [a-z\d][a-z\d.+#-]*)?$/
const LOGIN_RE = /^[a-z\d][a-z\d-]{0,38}$/
const NONE_VALUES = new Set(['', 'none', 'null', 'n/a', 'any'])

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}.#+-]+/gu) ?? []
}

/** Levenshtein distance, capped: only "is this a typo of that" matters. */
function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) >= cap)
    return cap
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = current
  }
  return Math.min(previous[b.length]!, cap)
}

/** True when `word` is in the query or a typo of a query word. */
function groundedInQuery(word: string, query: string): boolean {
  const queryWords = words(query)
  return queryWords.includes(word) || (word.length >= 4 && queryWords.some(candidate => candidate.length >= 4 && editDistance(candidate, word) <= 2))
}

/**
 * The expansion words the query says or misspells. Only these may put a Skill
 * in the name tier: "migration postgres" grounds both words in "write a
 * postgres migration", while "ui design" grounds only "ui" in "make my UI
 * less generic", so generic ui-design Skills do not jump the queue.
 */
export function groundedTerms(expansion: string, query: string): string | null {
  const grounded = words(expansion).filter(word => groundedInQuery(word, query))
  return grounded.length ? grounded.join(' ') : null
}

/** A framework counts only if the query says it, or misspells it. */
function frameworkInQuery(framework: string, query: string): boolean {
  if (query.includes(framework))
    return true
  return words(query).some(word => word.length >= 4 && editDistance(word, framework) <= 2)
}

/** An author counts only if the query spells the login, spaces aside. */
function authorInQuery(author: string, query: string): boolean {
  return query.replace(/[\s@-]/g, '').includes(author.replace(/-/g, ''))
}

function filterValue(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const cleaned = value.trim().toLowerCase().replace(WHITESPACE_RE, ' ')
  if (NONE_VALUES.has(cleaned) || cleaned.length > MAX_FILTER_CHARS || !FILTER_RE.test(cleaned))
    return null
  return cleaned
}

function modelBody(response: unknown): unknown {
  if (typeof response !== 'object' || response === null)
    return response
  // Workers AI text models answer `{ response }`: an object in JSON mode, else a string.
  if ('response' in response)
    return (response as { response: unknown }).response
  // OpenAI-shaped models answer `{ choices: [{ message: { content } }] }`.
  const choices = (response as { choices?: unknown }).choices
  if (Array.isArray(choices))
    return (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content
  return response
}

function readModelObject(response: unknown): Record<string, unknown> | null {
  const body = modelBody(response)
  if (typeof body === 'string') {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start === -1 || end <= start)
      return null
    try {
      const parsed: unknown = JSON.parse(body.slice(start, end + 1))
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    }
    catch {
      // Not JSON: the caller falls back to the typed words, which is the
      // whole answer for an unparseable model reply.
      return null
    }
  }
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : null
}

/**
 * Parse an untrusted model reply into a {@link QueryUnderstanding}.
 *
 * Returns null when the reply has no usable terms. Filters the model cannot
 * ground in the query are dropped rather than trusted: a wrong framework or
 * author would demote the right Skills.
 */
export function parseQueryUnderstanding(response: unknown, query: string): QueryUnderstanding | null {
  const body = readModelObject(response)
  if (!body || typeof body.terms !== 'string')
    return null

  const terms = body.terms
    .toLowerCase()
    .replace(TERM_CHARS_RE, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim()
    .split(' ')
    .slice(0, MAX_TERMS)
    .join(' ')
    .slice(0, MAX_TERMS_CHARS)
    .trim()
  if (!/[\p{L}\p{N}]/u.test(terms))
    return null

  const track = typeof body.track === 'string' && TRACK_CATEGORIES.has(body.track) ? body.track : null
  const framework = filterValue(body.framework)
  const author = filterValue(body.author)?.replace(/^@/, '') ?? null

  return {
    terms,
    track,
    framework: framework && frameworkInQuery(framework, query) ? framework : null,
    author: author && LOGIN_RE.test(author) && authorInQuery(author, query) ? author : null,
  }
}

/**
 * How one intent search runs. `search` stays the typed query, so exact names
 * and phrase matches still rank first. `expansion` adds the model's terms.
 */
export interface SearchPlan {
  search: string
  expansion: string | null
  /** A login to filter by, if it exists in the registry. */
  owner: string | null
  /** Classifier categories that earn a ranking boost. Never a filter. */
  boostCategories: readonly string[]
  /** A word whose presence in a Skill earns a ranking boost. Never a filter. */
  boostTerm: string | null
  /** Expansion words grounded in the query. They may decide the name tier. */
  nameTerms: string | null
}

export function planIntentSearch(query: string, understanding: QueryUnderstanding | null): SearchPlan {
  if (!understanding)
    return { search: query, expansion: null, owner: null, boostCategories: [], boostTerm: null, nameTerms: null }

  const { terms, framework, track, author } = understanding
  const expansionWords = new Set(terms.split(' '))
  if (framework)
    framework.split(' ').forEach(word => expansionWords.add(word))
  const expansion = [...expansionWords].join(' ')

  return {
    search: query,
    expansion: expansion === query ? null : expansion,
    owner: author,
    boostCategories: track ? TRACK_CATEGORIES.get(track) ?? [] : [],
    boostTerm: framework,
    nameTerms: groundedTerms(expansion, query),
  }
}

/**
 * Why a search did or did not use the model. Recorded as an aggregate, never
 * with the query text.
 */
export type IntentOutcome
  = | { _tag: 'understood', understanding: QueryUnderstanding, source: 'model' | 'cache' }
    | { _tag: 'skipped', reason: 'binding-missing' | 'rate-limited' | 'cached-miss' }
    | { _tag: 'fallback', reason: 'timeout' | 'model-error' | 'invalid-response' }

/**
 * One aggregate record per model call or skip, for the operations log. It
 * carries how long the model took and never the query.
 */
export type IntentReport
  = | { _tag: 'model', result: 'understood' | 'timeout' | 'model-error' | 'invalid-response', modelMs: number }
    | { _tag: 'late', result: 'understood' | 'model-error' | 'invalid-response', modelMs: number }
    | { _tag: 'skipped', reason: 'binding-missing' | 'rate-limited' }

/** What a cache entry holds: an answer, or the record that there was none. */
export type CachedIntent
  = | { _tag: 'understood', understanding: QueryUnderstanding }
    | { _tag: 'none' }

export function parseCachedIntent(value: unknown): CachedIntent | null {
  if (typeof value !== 'object' || value === null || !('_tag' in value))
    return null
  if ((value as { _tag: unknown })._tag === 'none')
    return { _tag: 'none' }
  if ((value as { _tag: unknown })._tag !== 'understood')
    return null
  const understanding = (value as { understanding?: unknown }).understanding
  if (typeof understanding !== 'object' || understanding === null)
    return null
  const { terms, track, framework, author } = understanding as Record<string, unknown>
  const nullableString = (field: unknown) => field === null || typeof field === 'string'
  if (typeof terms !== 'string' || !nullableString(track) || !nullableString(framework) || !nullableString(author))
    return null
  return { _tag: 'understood', understanding: { terms, track: track as string | null, framework: framework as string | null, author: author as string | null } }
}

export function intentCacheKey(normalizedQuery: string, digest: (text: string) => Promise<string>): Promise<string> {
  return digest(JSON.stringify([SEARCH_INTENT_MODEL, SEARCH_INTENT_PROMPT_VERSION, normalizedQuery]))
    .then(hash => `search-intent:v${SEARCH_INTENT_PROMPT_VERSION}:${hash}`)
}

/** The race result between the model and the latency budget. */
export type ModelRace
  = | { _tag: 'answered', response: unknown }
    | { _tag: 'failed' }
    | { _tag: 'timeout' }

/**
 * Decide the outcome of one model attempt. A reply with no usable terms is
 * cached as `none` so the same query does not pay for the model again.
 */
export function decideIntent(race: ModelRace, query: string): { outcome: IntentOutcome, cache: CachedIntent | null } {
  if (race._tag === 'timeout')
    return { outcome: { _tag: 'fallback', reason: 'timeout' }, cache: null }
  if (race._tag === 'failed')
    return { outcome: { _tag: 'fallback', reason: 'model-error' }, cache: null }
  const understanding = parseQueryUnderstanding(race.response, query)
  if (!understanding)
    return { outcome: { _tag: 'fallback', reason: 'invalid-response' }, cache: { _tag: 'none' } }
  return { outcome: { _tag: 'understood', understanding, source: 'model' }, cache: { _tag: 'understood', understanding } }
}

/** Race a promise against a budget without leaving a dangling rejection. */
export function raceBudget(model: Promise<unknown>, budgetMs: number, sleep: (ms: number) => Promise<void>): Promise<ModelRace> {
  return Promise.race([
    model.then(response => ({ _tag: 'answered', response }) as const, () => ({ _tag: 'failed' }) as const),
    sleep(budgetMs).then(() => ({ _tag: 'timeout' }) as const),
  ])
}

/**
 * The answer cache identity for one search box request. It names the
 * understanding the answer used, so the answer computed from a cached
 * understanding never shares an entry with the one that fell back.
 */
export function answerCacheIdentity(normalizedQuery: string, limit: number, intent: IntentOutcome | null): string {
  const understanding = intent?._tag === 'understood' ? intent.understanding : null
  return JSON.stringify([normalizedQuery, limit, understanding])
}
