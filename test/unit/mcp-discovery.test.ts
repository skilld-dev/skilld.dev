import type { McpToolDeps, McpToolResult } from '../../layers/mcp/shared/mcp-tools'
import { indexRequestsV1, problemType, repositoriesV1, skillsV1, tracksV1, trendingV1 } from 'skilld-sdk/contract'
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

function problem(code: 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE' | 'INVALID_REQUEST', status: number): Response {
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

    const linked = {
      ...response,
      items: response.items.map(item => ({
        ...item,
        pageUrl: `https://skilld.dev/gh/${item.source.owner}/${item.source.repository}/${item.source.selector.name}`,
        runCommand: `npx skilld run ${item.source.owner}/${item.source.repository}/${item.source.selector.name}`,
      })),
    }
    expect(result.structuredContent).toEqual(linked)
    expect(JSON.parse(result.content[0]!.text)).toEqual(linked)
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

  it('bounds inputs before fetching', async () => {
    const toolDeps = deps()
    expect((await runTool('search_skills', { query: 'x'.repeat(201) }, toolDeps)).isError).toBe(true)
    expect((await runTool('search_skills', { query: 'seo', limit: 21 }, toolDeps)).isError).toBe(true)
    expect(toolDeps.fetchApi).not.toHaveBeenCalled()
  })

  it('maps get_skill NOT_FOUND without logging infrastructure errors', async () => {
    const toolDeps = deps(vi.fn().mockResolvedValue(problem('NOT_FOUND', 404)))
    const result = await runTool('get_skill', { owner: 'ghost', repo: 'nothing', name: 'missing' }, toolDeps)
    const message = 'Skill not found: ghost/nothing/missing'
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

describe('browse tools', () => {
  it('lists tracks with the track contract', async () => {
    const response = tracksV1.operations.list.docs.examples[0]!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response))
    const result = await runTool('list_tracks', {}, deps(fetchApi))
    expect(result.structuredContent).toEqual(response)
    expect(new URL(fetchApi.mock.calls[0]![0]).pathname).toBe('/api/v1/tracks')
  })

  it('reads one track with bounded pagination', async () => {
    const response = tracksV1.operations.get.docs.examples[0]!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response))
    const result = await runTool('get_track', { slug: 'design' }, deps(fetchApi))
    expect(result.structuredContent).toEqual(response)
    expect(fetchApi).toHaveBeenCalledWith(
      'https://skilld.dev/api/v1/tracks/design?limit=10&offset=0',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('reads the trending board for a window', async () => {
    const response = trendingV1.operations.list.docs.examples[0]!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response))
    const result = await runTool('list_trending', { window: 'month', limit: 5 }, deps(fetchApi))
    expect(result.structuredContent).toEqual(response)
    const url = new URL(fetchApi.mock.calls[0]![0])
    expect(url.pathname).toBe('/api/v1/trending')
    expect(Object.fromEntries(url.searchParams)).toEqual({ window: 'month', limit: '5' })
  })

  it('reads a repository and bounds its Skills', async () => {
    const example = repositoriesV1.operations.get.docs.examples[0]!.response
    const skills = Array.from({ length: 3 }, (_, index) => ({ ...example.skills[0]!, name: `skill-${index}` }))
    const fetchApi = vi.fn().mockResolvedValue(Response.json({ ...example, skills }))
    const result = await runTool('get_repository', { owner: 'vercel-labs', repo: 'agent-skills', limit: 2 }, deps(fetchApi))
    expect(result.structuredContent).toEqual({ ...example, skills: skills.slice(0, 2), total: 3 })
    expect(fetchApi).toHaveBeenCalledWith(
      'https://skilld.dev/api/v1/repositories/vercel-labs/agent-skills',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('bounds browse inputs before fetching', async () => {
    const toolDeps = deps()
    expect((await runTool('list_trending', { window: 'year' }, toolDeps)).isError).toBe(true)
    expect((await runTool('list_trending', { limit: 21 }, toolDeps)).isError).toBe(true)
    expect((await runTool('get_track', { slug: 'Not A Slug' }, toolDeps)).isError).toBe(true)
    expect((await runTool('get_track', { slug: 'design', limit: 26 }, toolDeps)).isError).toBe(true)
    expect((await runTool('get_repository', { owner: 'a', repo: 'b', limit: 31 }, toolDeps)).isError).toBe(true)
    expect(toolDeps.fetchApi).not.toHaveBeenCalled()
  })

  it.each([
    ['get_track', { slug: 'nothing' }, 'Track not found: nothing'],
    ['get_repository', { owner: 'ghost', repo: 'nothing' }, 'Repository not found: ghost/nothing'],
  ])('maps %s NOT_FOUND without logging infrastructure errors', async (name, args, message) => {
    const toolDeps = deps(vi.fn().mockResolvedValue(problem('NOT_FOUND', 404)))
    const result = await runTool(name, args, toolDeps)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe(message)
    expect(toolDeps.reportError).not.toHaveBeenCalled()
  })
})

describe('submit_repository', () => {
  const [queuedExample, indexedExample] = indexRequestsV1.operations.create.docs.examples

  it('returns the indexed Skills with the Repository page', async () => {
    const response = indexedExample!.response
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response, { status: 201 }))
    const result = await runTool('submit_repository', { repository: 'vercel-labs/agent-skills' }, deps(fetchApi))
    expect(result.structuredContent).toEqual({
      ...response,
      total: (response as { skills: unknown[] }).skills.length,
      pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills',
    })
    const [input, options] = fetchApi.mock.calls[0]!
    expect(new URL(input).pathname).toBe('/api/v1/index-requests')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ repository: 'vercel-labs/agent-skills' })
  })

  it('returns a status URL for a queued request', async () => {
    const response = queuedExample!.response as { id: string }
    const fetchApi = vi.fn().mockResolvedValue(Response.json(response, { status: 201 }))
    const result = await runTool('submit_repository', { repository: 'https://github.com/vercel-labs/agent-skills' }, deps(fetchApi))
    expect(result.structuredContent).toEqual({
      ...response,
      pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills',
      statusUrl: `https://skilld.dev/api/v1/index-requests/${response.id}`,
    })
  })

  it('explains a Repository the API cannot index', async () => {
    const toolDeps = deps(vi.fn().mockResolvedValue(problem('INVALID_REQUEST', 400)))
    const result = await runTool('submit_repository', { repository: 'https://gitlab.com/a/b' }, toolDeps)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('Cannot index https://gitlab.com/a/b. Send owner/repo or the URL of a public GitHub repository.')
    expect(toolDeps.reportError).not.toHaveBeenCalled()
  })

  it('rejects text that names no Repository before fetching', async () => {
    const toolDeps = deps()
    expect((await runTool('submit_repository', { repository: 'not a repository' }, toolDeps)).isError).toBe(true)
    expect(toolDeps.fetchApi).not.toHaveBeenCalled()
  })
})

