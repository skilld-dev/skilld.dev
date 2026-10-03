import type { McpToolDeps, McpToolResult } from '../../layers/mcp/shared/mcp-tools'
import { collectionsV1, problemType, skillsV1 } from 'skilld-sdk/contract'
import { describe, expect, it, vi } from 'vitest'
import { installCommandFor, parseInstallRef } from '../../layers/mcp/shared/mcp-install-command'
import { mcpTools } from '../../layers/mcp/shared/mcp-tools'

function deps(fetchApi: McpToolDeps['fetchApi'] = vi.fn()): McpToolDeps {
  return { fetchApi, reportError: vi.fn() }
}

async function runTool(toolName: string, args: unknown, toolDeps = deps(), signal?: AbortSignal): Promise<McpToolResult> {
  const tool = mcpTools.find(candidate => candidate.name === toolName)
  if (!tool)
    throw new Error(`Missing tool: ${toolName}`)
  return tool.run(toolDeps, args, signal)
}

function problem(code: 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE', status: number): Response {
  return Response.json({
    type: problemType(code),
    title: code === 'NOT_FOUND' ? 'Not found' : 'Rate limited',
    status,
    detail: 'Private upstream information',
    instance: '/api/v1/skills/missing/missing/missing',
    code,
  }, { status })
}

describe('mCP public SDK discovery', () => {
  it('returns the search contract and forwards cancellation', async () => {
    const response = skillsV1.operations.search.docs.examples[0]!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response))
    const signal = new AbortController().signal

    const result = await runTool('search_skills', { query: 'tailwind', limit: 1 }, deps(fetchApi), signal)

    expect(result.structuredContent).toEqual(response)
    expect(JSON.parse(result.content[0]!.text)).toEqual(response)
    const [input, options] = fetchApi.mock.calls[0]!
    const url = new URL(input)
    expect(url.pathname).toBe('/api/v1/skills')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'tailwind', limit: '1' })
    expect(options.signal).toBe(signal)
  })

  it('returns the Skill contract with provenance and run handoff', async () => {
    const response = skillsV1.operations.get.docs.examples[0]!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response))
    const result = await runTool('get_skill', {
      owner: 'vercel-labs',
      repo: 'agent-skills',
      name: 'web-design-guidelines',
    }, deps(fetchApi))

    expect(result.structuredContent).toEqual(response)
    expect(fetchApi).toHaveBeenCalledWith(
      'https://skilld.dev/api/v1/skills/vercel-labs/agent-skills/web-design-guidelines',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('returns complete large Skills without losing provenance or commands', async () => {
    const response = {
      ...skillsV1.operations.get.docs.examples[0]!.response,
      markdown: '\n"\\'.repeat(20_000),
    }
    const toolDeps = deps(vi.fn().mockResolvedValue(Response.json(response)))
    const result = await runTool('get_skill', { owner: 'a', repo: 'b', name: 'c' }, toolDeps)
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toEqual(response)
    expect(JSON.parse(result.content[0]!.text)).toEqual(response)
    expect(toolDeps.reportError).not.toHaveBeenCalled()
  })

  it.each([
    ['INTERNAL_ERROR', 500],
    ['SERVICE_UNAVAILABLE', 503],
  ] as const)('reports and redacts upstream %s answers', async (code, status) => {
    const toolDeps = deps(vi.fn().mockResolvedValue(problem(code, status)))
    const result = await runTool('search_skills', { query: 'seo' }, toolDeps)
    expect(result.content[0]!.text).toBe('Search failed. Try again later.')
    expect(toolDeps.reportError).toHaveBeenCalledWith('Search', expect.objectContaining({ _tag: 'ApiFailure', code }))
    expect(toolDeps.reportError).toHaveBeenCalledOnce()
    expect(toolDeps.fetchApi).toHaveBeenCalledOnce()
  })

  it('uses server collection pagination and returns the collection contract', async () => {
    const response = collectionsV1.operations.get.docs.examples[0]!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response))
    const result = await runTool('get_collection', {
      login: 'harlan-zw',
      slug: 'design-engineering-essentials',
      limit: 10,
      offset: 20,
    }, deps(fetchApi))

    expect(result.structuredContent).toEqual(response)
    expect(fetchApi).toHaveBeenCalledWith(
      'https://skilld.dev/api/v1/collections/harlan-zw/design-engineering-essentials?limit=10&offset=20',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('bounds inputs before fetching', async () => {
    const toolDeps = deps()
    expect((await runTool('search_skills', { query: 'x'.repeat(201) }, toolDeps)).isError).toBe(true)
    expect((await runTool('search_skills', { query: 'seo', limit: 21 }, toolDeps)).isError).toBe(true)
    expect((await runTool('get_collection', { login: 'harlan-zw', slug: 'x', limit: 51 }, toolDeps)).isError).toBe(true)
    expect(toolDeps.fetchApi).not.toHaveBeenCalled()
  })

  it.each([
    ['get_skill', { owner: 'ghost', repo: 'nothing', name: 'missing' }, 'Skill not found: ghost/nothing/missing'],
    ['get_collection', { login: 'ghost', slug: 'nothing' }, 'Collection not found: @ghost/nothing'],
  ])('maps %s NOT_FOUND without logging infrastructure errors', async (name, args, message) => {
    const toolDeps = deps(vi.fn().mockResolvedValue(problem('NOT_FOUND', 404)))
    const result = await runTool(name, args, toolDeps)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain(message)
    expect(toolDeps.reportError).not.toHaveBeenCalled()
  })

  it('returns a rate limit without retrying or reporting an infrastructure failure', async () => {
    const toolDeps = deps(vi.fn().mockResolvedValue(problem('RATE_LIMITED', 429)))
    const result = await runTool('search_skills', { query: 'seo' }, toolDeps)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('Too many requests. Try again later.')
    expect(toolDeps.fetchApi).toHaveBeenCalledOnce()
    expect(toolDeps.reportError).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed answer', () => Promise.resolve(Response.json({ items: [], total: 'wrong' }))],
    ['network failure', () => Promise.reject(new Error('secret upstream detail'))],
  ])('reports and redacts %s', async (_name, fetchApi) => {
    const toolDeps = deps(vi.fn(fetchApi))
    const result = await runTool('search_skills', { query: 'seo' }, toolDeps)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('Search failed. Try again later.')
    expect(toolDeps.reportError).toHaveBeenCalledOnce()
  })

  it('returns cancellation without logging an infrastructure error', async () => {
    const toolDeps = deps(vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
    const controller = new AbortController()
    controller.abort()
    const result = await runTool('search_skills', { query: 'seo' }, toolDeps, controller.signal)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('Request cancelled.')
    expect(toolDeps.reportError).not.toHaveBeenCalled()
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
