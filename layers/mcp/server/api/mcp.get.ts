/**
 * The discovery server is stateless and never pushes messages, so it offers
 * no SSE stream. Per the Streamable HTTP spec a server that does not offer
 * one answers GET with 405 Method Not Allowed.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'Allow', 'POST')
  setResponseStatus(event, 405)
  return {
    error: 'Method not allowed. POST JSON-RPC messages to /api/mcp (MCP Streamable HTTP, stateless).',
  }
})
