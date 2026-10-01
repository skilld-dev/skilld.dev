import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import HeaderAccount from '../../layers/identity/app/components/HeaderAccount.vue'

const logout = vi.hoisted(() => vi.fn())

mockNuxtImport('useAuth', () => () => ({
  state: computed(() => ({ _tag: 'signed-in', user: { login: 'harlan', onboarded: true } })),
  user: ref({ login: 'harlan', onboarded: true }),
  isAuthenticated: computed(() => true),
  isLoading: ref(false),
  logout,
  loginUrl: () => '/auth/github',
  fetchSession: vi.fn(),
}))

describe('header account menu', () => {
  it('opens the signed-in menu, which loads after the page', async () => {
    const wrapper = await mountSuspended(HeaderAccount, { attachTo: document.body })
    await flushPromises()

    const trigger = wrapper.get('button[aria-label="Signed in as @harlan"]')
    await trigger.trigger('pointerdown', { button: 0, pointerType: 'mouse' })
    await trigger.trigger('click')
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Sign out')
    })
    expect(document.body.textContent).toContain('@harlan')

    wrapper.unmount()
  })
})
