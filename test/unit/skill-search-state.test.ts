import type { SearchSkill } from '../../app/composables/useSkillSearch'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSkillSearch } from '../../app/composables/useSkillSearch'

const fetchMock = vi.hoisted(() => vi.fn())
mockNuxtImport('$fetch', () => fetchMock)
mockNuxtImport('useAuth', () => () => ({ isAuthenticated: ref(false) }))
mockNuxtImport('useLikes', () => () => ({ ensureLiked: vi.fn() }))

function response(name: string) {
  const skill: SearchSkill = {
    name,
    owner: 'owner',
    repo: 'skills',
    slug: `owner/${name}`,
    registryPath: `/gh/owner/skills/${name}`,
  }
  return { items: [skill], total: 1 }
}

function deferred() {
  return Promise.withResolvers<ReturnType<typeof response>>()
}

let scope: ReturnType<typeof effectScope>
let search: ReturnType<typeof useSkillSearch>
beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  scope = effectScope()
  search = scope.run(() => useSkillSearch())!
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

async function type(query: string) {
  search.query.value = query
  await nextTick()
}
async function debounce() {
  await vi.advanceTimersByTimeAsync(200)
  await nextTick()
}

describe('search results belong to the current query', () => {
  it('removes previous results before the next request starts', async () => {
    fetchMock.mockResolvedValue(response('vue'))
    await type('vue')
    await debounce()
    expect((search.rows.value[0] ?? null)).toMatchObject({ skill: { name: 'vue' } })
    await type('pdf')
    expect(search.state.value._tag).toBe('loading')
    expect((search.rows.value[0] ?? null)).toBeNull()
  })

  it('ignores an old response arriving during the new query debounce', async () => {
    const oldRequest = deferred()
    fetchMock.mockReturnValueOnce(oldRequest.promise)
    await type('vue')
    await debounce()
    await type('pdf')
    oldRequest.resolve(response('vue'))
    await nextTick()
    await nextTick()
    expect(search.state.value._tag).toBe('loading')
    expect((search.rows.value[0] ?? null)).toBeNull()
  })

  it('restarts a query when typing away and back before debounce completes', async () => {
    const oldRequest = deferred()
    fetchMock.mockReturnValueOnce(oldRequest.promise).mockResolvedValue(response('vue'))
    await type('vue')
    await debounce()
    search.query.value = 'pdf'
    search.query.value = 'vue'
    await debounce()
    expect(search.state.value._tag).toBe('ready')
    expect((search.rows.value[0] ?? null)).toMatchObject({ skill: { name: 'vue' } })
  })

  it('clears old failures on input and retries the current query', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response('pdf'))
    await type('vue')
    await debounce()
    expect(search.state.value._tag).toBe('error')
    await type('pdf')
    expect(search.state.value._tag).toBe('loading')
    await search.retry()
    expect((search.rows.value[0] ?? null)).toMatchObject({ skill: { name: 'pdf' } })
  })

  it('leads an indexed Repository answer with its Repository row', async () => {
    fetchMock.mockResolvedValue({
      kind: 'repository',
      repository: { _tag: 'indexed', owner: 'vercel-labs', repo: 'agent-skills', stars: 32000, skillCount: 7, registryPath: '/gh/vercel-labs/agent-skills' },
      owner: 'vercel-labs',
      understood: null,
      items: response('react-best-practices').items,
      total: 7,
      mode: null,
    })
    await type('vercel-labs/agent-skills')
    await debounce()
    expect(search.state.value).toMatchObject({ _tag: 'ready', total: 7, repository: { owner: 'vercel-labs', repo: 'agent-skills' } })
    expect(search.rows.value.map(row => row._tag)).toEqual(['repository', 'skill'])
  })

  it('answers a one-Skill Repository with its Skill row alone', async () => {
    fetchMock.mockResolvedValue({
      kind: 'repository',
      repository: { _tag: 'indexed', owner: 'owner', repo: 'skills', stars: 2, skillCount: 1, registryPath: '/gh/owner/skills' },
      owner: 'owner',
      understood: null,
      items: response('shipreel').items,
      total: 1,
      mode: null,
    })
    await type('Owner/skills')
    await debounce()
    expect(search.state.value).toMatchObject({ _tag: 'ready', repository: { owner: 'owner', repo: 'skills' } })
    expect(search.rows.value).toMatchObject([{ _tag: 'skill', skill: { name: 'shipreel' } }])
  })

  it.each(['someone/new-skills', 'https://github.com/someone/new-skills'])('offers the index action for an unlisted repository entered as %s', async (query) => {
    fetchMock.mockResolvedValue({
      kind: 'repository',
      repository: { _tag: 'not-indexed', owner: 'someone', repo: 'new-skills', url: 'https://github.com/someone/new-skills' },
      owner: null,
      understood: null,
      items: [],
      total: 0,
      mode: null,
    })
    await type(query)
    await debounce()
    expect(search.state.value).toMatchObject({ _tag: 'repository', status: { _tag: 'idle' } })
    expect(search.rows.value).toEqual([{ _tag: 'index', repository: { _tag: 'repository', owner: 'someone', repo: 'new-skills', url: 'https://github.com/someone/new-skills' } }])
  })

  it('waits longer before asking the server about a sentence', async () => {
    fetchMock.mockResolvedValue(response('vue-testing'))
    await type('test a vue app')
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/search', expect.objectContaining({ query: { q: 'test a vue app', limit: 6 } }))
  })
})
