import type { IndexedCurator } from '../../server/utils/atproto/curator-index'

interface FollowingCuratorsResponse {
  curators: IndexedCurator[]
  total: number
}

export function useFollowingCurators() {
  const { isAuthenticated } = useAuth()

  return useFetch<FollowingCuratorsResponse>('/api/social/following-curators', {
    server: false,
    immediate: false,
    watch: [isAuthenticated],
    default: () => ({ curators: [], total: 0 }),
  })
}
