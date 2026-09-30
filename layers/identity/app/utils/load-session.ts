/**
 * Load the session before a per-visitor page renders.
 *
 * Public pages never call this: the server renders them signed out so one
 * stored copy serves every visitor, and the browser loads the session after
 * hydration. A page that does call it renders for one visitor, so on the
 * server it is also marked private. No shared cache may keep it, whatever
 * route rule matches the path later.
 */
export async function loadSession(): Promise<void> {
  if (import.meta.server) {
    useResponseHeader('cache-control').value = 'private, no-store'
    useResponseHeader('cloudflare-cdn-cache-control').value = 'private, no-store'
  }
  const { ready, fetch } = useUserSession()
  if (!ready.value)
    await fetch()
}
