export interface AuthUser {
  did: string
  handle: string
  email?: string
  avatar?: string
}

export const useAuth = createSharedComposable(() => {
  const { data: user, status, clear, refresh } = useFetch<AuthUser | null>('/api/auth/session', {
    server: false,
  })

  const isAuthenticated = computed(() => !!user.value?.did)
  const isLoading = computed(() => status.value === 'pending')

  function login(handle: string, returnTo?: string) {
    const params = new URLSearchParams({ handle })
    if (returnTo)
      params.set('returnTo', returnTo)
    return navigateTo(`/api/auth/atproto?${params}`, { external: true })
  }

  async function logout() {
    await $fetch('/api/auth/session', { method: 'delete' })
    clear()
  }

  return { user, isAuthenticated, isLoading, login, logout, refresh }
})
