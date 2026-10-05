import { parseReturnTo } from '#shared/return-to'

// Browser and CLI sign-in share the same sealed intent through GitHub.
export default defineEventHandler((event) => {
  const returnTo = parseReturnTo(getQuery(event).return_to)
  return sendRedirect(event, `/auth/github?return_to=${encodeURIComponent(returnTo)}`)
})
