import type { TaskSearchMessage, TaskSearchRequest, TaskSearchSkill } from '../../layers/registry/server/utils/task-search'
import { describe, expect, it } from 'vitest'
import {
  runTaskSearch,
  snapRefs,
  TASK_SEARCH_MAX_TURNS,
  taskSearchCostMicros,
} from '../../layers/registry/server/utils/task-search'

const usage = { prompt_tokens: 600, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 100 } }

function searches(...queries: string[]) {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: queries.map((query, i) => ({
          id: `call_${i}`,
          type: 'function',
          function: { name: 'search_skills', arguments: JSON.stringify({ query }) },
        })),
      },
    }],
    usage,
  }
}

function answer(refs: unknown[]) {
  return { choices: [{ message: { role: 'assistant', content: JSON.stringify({ refs }) } }], usage }
}

/** A model that replies from a script and keeps every request it was sent. */
function scriptedModel(replies: unknown[]) {
  const requests: TaskSearchRequest[] = []
  return {
    requests,
    model: async (request: TaskSearchRequest) => {
      requests.push(structuredClone(request))
      const next = replies.shift()
      if (next instanceof Error)
        throw next
      return next
    },
  }
}

type ToolReply = Extract<TaskSearchMessage, { role: 'tool' }>

function toolReplies(request: TaskSearchRequest): ToolReply[] {
  return request.messages.filter((message): message is ToolReply => message.role === 'tool')
}

const skill = (ref: string, description = `About ${ref}`): TaskSearchSkill => ({ ref, description, stars: 10 })

function registry(results: Record<string, TaskSearchSkill[]>) {
  const queries: string[] = []
  return {
    queries,
    search: async (query: string) => {
      queries.push(query)
      return results[query] ?? []
    },
  }
}

describe('snapRefs', () => {
  const seen = [
    'chromedevtools/chrome-devtools-mcp/memory-leak-debugging',
    'jakubkrehel/make-interfaces-feel-better/make-interfaces-feel-better',
    'nuxt/ui/nuxt-ui',
    'onmax/nuxt-skills/nuxt-seo',
  ]

  it('keeps refs the searches returned, in the model order, once each', () => {
    expect(snapRefs(['onmax/nuxt-skills/nuxt-seo', 'nuxt/ui/nuxt-ui', 'onmax/nuxt-skills/nuxt-seo'], seen))
      .toEqual(['onmax/nuxt-skills/nuxt-seo', 'nuxt/ui/nuxt-ui'])
  })

  it('matches a ref whatever its case', () => {
    expect(snapRefs(['Nuxt/UI/Nuxt-UI'], seen)).toEqual(['nuxt/ui/nuxt-ui'])
  })

  it('repairs a ref that dropped the repeated repository segment', () => {
    expect(snapRefs(['jakubkrehel/make-interfaces-feel-better'], seen))
      .toEqual(['jakubkrehel/make-interfaces-feel-better/make-interfaces-feel-better'])
  })

  it('repairs a ref that repeated a segment', () => {
    expect(snapRefs(['nuxt/ui/nuxt-ui/nuxt-ui'], seen)).toEqual(['nuxt/ui/nuxt-ui'])
  })

  it('drops a ref no search returned, and anything that is not a ref', () => {
    expect(snapRefs(['vercel-labs/skills/find-skills', 42, null, '', 'nuxt-seo'], seen)).toEqual([])
  })

  it('drops a repair that two results could satisfy', () => {
    expect(snapRefs(['onmax/nuxt-ui'], ['onmax/claude-config/nuxt-ui', 'onmax/nuxt-skills/nuxt-ui'])).toEqual([])
  })

  it('keeps at most six', () => {
    const many = Array.from({ length: 9 }, (_, i) => `owner/repo/skill-${i}`)
    expect(snapRefs(many, many)).toEqual(many.slice(0, 6))
  })
})

