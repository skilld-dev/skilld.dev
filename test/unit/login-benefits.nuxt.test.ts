import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import Login from '../../layers/identity/app/pages/login.vue'

const mocks = vi.hoisted(() => ({ signedIn: false, navigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mocks.navigate)
mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(mocks.signedIn), ready: ref(true), fetch: async () => {} }))
mockNuxtImport('useAuth', () => () => ({
  loginUrl: ({ returnTo, action }: { returnTo: string, action: string }) => `/auth/github?${new URLSearchParams({ return_to: returnTo, action })}`,
}))

describe('account entry', () => {
  beforeEach(() => {
    mocks.signedIn = false
    mocks.navigate.mockReset()
  })

  it.each(['like-skill', 'watch-skill', 'watch-collection'])('keeps %s when a stale anonymous page reaches an existing session', async (action) => {
    mocks.signedIn = true
    const returnTo = action === 'watch-collection' ? '/@octocat/tools' : '/gh/nuxt/ui/motion'
    const wrapper = await mountSuspended(Login, {
      route: `/login?${new URLSearchParams({ return_to: returnTo, action })}`,
    })

    expect(mocks.navigate).toHaveBeenCalledWith(
      `/auth/github?${new URLSearchParams({ return_to: returnTo, action })}`,
      { external: true, replace: true },
    )
    wrapper.unmount()
  })

  it('leaves a failed replay available to retry instead of looping through OAuth', async () => {
    mocks.signedIn = true
    const wrapper = await mountSuspended(Login, {
      route: '/login?return_to=%2Fgh%2Fnuxt%2Fui%2Fmotion&action=like-skill&error=oauth',
    })

    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('Try again.')
    expect(wrapper.findAll('a').find(link => link.text().includes('Continue with GitHub'))!.attributes('href'))
      .toContain('action=like-skill')
    wrapper.unmount()
  })

  it.each(['', '&action=unknown'])('returns a signed-in visitor directly when there is no supported action%s', async (action) => {
    mocks.signedIn = true
    const wrapper = await mountSuspended(Login, {
      route: `/login?return_to=%2Fgh%2Fnuxt%2Fui${action}`,
    })

    expect(mocks.navigate).toHaveBeenCalledWith('/gh/nuxt/ui', { replace: true })
    wrapper.unmount()
  })

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
