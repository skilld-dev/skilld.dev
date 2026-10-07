import type { McpToolDeps } from '../../shared/mcp-tools'
import { defineMcpHandler, defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { createError, getHeader } from 'h3'
import { mcpTools } from '../../shared/mcp-tools'

const MAX_MCP_BODY_BYTES = 64 * 1024

export default defineMcpHandler({
  description: 'Search skilld.dev for agent skills and curated collections.',
  instructions: 'Search first, inspect provenance before recommending a skill, then return the run command for the user to approve and run. Offer the install command only when the user wants the skill in every session. This server never runs or installs anything.',
  tools: (event) => {
    const deps: McpToolDeps = {
      fetchApi: (input: string, options: RequestInit) => {
        const url = new URL(input)
        return event.fetch(`${url.pathname}${url.search}`, options)
      },
      reportError: () => emitOperationalEvent(createWideEvent({ operation: 'mcp-tool', outcome: 'failed' }), 'error'),
    }
    return mcpTools.map(tool => defineMcpTool({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      handler: (args, extra) => tool.run(deps, args, extra.signal),
    }))
  },
  resources: [],
  prompts: [],
  middleware: (event) => {
    const contentLength = Number(getHeader(event, 'content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_MCP_BODY_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Payload Too Large',
        message: `MCP request body exceeds the ${MAX_MCP_BODY_BYTES}-byte limit`,
      })
    }
  },
})
