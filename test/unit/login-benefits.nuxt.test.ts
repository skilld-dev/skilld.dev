import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import Login from '../../layers/identity/app/pages/login.vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(false), ready: ref(true), fetch: async () => {} }))
mockNuxtImport('useAuth', () => () => ({
  loginUrl: ({ returnTo, action }: { returnTo: string, action: string }) => `/auth/github?${new URLSearchParams({ return_to: returnTo, action })}`,
}))

describe('account entry', () => {
  it('shows the benefits before GitHub and preserves a failed like intent for retry', async () => {
    const wrapper = await mountSuspended(Login, {
      route: '/login?return_to=%2Fgh%2Fnuxt%2Fui%3Ffrom%3Dsearch&action=like-skill&error=oauth',
    })
    expect(wrapper.text()).toContain('Sign in to like this Skill.')
    expect(wrapper.text()).toContain('Choose the weekly, monthly watched changes, or neither.')
    expect(wrapper.get('a[href="/weekly/preview"]').text()).toContain('Preview the weekly')
    const href = wrapper.findAll('a').find(link => link.text().includes('Continue with GitHub'))!.attributes('href')!
    const url = new URL(href, 'https://skilld.dev')
    expect(url.pathname).toBe('/auth/github')
    expect(url.searchParams.get('return_to')).toBe('/gh/nuxt/ui?from=search')
    expect(url.searchParams.get('action')).toBe('like-skill')
    expect(wrapper.get('[role="alert"]').text()).toBe('Couldn\'t complete sign-in. Try again.')
    wrapper.unmount()
  })
})
