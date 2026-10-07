import type { McpToolDeps } from '../../shared/mcp-tools'
import { defineMcpHandler, defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { createError, getHeader } from 'h3'
import { mcpTools } from '../../shared/mcp-tools'

const MAX_MCP_BODY_BYTES = 64 * 1024

export default defineMcpHandler({
  description: 'Search and browse skilld.dev for agent skills, and read who wrote each one.',
  instructions: 'skilld.dev is a curated registry of agent skills. Search first, inspect provenance before recommending a skill, then return the run command for the user to approve and run. Offer the install command only when the user wants the skill in every session. Without a shell, such as in a chat app, follow the markdown from get_skill for this session, and tell the user the skill name and source repository first. If its behaviors list any with tier ask, show those to the user and wait for their approval before you follow the markdown, as skilld run does. Those behaviors cover SKILL.md and the file names only. skilld.dev shows who wrote a skill and where its source lives. It does not review skills for safety, so never call a skill safe or verified. This server never runs or installs anything.',
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
      // Claude's directory reads the title from the annotations as well.
      annotations: { title: tool.title, ...tool.annotations },
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
