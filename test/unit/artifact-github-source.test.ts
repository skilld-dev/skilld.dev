import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const rootTreeSha = '89abcdef0123456789abcdef0123456789abcdef'
const skillsTreeSha = '1111111111111111111111111111111111111111'
const skillTreeSha = '2222222222222222222222222222222222222222'
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'
const skillBlobSha = gitBlobSha(skillText)

describe('public GitHub Artifact source', () => {
  it('pins a reference once and loads the exact tree and blob identities', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills')) {
        return json({
          id: 123,
          name: 'skills',
          owner: { login: 'skilld-dev' },
          private: false,
          default_branch: 'main',
        })
      }
      if (url.endsWith(`/commits/${commitSha}`))
        return json({ sha: commitSha, commit: { tree: { sha: rootTreeSha } } })
      if (url.endsWith(`/git/trees/${rootTreeSha}`))
        return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
      if (url.endsWith(`/git/trees/${skillsTreeSha}`))
        return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
      if (url.endsWith(`/git/trees/${skillTreeSha}?recursive=1`)) {
        return json({
          sha: skillTreeSha,
          tree: [blob('SKILL.md', skillBlobSha, skillText.length)],
          truncated: false,
        })
      }
      if (url.endsWith(`/git/blobs/${skillBlobSha}`)) {
        return json({
          sha: skillBlobSha,
          size: skillText.length,
          encoding: 'base64',
          content: btoa(skillText),
        })
      }
      return json({}, 404)
    })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const resolution = await client.resolve({
      provider: 'github',
      owner: 'skilld-dev',
      repository: 'skills',
      selector: { type: 'path', path: 'skills/demo' },
      ref: { type: 'commit', value: commitSha },
    })
    expect(resolution._tag).toBe('resolved')
    if (resolution._tag !== 'resolved')
      return
    const loaded = await client.load(resolution.source)

    expect(loaded._tag).toBe('loaded')
    expect(resolution.source).toMatchObject({ commitSha, treeSha: rootTreeSha })
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toContain(
      `https://api.github.com/repos/skilld-dev/skills/git/blobs/${skillBlobSha}`,
    )
  })

  it('rejects a commit lookup that returns another identity', async () => {
    const changedCommitSha = '9999999999999999999999999999999999999999'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills'))
        return json(publicRepository())
      if (url.endsWith(`/commits/${commitSha}`))
        return json({ sha: changedCommitSha, commit: { tree: { sha: rootTreeSha } } })
      return json({}, 404)
    })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.resolve({
      provider: 'github',
      owner: 'skilld-dev',
      repository: 'skills',
      selector: { type: 'path', path: 'skills/demo' },
      ref: { type: 'commit', value: commitSha },
    })

    expect(result).toMatchObject({ _tag: 'rejected', code: 'INVALID_SOURCE' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      name: 'symbolic link',
      unsafe: { path: 'references/latest', mode: '120000', type: 'blob', sha: '3'.repeat(40), size: 4 },
    },
    {
      name: 'Git submodule',
      unsafe: { path: 'references/vendor', mode: '160000', type: 'commit', sha: '4'.repeat(40) },
    },
  ])('rejects a $name before reading blobs', async ({ unsafe }) => {
    const fetchMock = sourceTreeFetch([blob('SKILL.md', skillBlobSha, skillText.length), unsafe])
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource())

    expect(result).toMatchObject({ _tag: 'rejected', code: 'INVALID_SOURCE' })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/git/blobs/'))).toBe(false)
  })

  it('rejects a Repository that became private before blob ingestion', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills')) {
        return json({
          id: 123,
          name: 'skills',
          owner: { login: 'skilld-dev' },
          private: true,
          default_branch: 'main',
        })
      }
      return json({}, 404)
    })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch, token: 'private-token' })

    const result = await client.load(resolvedSource())

    expect(result).toMatchObject({ _tag: 'rejected', code: 'SOURCE_ACCESS_DENIED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects paths that collide after case folding', async () => {
    const fetchMock = sourceTreeFetch([
      blob('SKILL.md', skillBlobSha, skillText.length),
      blob('references/Guide.md', '5'.repeat(40), 1),
      blob('references/guide.md', '6'.repeat(40), 1),
    ])
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource())

    expect(result).toMatchObject({
      _tag: 'rejected',
      findings: expect.arrayContaining([
        'references/Guide.md collides with references/guide.md',
      ]),
    })
  })

  it('walks an exact tree when GitHub truncates the recursive response', async () => {
    const nestedTreeSha = '7777777777777777777777777777777777777777'
    const guideText = 'guide'
    const guideBlobSha = gitBlobSha(guideText)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/skilld-dev/skills'))
        return json(publicRepository())
      if (url.endsWith(`/git/trees/${rootTreeSha}`))
        return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
      if (url.endsWith(`/git/trees/${skillsTreeSha}`))
        return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
      if (url.endsWith(`/git/trees/${skillTreeSha}?recursive=1`)) {
        return json({
          sha: skillTreeSha,
          tree: [blob('SKILL.md', skillBlobSha, skillText.length)],
          truncated: true,
        })
      }
      if (url.endsWith(`/git/trees/${skillTreeSha}`)) {
        return json({
          sha: skillTreeSha,
          tree: [
            blob('SKILL.md', skillBlobSha, skillText.length),
            tree('references', nestedTreeSha),
          ],
          truncated: false,
        })
      }
      if (url.endsWith(`/git/trees/${nestedTreeSha}`)) {
        return json({
          sha: nestedTreeSha,
          tree: [blob('guide.md', guideBlobSha, guideText.length)],
          truncated: false,
        })
      }
      if (url.endsWith(`/git/blobs/${skillBlobSha}`))
        return json(blobResponse(skillText, skillBlobSha))
      if (url.endsWith(`/git/blobs/${guideBlobSha}`))
        return json(blobResponse(guideText, guideBlobSha))
      return json({}, 404)
    })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource())

    expect(result._tag).toBe('loaded')
    if (result._tag === 'loaded')
      expect(result.value.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md'])
  })

  it('rejects a tree that remains truncated during the bounded walk', async () => {
    const fetchMock = sourceTreeFetch(
      [blob('SKILL.md', skillBlobSha, skillText.length)],
      undefined,
      true,
    )
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource())

    expect(result).toMatchObject({ _tag: 'rejected', code: 'INVALID_SOURCE' })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/git/blobs/'))).toBe(false)
  })

  it('rejects bytes that do not match the commit blob digest', async () => {
    const changed = skillText.replace('demo work', 'other use')
    const fetchMock = sourceTreeFetch(
      [blob('SKILL.md', skillBlobSha, changed.length)],
      { sha: skillBlobSha, size: changed.length, encoding: 'base64', content: btoa(changed) },
    )
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource())

    expect(result).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      findings: ['SKILL.md'],
    })
  })
})

