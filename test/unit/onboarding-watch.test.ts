import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import Discover from '../../layers/identity/app/pages/onboarding/discover.vue'

const request = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const reportFailure = vi.hoisted(() => vi.fn())

mockNuxtImport('$fetch', () => request)
mockNuxtImport('navigateTo', () => navigate)
mockNuxtImport('useActionFailure', () => () => () => reportFailure)
mockNuxtImport('useUserSession', () => () => ({ user: ref(null) }))
mockNuxtImport('useFetch', () => () => ({
  data: ref({
    syncedAt: 1,
    items: [{ owner: 'antfu', repo: 'skills', hasSkill: true, watching: false, skills: [] }],
  }),
  refresh: vi.fn(),
  status: ref('success'),
}))

beforeEach(() => vi.clearAllMocks())

it('keeps selected repos available when saving watches fails', async () => {
  request.mockRejectedValueOnce(new Error('Unavailable'))
  const wrapper = await mountSuspended(Discover)
  await flushPromises()
  const button = wrapper.findAll('button').find(button => button.text() === 'Watch 1')!
  await button.trigger('click')
  await flushPromises()

  expect(request).toHaveBeenCalledWith('/api/me/subscriptions', {
    method: 'POST',
    body: { source: 'star-import', repos: [{ owner: 'antfu', repo: 'skills' }] },
  })
  expect(reportFailure).toHaveBeenCalledOnce()
  expect(navigate).not.toHaveBeenCalled()
  expect(button.attributes('disabled')).toBeUndefined()
  expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)

  request.mockResolvedValueOnce({ ok: true })
  await button.trigger('click')
  await flushPromises()

  expect(navigate).toHaveBeenCalledExactlyOnceWith('/onboarding/email')
  expect(request).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})
