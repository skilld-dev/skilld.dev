/**
 * Request headers of a browser that holds a session cookie.
 *
 * `readUserSession` opens a session only for a request that carries one, so a
 * test that stubs `getUserSession` with a signed-in user sends these too. The
 * value is opaque; the stub decides who the session belongs to.
 */
export const SIGNED_IN_HEADERS = { cookie: 'nuxt-session=test-session' } satisfies Record<string, string>