function sourceTreeFetch(entries: object[], blobResult?: object, truncatedWalk = false) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/repos/skilld-dev/skills'))
      return json(publicRepository())
    if (url.endsWith(`/git/trees/${rootTreeSha}`))
      return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
    if (url.endsWith(`/git/trees/${skillsTreeSha}`))
      return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
    if (url.endsWith(`/git/trees/${skillTreeSha}?recursive=1`))
      return json({ sha: skillTreeSha, tree: entries, truncated: truncatedWalk })
    if (url.endsWith(`/git/trees/${skillTreeSha}`) && truncatedWalk)
      return json({ sha: skillTreeSha, tree: entries, truncated: true })
    if (url.includes('/git/blobs/') && blobResult)
      return json(blobResult)
    return json({}, 404)
  })
}

function resolvedSource() {
  return {
    provider: 'github' as const,
    repositoryId: 123,
    owner: 'skilld-dev',
    repository: 'skills',
    visibility: 'public' as const,
    commitSha,
    treeSha: rootTreeSha,
    skillPath: 'skills/demo',
  }
}

function tree(path: string, sha: string) {
  return { path, mode: '040000', type: 'tree', sha }
}

function blob(path: string, sha: string, size: number) {
  return { path, mode: '100644', type: 'blob', sha, size }
}

function blobResponse(value: string, sha: string) {
  return { sha, size: value.length, encoding: 'base64', content: btoa(value) }
}

function publicRepository() {
  return {
    id: 123,
    name: 'skills',
    owner: { login: 'skilld-dev' },
    private: false,
    default_branch: 'main',
  }
}

function gitBlobSha(value: string): string {
  return createHash('sha1').update(`blob ${value.length}\0${value}`).digest('hex')
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
