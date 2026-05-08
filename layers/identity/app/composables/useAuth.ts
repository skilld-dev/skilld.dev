// Replaces the Phase 1 stub. Backed by nuxt-auth-utils useUserSession().
export function useAuth() {
  const { loggedIn, user, clear, fetch: fetchSession } = useUserSession()
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
  return { user, isAuthenticated, isLoading, logout, loginUrl, fetchSession }
}
