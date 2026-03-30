import type { WorkersSavedState, WorkersSavedStateStore } from 'atproto-oauth-client-cloudflare-workers'

const STATE_TTL = 60 * 30 // 30 minutes

export class OAuthStateStore implements WorkersSavedStateStore {
  private prefix = 'atproto:oauth:state'

  async get(key: string): Promise<WorkersSavedState | undefined> {
    const val = await useStorage('data').getItem<WorkersSavedState>(`${this.prefix}:${key}`)
    return val ?? undefined
  }

  async set(key: string, val: WorkersSavedState) {
    await useStorage('data').setItem(`${this.prefix}:${key}`, val, { ttl: STATE_TTL })
  }

  async del(key: string) {
    await useStorage('data').removeItem(`${this.prefix}:${key}`)
  }
}