describe('runTaskSearch', () => {
  it('runs the searches the model asks for and answers only refs those searches returned', async () => {
    const { model, requests } = scriptedModel([
      searches('node memory leak', 'heap snapshot debugging'),
      answer(['chromedevtools/chrome-devtools-mcp/memory-leak-debugging', 'invented/repo/skill']),
    ])
    const { search, queries } = registry({
      'heap snapshot debugging': [skill('chromedevtools/chrome-devtools-mcp/memory-leak-debugging')],
    })

    const result = await runTaskSearch({ model, search }, 'stop memory leaks in node')

    expect(queries).toEqual(['node memory leak', 'heap snapshot debugging'])
    expect(result).toMatchObject({
      _tag: 'found',
      refs: ['chromedevtools/chrome-devtools-mcp/memory-leak-debugging'],
      dropped: 1,
      turns: 2,
      searches: 2,
      usage: { inputTokens: 1200, cachedTokens: 200, outputTokens: 80 },
    })
    // The model reads each search answer as a ready ref, beside the question it was asked.
    expect(requests[0]!.messages.at(-1)).toEqual({ role: 'user', content: 'stop memory leaks in node' })
    const replies = toolReplies(requests[1]!)
    expect(replies.map(message => message.tool_call_id)).toEqual(['call_0', 'call_1'])
    expect(JSON.parse(replies[1]!.content)).toEqual({
      items: [{ ref: 'chromedevtools/chrome-devtools-mcp/memory-leak-debugging', description: 'About chromedevtools/chrome-devtools-mcp/memory-leak-debugging', stars: 10 }],
    })
  })

  it('answers none when nothing fits the task', async () => {
    const { model } = scriptedModel([searches('sourdough bread'), answer([])])
    const result = await runTaskSearch({ model, search: registry({}).search }, 'teach my agent to bake sourdough bread')
    expect(result).toMatchObject({ _tag: 'none', dropped: 0, turns: 2, searches: 1 })
  })

  it('answers none when every ref the model gives is one no search returned', async () => {
    const { model } = scriptedModel([searches('taxes'), answer(['made/up/skill'])])
    const result = await runTaskSearch({ model, search: registry({}).search }, 'file my taxes in estonia')
    expect(result).toMatchObject({ _tag: 'none', dropped: 1 })
  })

  it('asks for the answer without tools on the last turn', async () => {
    const { model, requests } = scriptedModel([
      searches('a'),
      searches('b'),
      answer(['owner/repo/b-skill']),
    ])
    const result = await runTaskSearch({ model, search: registry({ b: [skill('owner/repo/b-skill')] }).search }, 'some task here')
    expect(requests.map(request => request.tool_choice)).toEqual(['auto', 'auto', 'none'])
    expect(result).toMatchObject({ _tag: 'found', refs: ['owner/repo/b-skill'], turns: TASK_SEARCH_MAX_TURNS })
  })

  it('fails as an invalid response when the model still asks for searches on the last turn', async () => {
    const { model } = scriptedModel([searches('a'), searches('b'), searches('c')])
    const { search, queries } = registry({})
    const result = await runTaskSearch({ model, search }, 'some task here')
    expect(result).toMatchObject({ _tag: 'failed', reason: 'invalid-response', turns: 3 })
    expect(queries).toEqual(['a', 'b'])
  })

  it('fails as a model error and keeps the usage it already spent', async () => {
    const { model } = scriptedModel([searches('a'), new Error('2021: Insufficient AI Gateway credits')])
    const result = await runTaskSearch({ model, search: registry({}).search }, 'some task here')
    expect(result).toMatchObject({ _tag: 'failed', reason: 'model-error', turns: 2, usage: { inputTokens: 600 } })
  })

  it.each([
    ['prose', { choices: [{ message: { role: 'assistant', content: 'Here are some skills.' } }], usage }],
    ['no choices', { error: 'boom' }],
    ['nothing', null],
  ])('fails as an invalid response on %s', async (_, reply) => {
    const { model } = scriptedModel([reply])
    const result = await runTaskSearch({ model, search: registry({}).search }, 'some task here')
    expect(result).toMatchObject({ _tag: 'failed', reason: 'invalid-response', turns: 1 })
  })

  it('runs at most four searches a turn and still replies to every call', async () => {
    const { model, requests } = scriptedModel([searches('a', 'b', 'c', 'd', 'e', 'f'), answer([])])
    const { search, queries } = registry({})
    await runTaskSearch({ model, search }, 'some task here')
    expect(queries).toEqual(['a', 'b', 'c', 'd'])
    const replies = toolReplies(requests[1]!)
    expect(replies).toHaveLength(6)
    expect(replies.slice(4).map(message => message.content)).toEqual([
      'Search skipped: at most 4 searches a turn.',
      'Search skipped: at most 4 searches a turn.',
    ])
  })

  it('tells the model when a search has no usable query, without running it', async () => {
    const bad = {
      choices: [{ message: { role: 'assistant', content: null, tool_calls: [
        { id: 'call_0', type: 'function', function: { name: 'search_skills', arguments: '{"query":"  "}' } },
        { id: 'call_1', type: 'function', function: { name: 'get_skill', arguments: '{}' } },
      ] } }],
      usage,
    }
    const { model, requests } = scriptedModel([bad, answer([])])
    const { search, queries } = registry({})
    await runTaskSearch({ model, search }, 'some task here')
    expect(queries).toEqual([])
    expect(toolReplies(requests[1]!).map(message => message.content)).toEqual([
      'Invalid arguments: query must be 1 to 200 characters.',
      'Unknown tool: get_skill. Use search_skills.',
    ])
  })
})

describe('taskSearchCostMicros', () => {
  it('charges cached input at the cached rate and rounds up', () => {
    // 8000 fresh input at $0.10/M, 2000 cached at $0.01/M, 500 output at $0.50/M.
    expect(taskSearchCostMicros({ inputTokens: 10_000, cachedTokens: 2_000, outputTokens: 500 })).toBe(1070)
    expect(taskSearchCostMicros({ inputTokens: 1, cachedTokens: 0, outputTokens: 0 })).toBe(1)
  })
})
