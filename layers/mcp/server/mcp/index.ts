import { defineMcpHandler, defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { createError, getHeader } from 'h3'
import { mcpTools } from '../../shared/mcp-tools'

const MAX_MCP_BODY_BYTES = 64 * 1024

export default defineMcpHandler({
  description: 'Search skilld.dev for agent skills and curated collections.',
  instructions: 'Start with search_skills, inspect provenance with get_skill, then return an install command for the user to approve and run.',
  tools: (event) => {
    const deps = {
      fetchApi: (path: string, options?: Parameters<typeof event.$fetch>[1]) => event.$fetch(path, options),
      reportError: () => emitOperationalEvent(createWideEvent({ operation: 'mcp-tool', outcome: 'failed' }), 'error'),
    }
    return mcpTools.map(tool => defineMcpTool({
      name: tool.name,
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
