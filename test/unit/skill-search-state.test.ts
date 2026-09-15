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
    expect(search.activeRow.value).toMatchObject({ skill: { name: 'vue' } })
    await type('pdf')
    expect(search.state.value._tag).toBe('loading')
    expect(search.activeRow.value).toBeNull()
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
    expect(search.activeRow.value).toBeNull()
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
    expect(search.activeRow.value).toMatchObject({ skill: { name: 'vue' } })
  })

  it('clears old failures on input and retries the current query', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response('pdf'))
    await type('vue')
    await debounce()
    expect(search.state.value._tag).toBe('error')
    await type('pdf')
    expect(search.state.value._tag).toBe('loading')
    await search.retry()
    expect(search.activeRow.value).toMatchObject({ skill: { name: 'pdf' } })
  })
})
