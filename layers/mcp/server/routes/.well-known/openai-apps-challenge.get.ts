// The OpenAI plugin portal proves that we own skilld.dev before it connects
// the MCP server. It reads this URL and expects the exact token as plain text.
export default defineEventHandler((event) => {
  const token = useRuntimeConfig(event).openaiAppsChallenge
  if (!token)
    throw createError({ statusCode: 404, statusMessage: 'No OpenAI domain challenge is set' })
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return token
})
