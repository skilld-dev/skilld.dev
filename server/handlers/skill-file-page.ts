import { AI_READY_INTERNAL_HEADER } from '#shared/content-negotiation'
import { isSkillFilePagePath } from '#shared/skill-asset-path'

/**
 * Send every Skill file URL to the file view page.
 *
 * nuxt-ai-ready answers any `.md` URL with the page at the same path minus
 * `.md`, converted to Markdown. A Skill file URL keeps the file's own name, so
 * `/-/reference.md` came back as the Skill page in Markdown. The module offers
 * no per-route opt-out; it skips only requests that carry its internal header.
 *
 * Content negotiation skips the same requests. The file is already the
 * content, so no Markdown twin exists to redirect to.
 * The request plugin calls this before the module caches its routing decision.
 */
export default defineEventHandler((event) => {
  if (!isSkillFilePagePath(event.url.pathname))
    return
  // Cloudflare supplies immutable incoming request headers.
  const headers = new Headers(event.req.headers)
  headers.set(AI_READY_INTERNAL_HEADER, '1')
  Object.defineProperty(event.req, 'headers', { value: headers, configurable: true })
})
