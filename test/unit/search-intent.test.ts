import type { IntentOutcome } from '../../layers/registry/server/utils/search-intent'
import type { SearchIntentDeps } from '../../layers/registry/server/utils/search-intent-run'
import type { ReadThroughCache } from '../../shared/server/cache'
import { describe, expect, it, vi } from 'vitest'
import {
  decideIntent,
  groundedTerms,
  parseQueryUnderstanding,
  planIntentSearch,
  raceBudget,
} from '../../layers/registry/server/utils/search-intent'
import { understandSearchQuery } from '../../layers/registry/server/utils/search-intent-run'

const reply = (body: Record<string, string>) => ({ response: body })

describe('parseQueryUnderstanding', () => {
  it('reads a JSON mode reply and drops "none" filters', () => {
    expect(parseQueryUnderstanding(
      reply({ terms: 'Pull Request Code Review', track: 'code-review', framework: 'none', author: 'none' }),
      'review my pull requests',
    )).toEqual({ terms: 'pull request code review', track: 'code-review', framework: null, author: null })
  })

  it.each([
    ['a JSON string', { response: 'Sure: {"terms":"vue testing","track":"testing","framework":"vue","author":"none"}' }],
    ['an OpenAI shaped reply', { choices: [{ message: { content: '{"terms":"vue testing","track":"testing","framework":"vue","author":"none"}' } }] }],
  ])('reads %s', (_, response) => {
    expect(parseQueryUnderstanding(response, 'test a vue app')).toEqual({
      terms: 'vue testing',
      track: 'testing',
      framework: 'vue',
      author: null,
    })
  })

  it.each([
    ['no terms', reply({ track: 'testing' })],
    ['terms with no letters', reply({ terms: ' - . ', track: 'none', framework: 'none', author: 'none' })],
    ['prose', { response: 'I cannot help with that.' }],
    ['nothing', null],
  ])('rejects a reply with %s', (_, response) => {
    expect(parseQueryUnderstanding(response, 'write better commit messages')).toBeNull()
  })

  it('keeps a framework the query misspells and drops one it never mentions', () => {
    expect(parseQueryUnderstanding(reply({ terms: 'react hooks', track: 'coding', framework: 'react', author: 'none' }), 'reacct hooks')?.framework).toBe('react')
    expect(parseQueryUnderstanding(reply({ terms: 'ui design', track: 'design', framework: 'react', author: 'none' }), 'make my ui less generic')?.framework).toBeNull()
  })

  it('keeps an author the query spells and drops an invented one', () => {
    expect(parseQueryUnderstanding(reply({ terms: 'typescript', track: 'none', framework: 'none', author: 'matt-pocock' }), 'skills by matt pocock')?.author).toBe('matt-pocock')
    expect(parseQueryUnderstanding(reply({ terms: 'vue testing', track: 'testing', framework: 'vue', author: 'antfu' }), 'test a vue app')?.author).toBeNull()
  })

  it('drops an unknown track and cuts terms to six words', () => {
    expect(parseQueryUnderstanding(
      reply({ terms: 'one two three four five six seven', track: 'cooking', framework: 'none', author: 'none' }),
      'one two three four five six seven',
    )).toMatchObject({ terms: 'one two three four five six', track: null })
  })
})

describe('planIntentSearch', () => {
  it('searches the typed words alone without an understanding', () => {
    expect(planIntentSearch('review my pull requests', null)).toEqual({
      search: 'review my pull requests',
      expansion: null,
      owner: null,
      boostCategories: [],
      boostTerm: null,
      nameTerms: null,
    })
  })

  it('adds the terms and framework, and boosts the track categories', () => {
    expect(planIntentSearch('write a postgres migration', {
      terms: 'migration',
      track: 'devops',
      framework: 'postgres',
      author: null,
    })).toEqual({
      search: 'write a postgres migration',
      expansion: 'migration postgres',
      owner: null,
      boostCategories: ['ci-cd', 'deployment', 'release-management', 'migrations'],
      boostTerm: 'postgres',
      nameTerms: 'migration postgres',
    })
  })
})

describe('groundedTerms', () => {
  it.each([
    ['migration postgres', 'write a postgres migration', 'migration postgres'],
    ['react hooks', 'reacct hooks', 'react hooks'],
    ['ui design distinctive', 'make my ui less generic', 'ui'],
    ['code review', 'check my pull requests', null],
  ])('keeps the words of %j that %j says or misspells', (expansion, query, expected) => {
    expect(groundedTerms(expansion, query)).toBe(expected)
  })
})

