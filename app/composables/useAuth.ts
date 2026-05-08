// Phase 1 stub: real auth (GitHub OAuth) lands in Phase 2.
export interface AuthUser {
  login: string
  name?: string
  avatar?: string
}

export const useAuth = createSharedComposable(() => {
  const user = ref<AuthUser | null>(null)
  const isAuthenticated = computed(() => false)
  const isLoading = computed(() => false)
  return { user, isAuthenticated, isLoading }
})
