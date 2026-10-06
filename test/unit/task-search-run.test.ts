import type { TaskSearchRequest } from '../../layers/registry/server/utils/task-search'
import type { TaskSearchReport, TaskSearchShellDeps } from '../../layers/registry/server/utils/task-search-run'
import { describe, expect, it } from 'vitest'
import { searchForTask } from '../../layers/registry/server/utils/task-search-run'

const usage = { prompt_tokens: 6000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 0 } }
const searchReply = {
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'search_skills', arguments: '{"query":"nuxt seo"}' } }] } }],
  usage,
}
const answerReply = (refs: string[]) => ({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ refs }) } }], usage })

function memoryStorage() {
  const items = new Map<string, unknown>()
  return {
    items,
    getItem: async <T>(key: string) => (items.get(key) ?? null) as T | null,
    setItem: async (key: string, value: never) => {
      items.set(key, value)
    },
  }
}

/** A model that answers every question with the given refs after one search. */
function modelAnswering(refs: string[]) {
  const calls: TaskSearchRequest[] = []
  return {
    calls,
    model: async (request: TaskSearchRequest) => {
      calls.push(request)
      return request.messages.some(message => message.role === 'tool') ? answerReply(refs) : searchReply
    },
  }
}

function harness(overrides: Partial<TaskSearchShellDeps> = {}) {
  const reports: TaskSearchReport[] = []
  const scheduled: Promise<unknown>[] = []
  const storage = memoryStorage()
  const deps: TaskSearchShellDeps = {
    enabled: true,
    dailyBudgetMicros: 1_000_000,
    model: modelAnswering(['onmax/nuxt-skills/nuxt-seo']).model,
    search: async () => [{ ref: 'onmax/nuxt-skills/nuxt-seo', description: 'Nuxt SEO', stars: 300 }],
    storage,
    allowVisitor: async () => true,
    schedule: promise => scheduled.push(promise),
    digest: async text => text,
    now: () => Date.parse('2026-10-06T12:00:00Z'),
    report: report => reports.push(report),
    ...overrides,
  }
  return { deps, reports, storage, settle: () => Promise.all(scheduled) }
}

describe('searchForTask', () => {
  it('finds Skills, then answers the same question from the cache without the model', async () => {
    const first = modelAnswering(['onmax/nuxt-skills/nuxt-seo'])
    const { deps } = harness({ model: first.model })

    expect(await searchForTask(deps, 'set up seo for my nuxt site')).toEqual({ _tag: 'found', refs: ['onmax/nuxt-skills/nuxt-seo'], source: 'model' })

    const second = modelAnswering([])
    expect(await searchForTask({ ...deps, model: second.model, allowVisitor: async () => false }, 'set up seo for my nuxt site'))
      .toEqual({ _tag: 'found', refs: ['onmax/nuxt-skills/nuxt-seo'], source: 'cache' })
    expect(second.calls).toHaveLength(0)
  })

  it('stays off when the kill switch is off, without calling the model', async () => {
    const model = modelAnswering([])
    const { deps, reports } = harness({ enabled: false, model: model.model })
    expect(await searchForTask(deps, 'set up seo for my nuxt site')).toEqual({ _tag: 'off' })
    expect(model.calls).toHaveLength(0)
    expect(reports).toEqual([{ _tag: 'skipped', reason: 'off' }])
  })

  it('stays off when the AI binding is missing', async () => {
    const { deps } = harness({ model: undefined })
    expect(await searchForTask(deps, 'set up seo for my nuxt site')).toEqual({ _tag: 'off' })
  })

  it('stops for the day once the runs have spent the budget', async () => {
    const model = modelAnswering(['onmax/nuxt-skills/nuxt-seo'])
    const { deps, settle } = harness({ model: model.model, dailyBudgetMicros: 1000 })

    await searchForTask(deps, 'set up seo for my nuxt site')
    await settle()
    expect(model.calls).toHaveLength(2)

    expect(await searchForTask(deps, 'write playwright tests')).toEqual({ _tag: 'limited', scope: 'daily' })
    expect(model.calls).toHaveLength(2)
  })

  it('stops a visitor over their allowance, without calling the model', async () => {
    const model = modelAnswering([])
    const { deps } = harness({ model: model.model, allowVisitor: async () => false })
    expect(await searchForTask(deps, 'set up seo for my nuxt site')).toEqual({ _tag: 'limited', scope: 'visitor' })
    expect(model.calls).toHaveLength(0)
  })

  it('reports a run with its turns, tokens and cost, and never the question', async () => {
    const { deps, reports } = harness()
    await searchForTask(deps, 'set up seo for my nuxt site')
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      _tag: 'model',
      costMicros: 1400,
      result: { _tag: 'found', turns: 2, searches: 1, usage: { inputTokens: 12000, outputTokens: 400 } },
    })
    expect(JSON.stringify(reports)).not.toContain('nuxt site')
  })

  it('counts a failed run against the budget and does not cache it', async () => {
    let calls = 0
    const failing = async () => {
      calls++
      if (calls === 1)
        return searchReply
      throw new Error('2021: Insufficient AI Gateway credits')
    }
    const { deps, storage, settle } = harness({ model: failing })

    expect(await searchForTask(deps, 'set up seo for my nuxt site')).toEqual({ _tag: 'failed' })
    await settle()
    expect(storage.items.get('task-search:spend:2026-10-06')).toBe(700)

    const retry = modelAnswering(['onmax/nuxt-skills/nuxt-seo'])
    expect(await searchForTask({ ...deps, model: retry.model }, 'set up seo for my nuxt site')).toMatchObject({ _tag: 'found', source: 'model' })
  })

  it('answers none when nothing fits, and caches that', async () => {
    const { deps } = harness({ model: modelAnswering([]).model })
    expect(await searchForTask(deps, 'bake sourdough bread')).toEqual({ _tag: 'none', source: 'model' })
    expect(await searchForTask({ ...deps, model: undefined }, 'bake sourdough bread')).toEqual({ _tag: 'none', source: 'cache' })
  })
})
