import type { WebMcpModelContext } from '../../layers/mcp/app/utils/webmcp-support'
import type { McpToolDeps } from '../../layers/mcp/shared/mcp-tools'
import { describe, expect, it, vi } from 'vitest'
import { getWebMcpModelContext } from '../../layers/mcp/app/utils/webmcp-support'
import {
  createWebMcpTools,
  registerWebMcpTools,
} from '../../layers/mcp/app/utils/webmcp-tools'

function deps(fetchApi: McpToolDeps['fetchApi'] = vi.fn()): McpToolDeps {
  return {
    fetchApi,
    reportError: vi.fn(),
  }
}

describe('webmcp support', () => {
  it('feature-detects the current document.modelContext API', () => {
    expect(getWebMcpModelContext({} as Document)).toBeNull()

    const modelContext: WebMcpModelContext = {
      registerTool: vi.fn().mockResolvedValue(undefined),
    }
    expect(getWebMcpModelContext({ modelContext } as unknown as Document)).toBe(modelContext)
  })
})

describe('webmcp discovery tools', () => {
  it('exposes the MCP tools as read-only JSON Schema tools', () => {
    const tools = createWebMcpTools(deps(), new AbortController().signal)

    expect(tools.map(tool => tool.name)).toEqual([
      'search_skills',
      'get_skill',
      'get_collection',
      'install_command',
    ])
    expect(tools[0]!.inputSchema).toMatchObject({
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        limit: { type: 'integer', default: 10, minimum: 1, maximum: 20 },
      },
    })
    expect(tools[0]!.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(tools[3]!.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: false,
    })
  })

  it('returns tagged data and preserves cancellation', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ total: 0, items: [] })
    const controller = new AbortController()
    const search = createWebMcpTools(deps(fetchApi), controller.signal)[0]!

    const result = await search.execute({ query: 'nuxt seo' })

    expect(result).toEqual({
      _tag: 'ok',
      data: { query: 'nuxt seo', total: 0, results: [] },
    })
    expect(fetchApi).toHaveBeenCalledWith('/api/skills', {
      query: { q: 'nuxt seo', limit: 10 },
      signal: controller.signal,
    })
  })

  it('returns expected validation failures as tagged values', async () => {
    const fetchApi = vi.fn()
    const search = createWebMcpTools(deps(fetchApi), new AbortController().signal)[0]!

    const result = await search.execute({ query: '' })

    expect(result).toMatchObject({ _tag: 'error' })
    expect(fetchApi).not.toHaveBeenCalled()
  })

  it('registers every tool with one lifecycle signal', async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined)
    const modelContext: WebMcpModelContext = { registerTool }
    const controller = new AbortController()
    const tools = createWebMcpTools(deps(), controller.signal)

    const result = await registerWebMcpTools(modelContext, tools, controller)

    expect(result).toEqual({ _tag: 'registered', count: 4 })
    expect(registerTool).toHaveBeenCalledTimes(4)
    for (const call of registerTool.mock.calls)
      expect(call[1]).toEqual({ signal: controller.signal })
  })

  it('aborts partial registration and surfaces the failure', async () => {
    const failure = new DOMException('Tools blocked', 'NotAllowedError')
    const registerTool = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined)
    const controller = new AbortController()
    const tools = createWebMcpTools(deps(), controller.signal)

    const result = await registerWebMcpTools({ registerTool }, tools, controller)

    expect(result).toEqual({ _tag: 'error', cause: failure })
    expect(controller.signal.aborted).toBe(true)
  })
})
