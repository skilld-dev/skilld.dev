import type { McpToolDeps } from '../../shared/mcp-tools'
import type { WebMcpInputSchema, WebMcpModelContext, WebMcpTool } from './webmcp-support'
import { z } from 'zod'
import { mcpTools } from '../../shared/mcp-tools'

const UNTRUSTED_OUTPUT_TOOLS = new Set([
  'search_skills',
  'get_skill',
  'get_collection',
])

export type WebMcpRegistrationResult
  = | { _tag: 'registered', count: number }
    | { _tag: 'error', cause: unknown }

function errorMessage(content: { text: string }[]): string {
  return content[0]?.text ?? 'Tool execution failed.'
}

export function createWebMcpTools(
  deps: McpToolDeps,
  signal: AbortSignal,
): WebMcpTool[] {
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(z.object(tool.inputSchema), { io: 'input' }) as WebMcpInputSchema,
    execute: async (input) => {
      const result = await tool.run(deps, input, signal)
      if (result.isError)
        return { _tag: 'error', message: errorMessage(result.content) }
      return { _tag: 'ok', data: result.structuredContent ?? {} }
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: UNTRUSTED_OUTPUT_TOOLS.has(tool.name),
    },
  }))
}

export function registerWebMcpTools(
  modelContext: WebMcpModelContext,
  tools: WebMcpTool[],
  controller: AbortController,
): Promise<WebMcpRegistrationResult> {
  return Promise.all(
    tools.map(tool => modelContext.registerTool(tool, { signal: controller.signal })),
  )
    .then(() => ({ _tag: 'registered' as const, count: tools.length }))
    .catch((cause): WebMcpRegistrationResult => {
      controller.abort()
      return { _tag: 'error', cause }
    })
}
