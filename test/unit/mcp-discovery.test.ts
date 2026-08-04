// The discovery MCP server at /api/mcp is stateless Streamable HTTP: one
// JSON-RPC message in, one JSON body out. These tests drive the protocol
// core (handleMcpMessage) with an injected fetchApi, proving the transport
// semantics (initialize / tools/list / tools/call / notifications) and each
// tool's happy path + not-found path without a running server.

import type { McpToolDeps } from '../../layers/mcp/server/utils/mcp-tools'
import { describe, expect, it, vi } from 'vitest'
import { installCommandFor, parseInstallRef } from '../../layers/mcp/server/utils/mcp-install-command'
import { handleMcpMessage } from '../../layers/mcp/server/utils/mcp-rpc'

const noFetch: McpToolDeps = {
  fetchApi: () => {
    throw new Error('unexpected fetch')
  },
}

function deps(fetchApi: (path: string, opts?: { query?: Record<string, string | number> }) => unknown): McpToolDeps {
  return { fetchApi: fetchApi as McpToolDeps['fetchApi'] }
}

function request(method: string, params?: Record<string, unknown>, id: number = 1) {
  return { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
}

function callTool(toolName: string, args: Record<string, unknown>) {
  return request('tools/call', { name: toolName, arguments: args })
}

const notFound = Object.assign(new Error('Not Found'), { statusCode: 404 })

interface ToolResult {
  content: { type: string, text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

async function callResult(d: McpToolDeps, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  const res = await handleMcpMessage(d, callTool(toolName, args))
  expect(res?.error).toBeUndefined()
  return res!.result as unknown as ToolResult
}

describe('mcp protocol core', () => {
  it('initialize advertises tools capability and agent-neutral server info', async () => {
    const res = await handleMcpMessage(noFetch, request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    }))
    expect(res?.error).toBeUndefined()
    const result = res!.result as Record<string, any>
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.capabilities).toEqual({ tools: {} })
    expect(result.serverInfo.name).toBe('skilld-discovery')
    // Agent-neutral copy: no vendor agent named.
    expect(JSON.stringify(result)).not.toMatch(/claude|cursor|codex|copilot/i)
  })

  it('initialize falls back to the latest supported protocol version', async () => {
    const res = await handleMcpMessage(noFetch, request('initialize', { protocolVersion: '1999-01-01' }))
    expect((res!.result as Record<string, unknown>).protocolVersion).toBe('2025-06-18')
  })

  it('answers ping', async () => {
    const res = await handleMcpMessage(noFetch, request('ping'))
    expect(res).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
  })

  it('returns null for notifications (transport answers 202)', async () => {
    const res = await handleMcpMessage(noFetch, { jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(res).toBeNull()
  })

  it('rejects malformed messages and batches', async () => {
    const bad = await handleMcpMessage(noFetch, { method: 'tools/list' })
    expect(bad?.error?.code).toBe(-32600)
    const batch = await handleMcpMessage(noFetch, [request('ping')])
    expect(batch?.error?.code).toBe(-32600)
  })

  it('rejects unknown methods with -32601', async () => {
    const res = await handleMcpMessage(noFetch, request('resources/list'))
    expect(res?.error?.code).toBe(-32601)
  })

  it('tools/list exposes the four discovery tools with JSON Schema inputs', async () => {
    const res = await handleMcpMessage(noFetch, request('tools/list'))
    const tools = (res!.result as { tools: { name: string, description: string, inputSchema: Record<string, unknown> }[] }).tools
    expect(tools.map(t => t.name)).toEqual(['search_skills', 'get_skill', 'get_collection', 'install_command'])
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.inputSchema.type).toBe('object')
    }
  })

  it('rejects unknown tools with -32602', async () => {
    const res = await handleMcpMessage(noFetch, callTool('run_skill', {}))
    expect(res?.error?.code).toBe(-32602)
  })
})

