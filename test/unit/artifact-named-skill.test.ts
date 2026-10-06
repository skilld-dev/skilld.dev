import { describe, expect, it, vi } from 'vitest'
import { createPublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const rootTreeSha = '89abcdef0123456789abcdef0123456789abcdef'
const blobSha = '3333333333333333333333333333333333333333'

describe('named Skill resolution', () => {
  it('finds a named Skill in a Repository with more entries than one Skill may hold', async () => {
    // garrytan/gstack has 3,398 tree entries and one design-html Skill.
    const filler = Array.from({ length: 2_500 }, (_, index) => blob(`docs/page-${index}.md`))
    const result = await resolveNamed('demo', [...filler, blob('skills/demo/SKILL.md')])

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: 'skills/demo' } })
  })

  it('picks the visible copy when Agent folders mirror the Skill', async () => {
    // pbakaus/impeccable ships the same Skill in 20 Agent folders.
    const result = await resolveNamed('demo', [
      blob('.claude/skills/demo/SKILL.md'),
      blob('.cursor/skills/demo/SKILL.md'),
      blob('plugins/bundle/skills/demo/SKILL.md'),
      blob('skills/demo/SKILL.md'),
    ])

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: 'skills/demo' } })
  })

  it('picks the root Skill over a plugin mirror of it', async () => {
    // zarazhangrui/frontend-slides keeps one copy at the root and one under plugins/.
    const result = await resolveNamed('skills', [
      blob('SKILL.md'),
      blob('plugins/skills/skills/skills/SKILL.md'),
    ])

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: '.' } })
  })

  it('picks the same copy whatever order the tree lists them in', async () => {
    const copies = [
      blob('.cursor/skills/demo/SKILL.md'),
      blob('cursor-plugin/skills/demo/SKILL.md'),
      blob('plugin/skills/demo/SKILL.md'),
    ]
    const forward = await resolveNamed('demo', copies)
    const backward = await resolveNamed('demo', [...copies].reverse())

    expect(forward).toMatchObject({ _tag: 'resolved', source: { skillPath: 'cursor-plugin/skills/demo' } })
    expect(backward).toMatchObject({ _tag: 'resolved', source: { skillPath: 'cursor-plugin/skills/demo' } })
  })

  it('picks a hidden copy when every copy is hidden', async () => {
    const result = await resolveNamed('demo', [
      blob('.cursor/skills/demo/SKILL.md'),
      blob('.claude/skills/demo/SKILL.md'),
    ])

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: '.claude/skills/demo' } })
  })

  // The registry names a Skill by its folder name made into a slug. Each case
  // is a registry Skill the 2026-10-07 sweep could not find by that name.
  it.each([
    ['emailandpassword', 'better-auth/emailAndPassword'],
    ['071-dotnet-legacy-api-controllers', 'skills/07.1-dotnet-legacy-api-controllers'],
    ['skill-development', '.agents/skills/Skill Development'],
    ['ib0dte', '.claude/skills/ib_0dte'],
  ])('finds the registry name %s in the folder %s', async (name, folder) => {
    const result = await resolveNamed(name, [blob(`${folder}/SKILL.md`)])

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: folder } })
  })

  it('finds a root Skill by the registry name of a mixed-case Repository', async () => {
    const result = await resolveNamed('agent-skills', [blob('SKILL.md')], false, 'Agent-Skills')

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: '.' } })
  })

  it('asks for a path when GitHub cannot list the whole Repository', async () => {
    const result = await resolveNamed('demo', [blob('skills/demo/SKILL.md')], true)

    expect(result).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The Repository is too large to find a Skill by name. Name the Skill by its path.',
    })
  })
})

async function resolveNamed(name: string, entries: object[], truncated = false, repositoryName = 'skills') {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/repos/skilld-dev/skills'))
      return json({ id: 123, name: repositoryName, owner: { login: 'skilld-dev' }, private: false, default_branch: 'main' })
    if (url.endsWith('/git/ref/heads/main'))
      return json({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } })
    if (url.endsWith(`/commits/${commitSha}`))
      return json({ sha: commitSha, commit: { tree: { sha: rootTreeSha } } })
    if (url.endsWith(`/git/trees/${rootTreeSha}?recursive=1`))
      return json({ sha: rootTreeSha, tree: entries, truncated })
    return json({}, 404)
  })
  const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })
  return await client.resolve({
    provider: 'github',
    owner: 'skilld-dev',
    repository: 'skills',
    selector: { type: 'named-skill', name },
  })
}

function blob(path: string) {
  return { path, mode: '100644', type: 'blob', sha: blobSha, size: 10 }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
