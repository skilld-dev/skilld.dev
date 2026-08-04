import type { McpToolDeps } from './mcp-tools'
import { mcpTools } from './mcp-tools'

/**
 * Minimal MCP server core: JSON-RPC 2.0 over stateless Streamable HTTP.
 *
 * Hand-rolled instead of @modelcontextprotocol/sdk: the SDK's Streamable
 * HTTP transport is built around Node req/res streams plus session and SSE
 * management, none of which a stateless, read-only discovery surface on
 * Workers needs. initialize + tools/list + tools/call + ping is the whole
 * protocol surface here, and every request is self-contained.
 */

// Latest spec revision without JSON-RPC batching; we also accept older
// revisions by echoing them, since our surface predates none of their tools
// semantics.
const PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26', '2024-11-05'])

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
} as const

type JsonRpcId = string | number | null

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: Record<string, unknown>
  error?: { code: number, message: string }
}

function success(id: JsonRpcId, result: Record<string, unknown>): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function failure(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export function parseErrorResponse(): JsonRpcResponse {
  return failure(null, JSON_RPC_ERRORS.parseError, 'Parse error')
}

interface ParsedMessage {
  id: JsonRpcId
  hasId: boolean
  method: string
  params: Record<string, unknown>
}

function parseMessage(message: unknown): ParsedMessage | null {
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return null
  const m = message as Record<string, unknown>
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string')
    return null
  const hasId = 'id' in m && (typeof m.id === 'string' || typeof m.id === 'number' || m.id === null)
  const params = m.params && typeof m.params === 'object' && !Array.isArray(m.params)
    ? m.params as Record<string, unknown>
    : {}
  return { id: hasId ? m.id as JsonRpcId : null, hasId, method: m.method, params }
}

/**
 * Handle one JSON-RPC message. Returns `null` for notifications (no response
 * body; the transport answers 202 Accepted).
 */
export async function handleMcpMessage(deps: McpToolDeps, message: unknown): Promise<JsonRpcResponse | null> {
  // 2025-06-18 removed JSON-RPC batching; a batch is an invalid request.
  if (Array.isArray(message))
    return failure(null, JSON_RPC_ERRORS.invalidRequest, 'JSON-RPC batching is not supported')

  const parsed = parseMessage(message)
  if (!parsed)
    return failure(null, JSON_RPC_ERRORS.invalidRequest, 'Invalid JSON-RPC request')

  // Notifications (no id) get no response.
  if (!parsed.hasId)
    return null

  switch (parsed.method) {
    case 'initialize': {
      const requested = typeof parsed.params.protocolVersion === 'string' ? parsed.params.protocolVersion : ''
      return success(parsed.id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'skilld-discovery',
          title: 'skilld.dev discovery',
          version: '1.0.0',
        },
        instructions: 'Discovery for skilld.dev: search agent skills that maintainers publish in their own GitHub repos, look up skill and collection detail with provenance, and get the install command for the user to run. Read-only; skills work with any coding agent, and nothing here executes them.',
      })
    }
    case 'ping':
      return success(parsed.id, {})
    case 'tools/list':
      return success(parsed.id, {
        tools: mcpTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })
    case 'tools/call': {
      const name = parsed.params.name
      if (typeof name !== 'string')
        return failure(parsed.id, JSON_RPC_ERRORS.invalidParams, 'tools/call requires a tool name')
      const tool = mcpTools.find(t => t.name === name)
      if (!tool)
        return failure(parsed.id, JSON_RPC_ERRORS.invalidParams, `Unknown tool: ${name}`)
      const result = await tool.run(deps, parsed.params.arguments ?? {})
      return success(parsed.id, result as unknown as Record<string, unknown>)
    }
    default:
      return failure(parsed.id, JSON_RPC_ERRORS.methodNotFound, `Method not found: ${parsed.method}`)
  }
}