describe('search_skills', () => {
  it('proxies the registry search API and returns ranked hits with install commands', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      total: 2,
      items: [
        { owner: 'nuxt', repo: 'nuxt', name: 'nuxt-seo', displayName: 'Nuxt SEO', description: 'SEO for Nuxt', installs: 120, stars: 999, trustTier: 'trusted', official: true, pushedAt: null, modifiedAt: null },
        { owner: 'acme', repo: 'skills', name: 'seo-audit', displayName: 'SEO Audit', description: null, installs: 3, stars: 4, trustTier: 'untrusted', official: false, pushedAt: null, modifiedAt: null },
      ],
    })
    const result = await callResult(deps(fetchApi), 'search_skills', { query: 'seo', limit: 5 })

    expect(fetchApi).toHaveBeenCalledWith('/api/skills', { query: { q: 'seo', limit: 5 } })
    expect(result.isError).toBeUndefined()
    const data = result.structuredContent as any
    expect(data.total).toBe(2)
    expect(data.results[0]).toMatchObject({
      owner: 'nuxt',
      repo: 'nuxt',
      name: 'nuxt-seo',
      official: true,
      url: 'https://skilld.dev/gh/nuxt/nuxt/nuxt-seo',
      installCommand: 'npx -y skilld add gh:nuxt/nuxt -s nuxt-seo',
    })
    // Text content mirrors structured content for clients that only read text.
    expect(result.content[0]!.text).toContain('nuxt-seo')
  })

  it('returns an in-band tool error for a missing query', async () => {
    const result = await callResult(noFetch, 'search_skills', {})
    expect(result.isError).toBe(true)
  })
})

