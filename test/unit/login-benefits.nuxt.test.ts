import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import Login from '../../layers/identity/app/pages/login.vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(false), ready: ref(true), fetch: async () => {} }))
mockNuxtImport('useAuth', () => () => ({
  loginUrl: ({ returnTo, action }: { returnTo: string, action: string }) => `/auth/github?${new URLSearchParams({ return_to: returnTo, action })}`,
}))

describe('account entry', () => {
  it('preserves a failed like intent when switching from sign-in to sign-up', async () => {
    const wrapper = await mountSuspended(Login, {
      route: '/login?return_to=%2Fgh%2Fnuxt%2Fui%3Ffrom%3Dsearch&action=like-skill&error=oauth',
    })
    expect(wrapper.text()).toContain('Sign in to like this Skill.')
    expect(wrapper.get('h1').text()).toBe('Sign In with GitHub')
    const switchHref = wrapper.findAll('a').find(link => link.text() === 'Sign up')!.attributes('href')!
    const switchUrl = new URL(switchHref, 'https://skilld.dev')
    expect(switchUrl.searchParams.get('mode')).toBe('signup')
    expect(switchUrl.searchParams.get('action')).toBe('like-skill')
    expect(switchUrl.searchParams.get('return_to')).toBe('/gh/nuxt/ui?from=search')
    expect(switchUrl.searchParams.get('error')).toBe('oauth')
    const href = wrapper.findAll('a').find(link => link.text().includes('Continue with GitHub'))!.attributes('href')!
    const url = new URL(href, 'https://skilld.dev')
    expect(url.pathname).toBe('/auth/github')
    expect(url.searchParams.get('return_to')).toBe('/gh/nuxt/ui?from=search')
    expect(url.searchParams.get('action')).toBe('like-skill')
    expect(wrapper.get('[role="alert"]').text()).toBe('Couldn\'t complete sign-in. Try again.')
    wrapper.unmount()
  })

  it('shows benefits on sign-up and keeps the Watch intent in the sign-in link', async () => {
    const wrapper = await mountSuspended(Login, {
      route: '/login?mode=signup&return_to=%2F%40octocat%2Ftools&action=watch-collection',
    })
    expect(wrapper.get('h1').text()).toBe('Sign Up with GitHub')
    expect(wrapper.text()).toContain('Choose the weekly, monthly watched changes, or neither.')
    const switchHref = wrapper.findAll('a').find(link => link.text() === 'Sign in')!.attributes('href')!
    const url = new URL(switchHref, 'https://skilld.dev')
    expect(url.searchParams.get('mode')).toBe('signin')
    expect(url.searchParams.get('action')).toBe('watch-collection')
    expect(url.searchParams.get('return_to')).toBe('/@octocat/tools')
    wrapper.unmount()
  })
})