describe('install_command', () => {
  it.each([
    ['gh:nuxt/nuxt', 'npx skilld add nuxt/nuxt --all'],
    ['nuxt/nuxt', 'npx skilld add nuxt/nuxt --all'],
    ['anthropics/skills/skill-creator', 'npx skilld install anthropics/skills/skill-creator'],
    ['skilld:anthropics/skills/skill-creator', 'npx skilld install anthropics/skills/skill-creator'],
    ['gh:anthropics/skills/skill-creator', 'npx skilld install anthropics/skills/skill-creator'],
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

  it.each(['@harlan-zw', '@harlan-zw/agent-building-stack'])('rejects the curator or collection ref %s', async (ref) => {
    const result = await runTool('install_command', { ref })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe(`Unrecognized ref: "${ref}". Accepted forms: "owner/repo", "owner/repo/skill-name".`)
  })

  it('rejects unrecognized refs', async () => {
    const result = await runTool('install_command', { ref: 'not a ref!!' })
    expect(result).toMatchObject({ isError: true })
    expect(result.content[0]!.text).toContain('Accepted forms')
  })
})

describe('parseInstallRef', () => {
  it('round-trips every ref kind through installCommandFor', () => {
    expect(installCommandFor(parseInstallRef('a/b')!)).toBe('npx skilld add a/b --all')
    expect(parseInstallRef('a/b/c/d')).toBeNull()
    expect(parseInstallRef('@')).toBeNull()
    expect(parseInstallRef('@harlan-zw')).toBeNull()
    expect(parseInstallRef('@harlan-zw/agent-building-stack')).toBeNull()
    expect(parseInstallRef('')).toBeNull()
  })

  it('rejects an npm ref, because the v3 CLI installs no npm package', () => {
    expect(parseInstallRef('npm:@scope/pkg')).toBeNull()
    expect(parseInstallRef('npm:vue')).toBeNull()
  })
})