describe('get_skill', () => {
  const detail = {
    owner: 'nuxt',
    repo: 'nuxt',
    name: 'nuxt-seo',
    displayName: 'Nuxt SEO',
    description: 'SEO for Nuxt',
    installs: 120,
    stars: 999,
    forks: 50,
    tier: 'official-org',
    githubUrl: 'https://github.com/nuxt/nuxt',
    pushedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2020-01-01T00:00:00.000Z',
    maturity: { ageDays: 2000, sinceUpdateDays: 3, cadence: 'active' },
    trust: { tier: 'trusted', score: 90, reasons: ['official repo'] },
    provenance: {
      owner: 'nuxt',
      repo: 'nuxt',
      branch: 'main',
      skillPath: 'skills/nuxt-seo/SKILL.md',
      sourceCommitSha: 'abc123',
      sourceCommitUrl: 'https://github.com/nuxt/nuxt/commit/abc123',
      skillFileUrl: 'https://github.com/nuxt/nuxt/blob/abc123/skills/nuxt-seo/SKILL.md',
      historyUrl: 'https://github.com/nuxt/nuxt/commits/main/skills/nuxt-seo/SKILL.md',
      modifiedAt: 1754179200,
      lastSyncedAt: 1754265600,
      syncStatus: 'ok',
    },
  }

  it('returns detail with provenance (author, source URLs, freshness)', async () => {
    const fetchApi = vi.fn().mockResolvedValue(detail)
    const result = await callResult(deps(fetchApi), 'get_skill', { owner: 'nuxt', repo: 'nuxt', name: 'nuxt-seo' })

    expect(fetchApi).toHaveBeenCalledWith('/api/skills/nuxt/nuxt/nuxt-seo')
    const data = result.structuredContent as any
    expect(data.installCommand).toBe('npx -y skilld add gh:nuxt/nuxt -s nuxt-seo')
    expect(data.provenance).toMatchObject({
      author: 'nuxt',
      sourceRepoUrl: 'https://github.com/nuxt/nuxt',
      skillFileUrl: detail.provenance.skillFileUrl,
      sourceCommitUrl: detail.provenance.sourceCommitUrl,
      branch: 'main',
    })
    expect(data.provenance.freshness).toMatchObject({
      repoPushedAt: '2026-08-01T00:00:00.000Z',
      cadence: 'active',
    })
    expect(data.provenance.freshness.contentModifiedAt).toBe(new Date(1754179200 * 1000).toISOString())
  })

  it('maps a 404 to an in-band not-found tool error', async () => {
    const fetchApi = vi.fn().mockRejectedValue(notFound)
    const result = await callResult(deps(fetchApi), 'get_skill', { owner: 'nope', repo: 'nope', name: 'nope' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('Skill not found: nope/nope/nope')
  })
})

describe('get_collection', () => {
  it('returns the collection with skills and install commands', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      authorLogin: 'harlan-zw',
      slug: 'nuxt-stack',
      name: 'Nuxt Stack',
      preamble: 'The stack I use.',
      featured: true,
      createdAt: 1754000000,
      updatedAt: 1754265600,
      skills: [
        { position: 1, owner: 'nuxt', repo: 'nuxt', name: 'nuxt-seo', displayName: 'Nuxt SEO', reason: 'Canonical SEO setup' },
        { position: 2, owner: 'acme', repo: 'skills', name: null, displayName: null, reason: null },
      ],
    })
    const result = await callResult(deps(fetchApi), 'get_collection', { login: 'harlan-zw', slug: 'nuxt-stack' })

    expect(fetchApi).toHaveBeenCalledWith('/api/collections/by-author/harlan-zw/nuxt-stack')
    const data = result.structuredContent as any
    expect(data).toMatchObject({
      author: 'harlan-zw',
      slug: 'nuxt-stack',
      url: 'https://skilld.dev/@harlan-zw/nuxt-stack',
      installCommand: 'npx -y skilld add @harlan-zw/nuxt-stack',
    })
    expect(data.skills).toHaveLength(2)
    expect(data.skills[0]).toMatchObject({
      owner: 'nuxt',
      reason: 'Canonical SEO setup',
      installCommand: 'npx -y skilld add gh:nuxt/nuxt -s nuxt-seo',
    })
    // Repo-level entry (no pinned skill name) installs the whole repo.
    expect(data.skills[1].installCommand).toBe('npx -y skilld add gh:acme/skills')
  })

  it('maps a 404 to an in-band not-found tool error', async () => {
    const fetchApi = vi.fn().mockRejectedValue(notFound)
    const result = await callResult(deps(fetchApi), 'get_collection', { login: 'ghost', slug: 'nothing' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('@ghost/nothing')
  })
})

describe('install_command', () => {
  it.each([
    ['gh:nuxt/nuxt', 'npx -y skilld add gh:nuxt/nuxt'],
    ['nuxt/nuxt', 'npx -y skilld add gh:nuxt/nuxt'],
    ['anthropics/skills/skill-creator', 'npx -y skilld add gh:anthropics/skills -s skill-creator'],
    ['gh:anthropics/skills/skill-creator', 'npx -y skilld add gh:anthropics/skills -s skill-creator'],
    ['@harlan-zw', 'npx -y skilld add @harlan-zw'],
    ['@harlan-zw/nuxt-stack', 'npx -y skilld add @harlan-zw/nuxt-stack'],
    ['npm:vue', 'npx -y skilld add npm:vue'],
  ])('%s -> %s', async (ref, command) => {
    const result = await callResult(noFetch, 'install_command', { ref })
    expect(result.isError).toBeUndefined()
    expect((result.structuredContent as any).command).toBe(command)
  })

  it('rejects unrecognized refs with an in-band error listing accepted forms', async () => {
    const result = await callResult(noFetch, 'install_command', { ref: 'not a ref!!' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('Accepted forms')
  })
})

describe('parseInstallRef', () => {
  it('round-trips every ref kind through installCommandFor', () => {
    expect(installCommandFor(parseInstallRef('a/b')!)).toBe('npx -y skilld add gh:a/b')
    expect(installCommandFor(parseInstallRef('npm:@scope/pkg')!)).toBe('npx -y skilld add npm:@scope/pkg')
    expect(parseInstallRef('a/b/c/d')).toBeNull()
    expect(parseInstallRef('@')).toBeNull()
    expect(parseInstallRef('')).toBeNull()
  })
})
