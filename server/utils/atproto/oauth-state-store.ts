import type { NodeSavedState, NodeSavedStateStore } from '@atproto/oauth-client-node'

const STATE_TTL = 60 * 30 // 30 minutes

export class OAuthStateStore implements NodeSavedStateStore {
  private prefix = 'atproto:oauth:state'

  async get(key: string): Promise<NodeSavedState | undefined> {
    const val = await useStorage('data').getItem<NodeSavedState>(`${this.prefix}:${key}`)
    return val ?? undefined
  }

  async set(key: string, val: NodeSavedState) {
    await useStorage('data').setItem(`${this.prefix}:${key}`, val, { ttl: STATE_TTL })
  }

  async del(key: string) {
    await useStorage('data').removeItem(`${this.prefix}:${key}`)
  }
}
