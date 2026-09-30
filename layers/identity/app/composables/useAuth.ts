import type { User } from '#auth-utils'

/**
 * Who is looking, as far as this render knows.
 *
 * `pending` is the server render of every public page and the first client
 * frames after hydration. The server renders public pages without reading the
 * session (`auth.loadStrategy: 'client-only'`), so one stored copy of a page
 * can serve every visitor. An auth-dependent slot renders a neutral placeholder
 * of its final size while pending, so a signed-in visitor never sees a
 * signed-out control first and nothing moves when the session lands.
 */
export type AuthState
  = | { _tag: 'pending' }
    | { _tag: 'anonymous' }
    | { _tag: 'signed-in', user: User }

// Backed by nuxt-auth-utils useUserSession().
export function useAuth() {
  const { ready, loggedIn, user, clear, fetch: fetchSession } = useUserSession()
  const state = computed<AuthState>(() => {
    if (!ready.value)
      return { _tag: 'pending' }
    return user.value ? { _tag: 'signed-in', user: user.value } : { _tag: 'anonymous' }
  })
  const isAuthenticated = computed(() => loggedIn.value)
  const isLoading = ref(false)
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await clear()
    await navigateTo('/')
  }
  function loginUrl(opts: { returnTo?: string, action?: string } = {}): string {
    const params = new URLSearchParams()
    if (opts.returnTo)
      params.set('return_to', opts.returnTo)
    if (opts.action)
      params.set('action', opts.action)
    const qs = params.toString()
    return qs ? `/auth/github?${qs}` : '/auth/github'
  }
  return { state, user, isAuthenticated, isLoading, logout, loginUrl, fetchSession }
}