describe('decideIntent', () => {
  it('falls back without caching on a timeout or a model error', () => {
    expect(decideIntent({ _tag: 'timeout' }, 'q')).toEqual({ outcome: { _tag: 'fallback', reason: 'timeout' }, cache: null })
    expect(decideIntent({ _tag: 'failed' }, 'q')).toEqual({ outcome: { _tag: 'fallback', reason: 'model-error' }, cache: null })
  })

  it('caches an unusable reply as none, so the query does not pay again', () => {
    expect(decideIntent({ _tag: 'answered', response: { response: 'no' } }, 'q')).toEqual({
      outcome: { _tag: 'fallback', reason: 'invalid-response' },
      cache: { _tag: 'none' },
    })
  })
})

describe('raceBudget', () => {
  const never = () => new Promise<void>(() => {})

  it('answers with the model when it beats the budget', async () => {
    expect(await raceBudget(Promise.resolve('reply'), 800, never)).toEqual({ _tag: 'answered', response: 'reply' })
  })

  it('times out when the budget ends first', async () => {
    expect(await raceBudget(new Promise(() => {}), 800, () => Promise.resolve())).toEqual({ _tag: 'timeout' })
  })

  it('turns a model rejection into a failure', async () => {
    expect(await raceBudget(Promise.reject(new Error('5025')), 800, never)).toEqual({ _tag: 'failed' })
  })
})

function memoryStorage(seed: Record<string, unknown> = {}) {
  const items = new Map(Object.entries(seed))
  const storage: ReadThroughCache = {
    getItem: async <T>(key: string) => (items.get(key) ?? null) as T | null,
    setItem: async (key: string, value: never) => {
      items.set(key, value)
    },
  }
  return { items, storage }
}

const VALID = reply({ terms: 'vue testing', track: 'testing', framework: 'vue', author: 'none' })

function deps(overrides: Partial<SearchIntentDeps> = {}) {
  const { items, storage } = memoryStorage()
  const scheduled: Promise<unknown>[] = []
  const reported: IntentOutcome[] = []
  const run = vi.fn(async () => VALID)
  const value: SearchIntentDeps = {
    ai: { run },
    storage,
    allow: async () => true,
    schedule: (promise) => {
      scheduled.push(promise)
    },
    digest: async text => `digest(${text.length})`,
    sleep: () => new Promise<void>(() => {}),
    report: outcome => reported.push(outcome),
    ...overrides,
  }
  return { deps: value, items, scheduled, reported, run }
}

describe('understandSearchQuery', () => {
  it('runs the model once, then answers the same query from the cache', async () => {
    const harness = deps()
    const first = await understandSearchQuery(harness.deps, 'test a vue app')
    const second = await understandSearchQuery(harness.deps, 'test a vue app')
    expect(first).toMatchObject({ _tag: 'understood', source: 'model', understanding: { terms: 'vue testing' } })
    expect(second).toMatchObject({ _tag: 'understood', source: 'cache', understanding: { terms: 'vue testing' } })
    expect(harness.run).toHaveBeenCalledOnce()
  })

  it('skips the model when the visitor is over the allowance', async () => {
    const harness = deps({ allow: async () => false })
    expect(await understandSearchQuery(harness.deps, 'test a vue app')).toEqual({ _tag: 'skipped', reason: 'rate-limited' })
    expect(harness.run).not.toHaveBeenCalled()
  })

  it('skips the model when the binding is missing', async () => {
    const harness = deps({ ai: undefined })
    expect(await understandSearchQuery(harness.deps, 'test a vue app')).toEqual({ _tag: 'skipped', reason: 'binding-missing' })
  })

  it('falls back at the budget and caches the late reply for the next search', async () => {
    let resolve!: (value: unknown) => void
    const late = new Promise((done) => {
      resolve = done
    })
    const harness = deps({ ai: { run: () => late }, sleep: () => Promise.resolve() })
    expect(await understandSearchQuery(harness.deps, 'test a vue app')).toEqual({ _tag: 'fallback', reason: 'timeout' })
    expect(harness.reported).toEqual([{ _tag: 'fallback', reason: 'timeout' }])

    resolve(VALID)
    await Promise.all(harness.scheduled)
    expect(await understandSearchQuery(harness.deps, 'test a vue app')).toMatchObject({ _tag: 'understood', source: 'cache' })
  })

  it('does not ask the model again for a query it could not parse', async () => {
    const harness = deps({ ai: { run: vi.fn(async () => ({ response: 'no idea' })) } })
    expect(await understandSearchQuery(harness.deps, 'asdf qwer')).toEqual({ _tag: 'fallback', reason: 'invalid-response' })
    expect(await understandSearchQuery(harness.deps, 'asdf qwer')).toEqual({ _tag: 'skipped', reason: 'cached-miss' })
  })

  it('falls back without caching when the model throws', async () => {
    const harness = deps({ ai: { run: async () => {
      throw new Error('AiError: 3040 capacity')
    } } })
    expect(await understandSearchQuery(harness.deps, 'test a vue app')).toEqual({ _tag: 'fallback', reason: 'model-error' })
    expect(harness.items.size).toBe(0)
  })
})
