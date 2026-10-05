import { INDEXNOW_KEY } from '~~/server/utils/indexnow'

/**
 * Answer the IndexNow key file from the Worker.
 *
 * The task checks this URL through the SELF binding, and Nitro's public asset
 * table is empty here (see `nitro.alias` in nuxt.config.ts). A static file in
 * `public/` may not be reachable that way, so the Worker serves the key itself.
 * The key has one source: `INDEXNOW_KEY`.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return INDEXNOW_KEY
})
