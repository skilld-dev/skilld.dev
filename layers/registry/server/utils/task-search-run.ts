import type { ReadThroughCache } from '#shared/server/cache'
import type { TaskSearchDeps, TaskSearchResult } from './task-search'
import { readCache, writeCache } from '#shared/server/cache'
import { runTaskSearch, TASK_SEARCH_MODEL, TASK_SEARCH_PROMPT_VERSION, taskSearchCostMicros } from './task-search'

/** A found answer depends on what the registry holds, so it lasts a week. */
const FOUND_TTL_SECONDS = 60 * 60 * 24 * 7
/** One model run in 3 missed the memory leak Skill in the eval, so a miss is retried after a day. */
const NONE_TTL_SECONDS = 60 * 60 * 24
/** A day's spend counter outlives its UTC day, so a late write still lands on the right key. */
const SPEND_TTL_SECONDS = 60 * 60 * 48

/** What the search box gets back. Every outcome but `found` keeps the search results on screen. */
export type TaskSearchOutcome
  = | { _tag: 'found', refs: string[], source: 'model' | 'cache' }
    | { _tag: 'none', source: 'model' | 'cache' }
    | { _tag: 'limited', scope: 'visitor' | 'daily' }
    | { _tag: 'off' }
    | { _tag: 'failed' }

/** One record per request for the operations log. It never carries the question. */
export type TaskSearchReport
  = | { _tag: 'cache', result: 'found' | 'none' }
    | { _tag: 'skipped', reason: 'off' | 'binding-missing' | 'visitor-limit' | 'daily-limit' }
    | { _tag: 'model', result: TaskSearchResult, durationMs: number, costMicros: number }

export interface TaskSearchShellDeps {
  /** The runtime config kill switch. */
  enabled: boolean
  /** The spend ceiling for one UTC day, across every visitor, in micro-dollars. */
  dailyBudgetMicros: number
  /** The model call, or undefined when the AI binding is missing. */
  model: TaskSearchDeps['model'] | undefined
  search: TaskSearchDeps['search']
  /** A store every colo reads: the KV-backed `cache` mount. */
  storage: ReadThroughCache
  /** One task search against the visitor's allowance. False means over it. */
  allowVisitor: () => Promise<boolean>
  /** Keeps a promise alive after the response. */
  schedule: (promise: Promise<unknown>) => void
  digest: (text: string) => Promise<string>
  /** Milliseconds clock. */
  now: () => number
  report: (report: TaskSearchReport) => void
}

type CachedAnswer
  = | { _tag: 'found', refs: string[] }
    | { _tag: 'none' }

function parseCachedAnswer(value: unknown): CachedAnswer | null {
  if (typeof value !== 'object' || value === null)
    return null
  const { _tag, refs } = value as { _tag?: unknown, refs?: unknown }
  if (_tag === 'none')
    return { _tag: 'none' }
  if (_tag === 'found' && Array.isArray(refs) && refs.length && refs.every(ref => typeof ref === 'string'))
    return { _tag: 'found', refs }
  return null
}

function answerKey(question: string, digest: (text: string) => Promise<string>): Promise<string> {
  return digest(JSON.stringify([TASK_SEARCH_MODEL, TASK_SEARCH_PROMPT_VERSION, question]))
    .then(hash => `task-search:v${TASK_SEARCH_PROMPT_VERSION}:${hash}`)
}

function spendKey(nowMs: number): string {
  return `task-search:spend:${new Date(nowMs).toISOString().slice(0, 10)}`
}

function micros(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Add one run's cost to the day's counter. KV has no atomic increment, so two
 * runs that finish together can lose one addition. The ceiling is a soft one:
 * at about $0.0007 a run, a lost write is noise next to a $1 budget.
 */
async function addSpend(deps: TaskSearchShellDeps, key: string, costMicros: number): Promise<void> {
  const spent = micros(await readCache<number>(deps.storage, key))
  await writeCache(deps.storage, key, spent + costMicros, { ttl: SPEND_TTL_SECONDS })
}

/**
 * Answer one normalised sentence, cheapest check first.
 *
 * A cached answer is free, so it is served even over a limit. Then the kill
 * switch, the binding, the day's budget and the visitor's allowance decide
 * whether the model may run at all. A failed run is reported and never
 * cached, so the next visitor tries again.
 */
export async function searchForTask(deps: TaskSearchShellDeps, question: string): Promise<TaskSearchOutcome> {
  if (!deps.enabled) {
    deps.report({ _tag: 'skipped', reason: 'off' })
    return { _tag: 'off' }
  }

  const key = await answerKey(question, deps.digest)
  const cached = parseCachedAnswer(await readCache(deps.storage, key))
  if (cached) {
    deps.report({ _tag: 'cache', result: cached._tag })
    return { ...cached, source: 'cache' }
  }

  if (!deps.model) {
    deps.report({ _tag: 'skipped', reason: 'binding-missing' })
    return { _tag: 'off' }
  }

  const startedAt = deps.now()
  const dayKey = spendKey(startedAt)
  if (micros(await readCache<number>(deps.storage, dayKey)) >= deps.dailyBudgetMicros) {
    deps.report({ _tag: 'skipped', reason: 'daily-limit' })
    return { _tag: 'limited', scope: 'daily' }
  }
  if (!(await deps.allowVisitor())) {
    deps.report({ _tag: 'skipped', reason: 'visitor-limit' })
    return { _tag: 'limited', scope: 'visitor' }
  }

  const result = await runTaskSearch({ model: deps.model, search: deps.search }, question)
  const costMicros = taskSearchCostMicros(result.usage)
  deps.report({ _tag: 'model', result, durationMs: deps.now() - startedAt, costMicros })
  // A failed run still spent tokens, so it counts before anything returns.
  if (costMicros > 0)
    deps.schedule(addSpend(deps, dayKey, costMicros))

  if (result._tag === 'failed')
    return { _tag: 'failed' }
  if (result._tag === 'found') {
    await writeCache(deps.storage, key, { _tag: 'found', refs: result.refs } satisfies CachedAnswer, { ttl: FOUND_TTL_SECONDS })
    return { _tag: 'found', refs: result.refs, source: 'model' }
  }
  await writeCache(deps.storage, key, { _tag: 'none' } satisfies CachedAnswer, { ttl: NONE_TTL_SECONDS })
  return { _tag: 'none', source: 'model' }
}
