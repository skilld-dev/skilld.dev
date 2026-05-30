// Canonical guide URLs are version-agnostic: `/guides/<pkg>`. The page title
// carries the current version. Any version-specific alias
// (`/guides/<pkg>/migrating-to-<version>`, change8-style) 301s to the canonical
// so a frequently-versioned package keeps a single indexable URL that
// accumulates link equity, and old version requests redirect to the latest.
const MIGRATING_SEGMENT_RE = /\/migrating-to-[^/]+\/?$/

export default defineEventHandler((event) => {
  const path = event.path
  if (!path || !path.startsWith('/guides/'))
    return

  if (MIGRATING_SEGMENT_RE.test(path)) {
    const canonical = path.replace(MIGRATING_SEGMENT_RE, '')
    return sendRedirect(event, canonical, 301)
  }
})
