import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ApiTokenSetup from '../../layers/marketing/app/components/_ApiTokenSetup.vue'

const auth = ref({ _tag: 'signed-in' })
const request = vi.hoisted(() => vi.fn())
mockNuxtImport('$fetch', () => request)
mockNuxtImport('useAuth', () => () => ({
  state: auth,
  loginUrl: ({ returnTo }: { returnTo: string }) => `/auth/github?return_to=${encodeURIComponent(returnTo)}`,
}))

function createButton(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  return wrapper.findAll('button').find(button => button.text().includes('Create token'))!
}

describe('inline API token setup', () => {
  beforeEach(() => {
    auth.value = { _tag: 'signed-in' }
    request.mockReset()
  })

  it('stays inline, shows loading, and fills the highlighted .env snippet', async () => {
    let resolve!: (value: unknown) => void
    request.mockImplementation(() => new Promise((resolvePromise) => {
      resolve = resolvePromise
    }))
    const wrapper = await mountSuspended(ApiTokenSetup)
    await createButton(wrapper).trigger('click')
    expect(createButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Creating your token.')
    expect(request).toHaveBeenCalledWith('/api/me/cli-tokens', { method: 'POST', body: { label: 'API script', ttl_days: 90 } })
    resolve({ accessToken: 'local.test.credential', expiresAt: 2_000_000_000 })
    await flushPromises()
    expect(wrapper.find('code').text()).toBe('SKILLD_TOKEN="local.test.credential"')
    expect(wrapper.find('code .shj-str').exists()).toBe(true)
    expect(wrapper.text()).toContain('Token created. Copy it now.')
    expect(wrapper.findAll('button').some(button => button.text().includes('Create token'))).toBe(false)
    wrapper.unmount()
  })

  it('shows an error and permits retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ accessToken: 'retry.test.credential', expiresAt: 2_000_000_000 })
    const wrapper = await mountSuspended(ApiTokenSetup)
    await createButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Could not create the token. Try again.')
    await createButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('code').text()).toContain('retry.test.credential')
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('returns anonymous visitors to the API tab after sign-in without creating a token', async () => {
    auth.value = { _tag: 'anonymous' }
    const wrapper = await mountSuspended(ApiTokenSetup)
    const link = wrapper.findAll('a').find(anchor => anchor.text().includes('Sign in to create'))!
    expect(link.attributes('href')).toBe('/auth/github?return_to=%2Fdevelopers%3Fsetup%3Dapi')
    expect(request).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
