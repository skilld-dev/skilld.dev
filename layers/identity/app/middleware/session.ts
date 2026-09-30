/**
 * Render this page with the visitor's session, signed in or not.
 *
 * For a page whose server render depends on who is asking but that a signed
 * out visitor may still open. `auth` is the same load plus a redirect to
 * sign-in.
 */
export default defineNuxtRouteMiddleware(async () => {
  await loadSession()
})
