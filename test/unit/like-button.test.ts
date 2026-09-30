import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import LikeButton from '../../layers/identity/app/components/LikeButton.vue'
import { useLikes } from '../../layers/identity/app/composables/useLikes'

const loggedIn = ref(true)
/** False while the browser is still loading the session after hydration. */
const sessionKnown = ref(true)
const fetchMock = vi.hoisted(() => vi.fn())

mockNuxtImport('useAuth', () => () => ({
  state: computed(() => {
    if (!sessionKnown.value)
      return { _tag: 'pending' }
    return loggedIn.value
      ? { _tag: 'signed-in', user: { login: 'harlan', onboarded: true } }
      : { _tag: 'anonymous' }
  }),
  user: ref({ login: 'harlan', onboarded: true }),
  isAuthenticated: computed(() => sessionKnown.value && loggedIn.value),
  isLoading: ref(false),
  logout: vi.fn(),
  loginUrl: (opts: { returnTo?: string, action?: string } = {}) => {
    const params = new URLSearchParams()
    if (opts.returnTo)
      params.set('return_to', opts.returnTo)
    if (opts.action)
      params.set('action', opts.action)
    return params.toString() ? `/auth/github?${params}` : '/auth/github'
  },
  fetchSession: vi.fn(),
}))

mockNuxtImport('$fetch', () => fetchMock)

const skill = { owner: 'antfu', repo: 'skills', name: 'nuxt' }

/** Items `/api/me/likes` reports for the session under test. */
let likedItems: Array<{ owner: string, repo: string, name: string, likeCount: number }> = []
/** Resolution of the next like mutation, so a test can force the failure path. */
let mutation: { _tag: 'ok', likeCount: number } | { _tag: 'error' } = { _tag: 'ok', likeCount: 0 }
/** Held open by a test that needs to observe state mid-flight. */
let listGate: { promise: Promise<void>, release: () => void } | null = null

function holdListRequest() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  listGate = { promise, release }
  return () => listGate!.release()
}

function resetLikeState() {
  useState<Record<string, true>>('skill-likes', () => ({})).value = {}
  useState<Record<string, number>>('skill-like-counts', () => ({})).value = {}
  useState<boolean>('skill-likes-loaded', () => false).value = false
  useState<Record<string, true>>('skill-likes-pending', () => ({})).value = {}
}

beforeEach(() => {
  likedItems = []
  mutation = { _tag: 'ok', likeCount: 0 }
  listGate = null
  loggedIn.value = true
  sessionKnown.value = true
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path: string, options?: { method?: string }) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET' && path === '/api/me/likes') {
      if (listGate)
        await listGate.promise
      return { items: likedItems }
    }
    if (mutation._tag === 'error')
      throw new Error('offline')
    return { ok: true, likeCount: mutation.likeCount }
  })
  resetLikeState()
})

