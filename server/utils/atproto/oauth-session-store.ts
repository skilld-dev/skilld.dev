import type { WorkersSavedSession, WorkersSavedSessionStore } from 'atproto-oauth-client-cloudflare-workers'

const SESSION_TTL = 60 * 60 * 24 * 179 // 179 days

export class OAuthSessionStore implements WorkersSavedSessionStore {
  private prefix = 'atproto:oauth:sessions'

  async get(key: string): Promise<WorkersSavedSession | undefined> {
    const val = await useStorage('data').getItem<WorkersSavedSession>(`${this.prefix}:${key}`)
    return val ?? undefined
  }

  async set(key: string, val: WorkersSavedSession) {
    await useStorage('data').setItem(`${this.prefix}:${key}`, val, { ttl: SESSION_TTL })
  }

  async del(key: string) {
    await useStorage('data').removeItem(`${this.prefix}:${key}`)
  }
}
