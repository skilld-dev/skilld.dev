/// <reference types="@cloudflare/workers-types" />
import { rebuildIndex } from '../utils/atproto/curator-index'

/**
 * Scheduled task: rebuild the curator index from network state.
 * Runs every 10 minutes on Cloudflare Workers via Nitro cron.
 * Re-fetches all curator profiles and collection counts, removing
 * curators with zero collections or flagged profiles.
 */
export default defineTask({
  meta: {
    name: 'refresh-curators',
    description: 'Rebuild curator index from AT Protocol network state',
  },
  async run({ context }) {
    // On cloudflare-durable, the task context includes cloudflare bindings
    const db = (context as Record<string, any>).cloudflare?.env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[refresh-curators] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }
    const result = await rebuildIndex(db)
    return { result }
  },
})
