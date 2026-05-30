// Canonical guide URLs are registry-namespaced and version-agnostic:
// `/guides/npm/<pkg>`. The page title carries the current version. Two redirect
// duties keep a single indexable URL per package that accumulates link equity:
//   1. version aliases (`/guides/npm/<pkg>/migrating-to-<version>`, change8-style)
//      301 to the canonical, so old-version requests land on the latest.
//   2. legacy flat URLs (`/guides/<pkg>`, pre-namespace) 301 into `/guides/npm/`.
const MIGRATING_SEGMENT_RE = /\/migrating-to-[^/]+\/?$/

export default defineEventHandler((event) => {
  const path = event.path
  if (!path || !path.startsWith('/guides'))
    return

  // Strip a trailing slash for comparison; `/guides` itself is the index hub.
  const clean = path.replace(/\/+$/, '') || '/guides'
  if (clean === '/guides')
    return

  // Drop any version-alias segment first (`…/migrating-to-v1.2.3`).
  const deversioned = clean.replace(MIGRATING_SEGMENT_RE, '')

  if (deversioned.startsWith('/guides/npm/')) {
    // Already namespaced — only redirect if we stripped a version alias.
    if (deversioned !== clean)
      return sendRedirect(event, deversioned, 301)
    return
  }

  // Bare `/guides/npm` → the hub.
  if (deversioned === '/guides/npm')
    return sendRedirect(event, '/guides', 301)

  // Legacy flat `/guides/<pkg>` (incl. scoped names) → namespaced canonical.
  const pkg = deversioned.slice('/guides/'.length)
  if (pkg)
    return sendRedirect(event, `/guides/npm/${pkg}`, 301)
})
