import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useAuth } from '../../layers/identity/app/composables/useAuth'
import Discover from '../../layers/identity/app/pages/onboarding/discover.vue'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), fetch: vi.fn(), toast: vi.fn(), remove: vi.fn(), failure: vi.fn(() => null) }))
const session = ref<{ user: { login: string } } | null>({ user: { login: 'octocat' } })
const stars = ref({ syncedAt: 1, items: [{ owner: 'nuxt', repo: 'ui', hasSkill: true, watching: false, skills: [{ name: 'motion', displayName: 'motion', slug: 'motion' }] }] })
mockNuxtImport('$fetch', () => mocks.fetch)
mockNuxtImport('navigateTo', () => mocks.navigate)
mockNuxtImport('useToast', () => () => ({ add: mocks.toast }))
mockNuxtImport('removeNuxtQueries', () => mocks.remove)
mockNuxtImport('useActionFailure', () => () => Object.assign(() => mocks.failure, { clear: vi.fn() }))
mockNuxtImport('useUserSession', () => () => ({
  ready: ref(true),
  loggedIn: ref(true),
  user: ref({ login: 'octocat' }),
  session,
  fetch: vi.fn(),
}))
mockNuxtImport('useFetch', () => () => ({ data: stars, status: ref('success'), error: ref(), refresh: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  session.value = { user: { login: 'octocat' } }
})

describe('onboarding watch save', () => {
  it('keeps the selections and stays on discovery when the save fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const wrapper = await mountSuspended(Discover, { global: { stubs: { OwnedSkillsPrompt: true } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('Watch 1'))!.trigger('click')
    await flushPromises()
    expect(mocks.failure).toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('advances only after the watch save succeeds', async () => {
    mocks.fetch.mockResolvedValue({ ok: true })
    const wrapper = await mountSuspended(Discover, { global: { stubs: { OwnedSkillsPrompt: true } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('Watch 1'))!.trigger('click')
    await flushPromises()
    expect(mocks.navigate).toHaveBeenCalledWith('/onboarding/email')
    wrapper.unmount()
  })
})

describe('sign out', () => {
  async function mountAuth() {
    let auth: ReturnType<typeof useAuth>
    const wrapper = await mountSuspended(defineComponent({ setup() {
      auth = useAuth()
      return () => h('div')
    } }))
    return { auth: auth!, wrapper }
  }

  it('keeps the session and shows feedback when sign out fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const { auth, wrapper } = await mountAuth()
    await auth.logout()
    expect(session.value?.user.login).toBe('octocat')
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not sign out' }))
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(auth.isLoading.value).toBe(false)
    wrapper.unmount()
  })

  it('sends one request, clears private data, and returns home', async () => {
    let resolve: (value: unknown) => void
    mocks.fetch.mockImplementation(() => new Promise((done) => {
      resolve = done
    }))
    const { auth, wrapper } = await mountAuth()
    const pending = auth.logout()
    await auth.logout()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    resolve!({ ok: true })
    await pending
    expect(session.value).toBeNull()
    expect(mocks.remove).toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith('/', { external: true })
    wrapper.unmount()
  })
})