describe('likeButton toggle semantics', () => {
  it('exposes pressed state and an action-specific label that follows the like', async () => {
    const wrapper = await mountSuspended(LikeButton, { props: { ...skill, count: 4 } })
    await flushPromises()

    const button = wrapper.get('button')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('aria-label')).toBe('Like nuxt')
    expect(button.text()).toContain('4')

    mutation = { _tag: 'ok', likeCount: 5 }
    await button.trigger('click')
    await flushPromises()

    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('aria-label')).toBe('Unlike nuxt')
    expect(button.text()).toContain('5')

    wrapper.unmount()
  })

  it('restores the count and pressed state when the mutation fails', async () => {
    const wrapper = await mountSuspended(LikeButton, { props: { ...skill, count: 4 } })
    await flushPromises()

    const button = wrapper.get('button')
    mutation = { _tag: 'error' }
    await button.trigger('click')
    await flushPromises()

    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.text()).toContain('4')

    wrapper.unmount()
  })

  it('sends an anonymous visitor through OAuth carrying the like intent and return path', async () => {
    loggedIn.value = false
    const wrapper = await mountSuspended(LikeButton, { props: { ...skill, count: 2 } })
    await flushPromises()

    const link = wrapper.get('a')
    const href = link.attributes('href')!
    expect(wrapper.find('button').exists()).toBe(false)
    expect(new URL(href, 'https://skilld.dev').searchParams.get('action')).toBe('like-skill')
    expect(new URL(href, 'https://skilld.dev').searchParams.get('return_to')).toBe('/')
    expect(link.attributes('aria-label')).toBe('Like nuxt')

    wrapper.unmount()
  })

  it('holds a disabled heart with the count until the session is known, then offers the like', async () => {
    sessionKnown.value = false
    likedItems = [{ ...skill, likeCount: 5 }]
    const wrapper = await mountSuspended(LikeButton, { props: { ...skill, count: 4 } })
    await flushPromises()

    const placeholder = wrapper.get('button')
    expect(placeholder.attributes('disabled')).toBeDefined()
    expect(placeholder.text()).toContain('4')
    expect(wrapper.find('a').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    sessionKnown.value = true
    await flushPromises()

    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.text()).toContain('5')

    wrapper.unmount()
  })

  it('keeps a liked heart visible on cards, and hides an unliked one until hover', async () => {
    likedItems = [{ ...skill, likeCount: 9 }]
    const liked = await mountSuspended(LikeButton, {
      props: { ...skill, count: 9, variant: 'card' },
    })
    const unliked = await mountSuspended(LikeButton, {
      props: { owner: 'antfu', repo: 'skills', name: 'other', count: 0, variant: 'card' },
    })
    await flushPromises()

    expect(liked.get('button').classes()).toContain('opacity-100')
    expect(liked.get('button').classes()).not.toContain('opacity-0')
    expect(unliked.get('button').classes()).toContain('opacity-0')
    expect(unliked.get('button').classes()).toContain('group-hover:opacity-100')

    liked.unmount()
    unliked.unmount()
  })
})

describe('useLikes hydration', () => {
  it('shares one in-flight request across every mounted heart', async () => {
    // A `loaded` boolean alone let the second LikeButton on a page return before
    // the data arrived and snapshot an empty like set, which double-counted the
    // viewer's own like (rendered 2 for a skill with one like).
    likedItems = [{ ...skill, likeCount: 3 }]
    const release = holdListRequest()

    const likes = useLikes()
    const first = likes.ensureLoaded()
    const second = likes.ensureLoaded()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    release()
    await Promise.all([first, second])

    expect(likes.isLiked(skill)).toBe(true)
    expect(likes.likeCount(skill)).toBe(3)
  })

  it('only reports a skill as liked once the response has been applied', async () => {
    likedItems = [{ ...skill, likeCount: 1 }]
    const release = holdListRequest()

    const likes = useLikes()
    const pending = likes.ensureLoaded()
    expect(likes.isLiked(skill)).toBe(false)

    release()
    await pending

    expect(likes.isLiked(skill)).toBe(true)
  })

  it('retries after a failed load instead of leaving every heart empty', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const likes = useLikes()
    await likes.ensureLoaded()

    expect(likes.isLiked(skill)).toBe(false)

    likedItems = [{ ...skill, likeCount: 2 }]
    await likes.ensureLoaded()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(likes.isLiked(skill)).toBe(true)
  })

  it('treats the same skill name in different repos as separate likes', async () => {
    likedItems = [{ owner: 'richtabor', repo: 'agent-skills', name: 'humanize', likeCount: 1 }]
    const likes = useLikes()
    await likes.ensureLoaded()

    expect(likes.isLiked({ owner: 'richtabor', repo: 'agent-skills', name: 'humanize' })).toBe(true)
    expect(likes.isLiked({ owner: 'other', repo: 'agent-skills', name: 'humanize' })).toBe(false)
  })
})

describe('reserved collection slugs', () => {
  it('rejects a collection that would shadow /@login/liked', async () => {
    const { CreateCollectionInput } = await import('../../server/schemas/collection-input')
    const base = { name: 'My picks', preamble: null, skills: [] }

    expect(CreateCollectionInput.safeParse({ ...base, slug: 'liked' }).success).toBe(false)
    expect(CreateCollectionInput.safeParse({ ...base, slug: 'LIKED' }).success).toBe(false)
    expect(CreateCollectionInput.safeParse({ ...base, slug: 'liked-skills' }).success).toBe(true)
  })
})
