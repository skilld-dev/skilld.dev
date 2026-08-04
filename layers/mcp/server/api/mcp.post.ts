import type { McpToolDeps } from '../utils/mcp-tools'
import { handleMcpMessage, parseErrorResponse } from '../utils/mcp-rpc'

/**
 * Discovery MCP server: Streamable HTTP transport, stateless mode.
 * Every request is a self-contained JSON-RPC message answered with a single
 * JSON body, so no sessions and no SSE stream are needed (the spec allows a
 * plain application/json response to a POSTed request). Read-only and
 * unauthenticated by design: this is Loop 1 discovery, never execution.
 *
 * Tool data comes from the registry and app layers via their public HTTP
 * APIs (`event.$fetch('/api/...')`), keeping the ADR-0001 layer seam.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => {
    // Malformed JSON is a protocol-level condition, not a server error: it
    // maps to the JSON-RPC -32700 Parse error response below.
    return undefined
  })
  if (body === undefined) {
    setResponseStatus(event, 400)
    return parseErrorResponse()
  }

  // Widen event.$fetch: tool paths are built at runtime, and pushing dynamic
  // strings through Nitro's typed route matcher overflows TS instantiation.
  const fetchApi = event.$fetch as unknown as McpToolDeps['fetchApi']
  const response = await handleMcpMessage({ fetchApi }, body)

  // Notification: acknowledged, no body.
  if (!response) {
    setResponseStatus(event, 202)
    return null
  }
  return response
})
