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
  async run() {
    const result = await rebuildIndex()
    return { result }
  },
})
