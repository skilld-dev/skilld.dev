import type { McpToolDeps, McpToolResult } from '../../layers/mcp/shared/mcp-tools'
import { describe, expect, it, vi } from 'vitest'
import { installCommandFor, parseInstallRef } from '../../layers/mcp/shared/mcp-install-command'
import { mcpTools } from '../../layers/mcp/shared/mcp-tools'

const unexpectedFetch = vi.fn(() => {
  throw new Error('unexpected fetch')
})

function deps(fetchApi: McpToolDeps['fetchApi'] = unexpectedFetch): McpToolDeps {
  return {
    fetchApi,
    reportError: vi.fn(),
  }
}

async function runTool(toolName: string, args: unknown, toolDeps = deps()): Promise<McpToolResult> {
  const tool = mcpTools.find(candidate => candidate.name === toolName)
  if (!tool)
    throw new Error(`Missing tool: ${toolName}`)
  return await tool.run(toolDeps, args)
}

const notFound = Object.assign(new Error('Not Found'), { statusCode: 404 })

describe('mcp toolkit definitions', () => {
  it('exposes four bounded, read-only discovery tools', () => {
    expect(mcpTools.map(tool => tool.name)).toEqual([
      'search_skills',
      'get_skill',
      'get_collection',
      'install_command',
    ])

    for (const tool of mcpTools) {
      expect(tool.description?.length).toBeGreaterThan(20)
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      })
    }
    expect(JSON.stringify(mcpTools.map(tool => tool.description))).not.toMatch(/claude|cursor|codex|copilot/i)
  })

  it('passes the MCP cancellation signal into API calls', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ total: 0, items: [] })
    const search = mcpTools[0]!
    const signal = new AbortController().signal

    await search.run(deps(fetchApi), { query: 'seo', limit: 1 }, signal)

    expect(fetchApi).toHaveBeenCalledWith('/api/skills', {
      query: { q: 'seo', limit: 1 },
      signal,
    })
  })
})

describe('search_skills', () => {
  it('returns ranked results with bounded descriptions and install commands', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      total: 2,
      items: [
        {
          owner: 'nuxt',
          repo: 'nuxt',
          name: 'nuxt-seo',
          displayName: 'Nuxt SEO',
          description: 'x'.repeat(700),
          installs: 120,
          stars: 999,
          trustTier: 'trusted',
          official: true,
          registryPath: '/gh/nuxt/nuxt',
        },
      ],
    })
    const result = await runTool('search_skills', { query: 'seo', limit: 5 }, deps(fetchApi))
    const data = result.structuredContent as any

    expect(fetchApi).toHaveBeenCalledWith('/api/skills', {
      query: { q: 'seo', limit: 5 },
      signal: undefined,
    })
    expect(data.results[0]).toMatchObject({
      owner: 'nuxt',
      repo: 'nuxt',
      name: 'nuxt-seo',
      official: true,
      url: 'https://skilld.dev/gh/nuxt/nuxt',
      installCommand: 'npx skilld install nuxt/nuxt/nuxt-seo',
    })
    expect(data.results[0].description.length).toBe(500)
  })

  it('bounds search input', async () => {
    expect((await runTool('search_skills', { query: 'x'.repeat(201) })).isError).toBe(true)
    expect((await runTool('search_skills', { query: 'seo', limit: 21 })).isError).toBe(true)
  })

  it('redacts infrastructure errors and reports them', async () => {
    const toolDeps = deps(vi.fn().mockRejectedValue(new Error('secret upstream detail')))
    const result = await runTool('search_skills', { query: 'seo' }, toolDeps)

    expect(result).toMatchObject({ isError: true })
    expect(result.content[0]!.text).toBe('Search failed. Try again later.')
    expect(result.content[0]!.text).not.toContain('secret upstream detail')
    expect(toolDeps.reportError).toHaveBeenCalledOnce()
  })
})

