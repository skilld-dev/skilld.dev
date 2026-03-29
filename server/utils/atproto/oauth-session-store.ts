import type { NodeSavedSession, NodeSavedSessionStore } from '@atproto/oauth-client-node'

const SESSION_TTL = 60 * 60 * 24 * 179 // 179 days

export class OAuthSessionStore implements NodeSavedSessionStore {
  private prefix = 'atproto:oauth:sessions'

  async get(key: string): Promise<NodeSavedSession | undefined> {
    const val = await useStorage('data').getItem<NodeSavedSession>(`${this.prefix}:${key}`)
    return val ?? undefined
  }

  async set(key: string, val: NodeSavedSession) {
    await useStorage('data').setItem(`${this.prefix}:${key}`, val, { ttl: SESSION_TTL })
  }

  async del(key: string) {
    await useStorage('data').removeItem(`${this.prefix}:${key}`)
  }
}
