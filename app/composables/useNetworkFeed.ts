interface NetworkFeedCurator {
  did: string
  handle: string
  displayName: string | null
  avatar: string | null
  reason: string | null
  collection: { uri: string, slug: string, name: string }
  pickedAt: string
}

export interface NetworkFeedSkill {
  packageName: string
  owner: string | null
  repo: string | null
  pickedAt: string
  curators: NetworkFeedCurator[]
}

interface NetworkFeedResponse {
  skills: NetworkFeedSkill[]
  total: number
  followCount: number
  generatedAt: string
}

export function useNetworkFeed() {
  const { isAuthenticated } = useAuth()

  return useFetch<NetworkFeedResponse>('/api/feed/network', {
    server: false,
    immediate: false,
    watch: [isAuthenticated],
    default: () => ({ skills: [], total: 0, followCount: 0, generatedAt: '' }),
  })
}

export async function refreshFollows(): Promise<{ refreshedAt: string, followCount: number }> {
  return $fetch('/api/social/refresh-follows', { method: 'POST' })
}