describe('get_skill', () => {
  const detail = {
    owner: 'nuxt',
    repo: 'nuxt',
    name: 'nuxt-seo',
    registryPath: '/gh/nuxt/nuxt',
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

  it('returns provenance, freshness, and an install command', async () => {
    const fetchApi = vi.fn().mockResolvedValue(detail)
    const result = await runTool('get_skill', {
      owner: 'nuxt',
      repo: 'nuxt',
      name: 'nuxt-seo',
    }, deps(fetchApi))
    const data = result.structuredContent as any

    expect(fetchApi).toHaveBeenCalledWith('/api/skills/nuxt/nuxt/nuxt-seo', { signal: undefined })
    expect(data.runCommand).toBe('npx skilld run nuxt/nuxt/nuxt-seo')
    expect(data.installCommand).toBe('npx skilld install nuxt/nuxt/nuxt-seo')
    expect(data.provenance).toMatchObject({
      author: 'nuxt',
      sourceRepoUrl: 'https://github.com/nuxt/nuxt',
      sourceCommitUrl: detail.provenance.sourceCommitUrl,
      branch: 'main',
      freshness: {
        repoPushedAt: '2026-08-01T00:00:00.000Z',
        cadence: 'active',
      },
    })
  })

  it('maps not found without logging infrastructure errors', async () => {
    const toolDeps = deps(vi.fn().mockRejectedValue(notFound))
    const result = await runTool('get_skill', { owner: 'nope', repo: 'nope', name: 'nope' }, toolDeps)

    expect(result).toMatchObject({ isError: true })
    expect(result.content[0]!.text).toContain('Skill not found: nope/nope/nope')
    expect(toolDeps.reportError).not.toHaveBeenCalled()
  })
})

describe('get_collection', () => {
  it('paginates skills and bounds curator prose', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      authorLogin: 'harlan-zw',
      slug: 'nuxt-stack',
      name: 'Nuxt Stack',
      preamble: 'p'.repeat(2500),
      featured: true,
      createdAt: 1754000000,
      updatedAt: 1754265600,
      skills: Array.from({ length: 30 }, (_, index) => ({
        position: index + 1,
        owner: 'nuxt',
        repo: 'nuxt',
        name: `skill-${index + 1}`,
        registryPath: `/gh/nuxt/nuxt/skill-${index + 1}`,
        displayName: `Skill ${index + 1}`,
        reason: 'r'.repeat(1200),
      })),
    })
    const result = await runTool('get_collection', {
      login: 'harlan-zw',
      slug: 'nuxt-stack',
      limit: 10,
      offset: 10,
    }, deps(fetchApi))
    const data = result.structuredContent as any

    expect(data).toMatchObject({
      author: 'harlan-zw',
      totalSkills: 30,
      offset: 10,
      limit: 10,
      hasMore: true,
      installCommand: 'npx skilld add @harlan-zw/nuxt-stack',
    })
    expect(data.preamble.length).toBe(2000)
    expect(data.skills).toHaveLength(10)
    expect(data.skills[0].position).toBe(11)
    expect(data.skills[0].reason.length).toBe(1000)
  })

  it('maps a missing collection to an in-band error', async () => {
    const result = await runTool('get_collection', {
      login: 'ghost',
      slug: 'nothing',
    }, deps(vi.fn().mockRejectedValue(notFound)))

    expect(result).toMatchObject({ isError: true })
    expect(result.content[0]!.text).toContain('@ghost/nothing')
  })
})

describe('install_command', () => {
  it.each([
    ['gh:nuxt/nuxt', 'npx skilld add nuxt/nuxt'],
    ['nuxt/nuxt', 'npx skilld add nuxt/nuxt'],
    ['anthropics/skills/skill-creator', 'npx skilld install anthropics/skills/skill-creator'],
    ['skilld:anthropics/skills/skill-creator', 'npx skilld install anthropics/skills/skill-creator'],
    ['gh:anthropics/skills/skill-creator', 'npx skilld install anthropics/skills/skill-creator'],
    ['@harlan-zw', 'npx skilld add @harlan-zw'],
    ['@harlan-zw/nuxt-stack', 'npx skilld add @harlan-zw/nuxt-stack'],
  ])('%s -> %s', async (ref, command) => {
    const result = await runTool('install_command', { ref })
    expect((result.structuredContent as any).command).toBe(command)
  })

  it('offers the run command for a skill ref', async () => {
    const result = await runTool('install_command', { ref: 'anthropics/skills/skill-creator' })
    expect((result.structuredContent as any).runCommand).toBe('npx skilld run anthropics/skills/skill-creator')
  })

  it('has no run command for a ref that names more than one skill', async () => {
    const result = await runTool('install_command', { ref: 'gh:nuxt/nuxt' })
    expect((result.structuredContent as any).runCommand).toBeNull()
  })

  it('keeps skilld run out of the note when the ref has no run command', async () => {
    const multi = await runTool('install_command', { ref: 'gh:nuxt/nuxt' })
    expect((multi.structuredContent as any).note).not.toContain('skilld run')

    const single = await runTool('install_command', { ref: 'anthropics/skills/skill-creator' })
    expect((single.structuredContent as any).note).toContain('skilld run')
  })

  it('rejects unrecognized refs', async () => {
    const result = await runTool('install_command', { ref: 'not a ref!!' })
    expect(result).toMatchObject({ isError: true })
    expect(result.content[0]!.text).toContain('Accepted forms')
  })
})

describe('parseInstallRef', () => {
  it('round-trips every ref kind through installCommandFor', () => {
    expect(installCommandFor(parseInstallRef('a/b')!)).toBe('npx skilld add a/b')
    expect(parseInstallRef('a/b/c/d')).toBeNull()
    expect(parseInstallRef('@')).toBeNull()
    expect(parseInstallRef('')).toBeNull()
  })

  it('rejects an npm ref, because the v3 CLI installs no npm package', () => {
    expect(parseInstallRef('npm:@scope/pkg')).toBeNull()
    expect(parseInstallRef('npm:vue')).toBeNull()
  })
})
