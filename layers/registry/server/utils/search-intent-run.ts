import type { ReadThroughCache } from '#shared/server/cache'
import type { CachedIntent, IntentOutcome } from './search-intent'
import { readCache, writeCache } from '#shared/server/cache'
import {
  decideIntent,
  intentCacheKey,
  parseCachedIntent,
  raceBudget,
  SEARCH_INTENT_BUDGET_MS,
  SEARCH_INTENT_MAX_TOKENS,
  SEARCH_INTENT_MODEL,
  searchIntentResponseFormat,
  searchIntentSystemPrompt,
} from './search-intent'

/** An answer is a pure function of (model, prompt, query): keep it a month. */
const UNDERSTOOD_TTL_SECONDS = 60 * 60 * 24 * 30
/** A query the model could not parse is retried after a day, not on every keystroke. */
const NONE_TTL_SECONDS = 60 * 60 * 24

export interface SearchIntentAi {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

export interface SearchIntentDeps {
  ai: SearchIntentAi | undefined
  storage: ReadThroughCache
  /** One model call against the visitor's allowance. False means over it. */
  allow: () => Promise<boolean>
  /** Keeps a promise alive after the response, for a late cache write. */
  schedule: (promise: Promise<unknown>) => void
  digest: (text: string) => Promise<string>
  sleep: (ms: number) => Promise<void>
  /** Aggregate outcome reporting. Receives no query text. */
  report: (outcome: IntentOutcome) => void
  budgetMs?: number
}

function store(deps: SearchIntentDeps, key: string, entry: CachedIntent): Promise<void> {
  return writeCache(deps.storage, key, entry, {
    ttl: entry._tag === 'understood' ? UNDERSTOOD_TTL_SECONDS : NONE_TTL_SECONDS,
  })
}

/**
 * Understand one normalised intent query, inside the latency budget.
 *
 * Order matters for cost: the cache answers first, then the binding and the
 * rate limit decide whether the model may run at all. A model reply that
 * lands after the budget is still cached, so the next identical search gets
 * it for free.
 */
export async function understandSearchQuery(deps: SearchIntentDeps, query: string): Promise<IntentOutcome> {
  const key = await intentCacheKey(query, deps.digest)
  const cachedEntry = parseCachedIntent(await readCache(deps.storage, key))
  if (cachedEntry?._tag === 'understood')
    return { _tag: 'understood', understanding: cachedEntry.understanding, source: 'cache' }
  if (cachedEntry?._tag === 'none')
    return { _tag: 'skipped', reason: 'cached-miss' }

  if (!deps.ai)
    return { _tag: 'skipped', reason: 'binding-missing' }
  if (!(await deps.allow()))
    return { _tag: 'skipped', reason: 'rate-limited' }

  const model = deps.ai.run(SEARCH_INTENT_MODEL, {
    messages: [
      { role: 'system', content: searchIntentSystemPrompt() },
      { role: 'user', content: query },
    ],
    max_tokens: SEARCH_INTENT_MAX_TOKENS,
    temperature: 0,
    response_format: searchIntentResponseFormat(),
  })
  const race = await raceBudget(model, deps.budgetMs ?? SEARCH_INTENT_BUDGET_MS, deps.sleep)

  if (race._tag === 'timeout') {
    deps.schedule(model.then(
      (response) => {
        const late = decideIntent({ _tag: 'answered', response }, query)
        return late.cache ? store(deps, key, late.cache) : undefined
      },
      // The visitor already has the plain results. A model that fails after
      // the budget leaves nothing to cache, and its timeout is reported below.
      () => undefined,
    ))
  }

  const { outcome, cache } = decideIntent(race, query)
  if (cache)
    await store(deps, key, cache)
  deps.report(outcome)
  return outcome
}
