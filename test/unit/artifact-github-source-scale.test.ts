import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const rootTreeSha = '89abcdef0123456789abcdef0123456789abcdef'
const docsTreeSha = '4444444444444444444444444444444444444444'
const skillsTreeSha = '1111111111111111111111111111111111111111'
const skillTreeSha = '2222222222222222222222222222222222222222'
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'
const skillBlobSha = gitBlobSha(skillText)
const API = 'https://api.github.com'

describe('a Repository tree larger than one GitHub response', () => {
  // posthog/posthog, n8n-io/n8n, vercel/next.js and openshift/hypershift
  // answer a recursive tree read with more than 8 MiB.
  it('finds a named Skill when the recursive tree exceeds the read limit', async () => {
    const fetchMock = splitRepositoryFetch({ root: 'oversized' })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.resolve(namedRequest('demo'))

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: 'skills/demo' } })
  })

  it('finds a named Skill when GitHub truncates the recursive tree', async () => {
    const fetchMock = splitRepositoryFetch({ root: 'truncated' })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.resolve(namedRequest('demo'))

    expect(result).toMatchObject({ _tag: 'resolved', source: { skillPath: 'skills/demo' } })
  })

  it('asks for a path when one directory is too large to list', async () => {
    const fetchMock = splitRepositoryFetch({ root: 'oversized', rootLevel: 'truncated' })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.resolve(namedRequest('demo'))

    expect(result).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The Repository is too large to find a Skill by name. Name the Skill by its path.',
    })
  })

  it('loads a small Skill folder whose recursive listing exceeds the read limit', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${API}/repos/skilld-dev/skills`)
        return json(repository('skilld-dev', 'skills'))
      if (url.endsWith(`/git/trees/${rootTreeSha}`))
        return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
      if (url.endsWith(`/git/trees/${skillsTreeSha}`))
        return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
      if (url.endsWith(`/git/trees/${skillTreeSha}?recursive=1`))
        return oversized()
      if (url.endsWith(`/git/trees/${skillTreeSha}`))
        return json({ sha: skillTreeSha, tree: [blob('SKILL.md', skillBlobSha, skillText.length)] })
      if (url.endsWith(`/git/blobs/${skillBlobSha}`))
        return json(blobResponse(skillText, skillBlobSha))
      return json({}, 404)
    })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource('skilld-dev', 'skills'))

    expect(result._tag).toBe('loaded')
  })
})

describe('a moved Repository', () => {
  // facebook/react moved to react/react. GitHub answers the old name with a
  // 301 to /repositories/<id>.
  it('resolves under the name the request used', async () => {
    const fetchMock = movedRepositoryFetch()
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.resolve({
      provider: 'github',
      owner: 'facebook',
      repository: 'react',
      selector: { type: 'path', path: 'skills/demo' },
      ref: { type: 'commit', value: commitSha },
    })

    expect(result).toEqual({
      _tag: 'resolved',
      source: {
        provider: 'github',
        repositoryId: 10270250,
        owner: 'facebook',
        repository: 'react',
        visibility: 'public',
        commitSha,
        treeSha: rootTreeSha,
        skillPath: 'skills/demo',
      },
    })
  })

  it('loads every Git object from the new name', async () => {
    const fetchMock = movedRepositoryFetch()
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource('facebook', 'react', 10270250))

    expect(result._tag).toBe('loaded')
    const reads = fetchMock.mock.calls.map(call => String(call[0]))
    expect(reads.filter(url => url.startsWith(`${API}/repos/facebook/react`))).toEqual([`${API}/repos/facebook/react`])
  })

  it('rejects a moved name that now leads to another Repository', async () => {
    const fetchMock = movedRepositoryFetch()
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    const result = await client.load(resolvedSource('facebook', 'react', 999))

    expect(result).toMatchObject({ _tag: 'rejected', code: 'INVALID_SOURCE' })
  })

  it('never follows a redirect off the GitHub API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${API}/repos/facebook/react`)
        return new Response(null, { status: 301, headers: { location: 'https://example.com/repositories/10270250' } })
      return json(repository('react', 'react', 10270250))
    })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as typeof fetch })

    await expect(client.resolve({
      provider: 'github',
      owner: 'facebook',
      repository: 'react',
      selector: { type: 'path', path: 'skills/demo' },
      ref: { type: 'commit', value: commitSha },
    })).rejects.toThrow('GitHub redirected 301')
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([`${API}/repos/facebook/react`])
  })
})

/**
 * A Repository whose root is `docs/` and `skills/demo/SKILL.md`. The root
 * recursive read is the large one; each top-level folder lists in one read.
 */
function splitRepositoryFetch(options: { root: 'oversized' | 'truncated', rootLevel?: 'truncated' }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === `${API}/repos/skilld-dev/skills`)
      return json(repository('skilld-dev', 'skills'))
    if (url.endsWith('/git/ref/heads/main'))
      return json({ ref: 'refs/heads/main', object: { type: 'commit', sha: commitSha } })
    if (url.endsWith(`/commits/${commitSha}`))
      return json({ sha: commitSha, commit: { tree: { sha: rootTreeSha } } })
    if (url.endsWith(`/git/trees/${rootTreeSha}?recursive=1`)) {
      return options.root === 'oversized'
        ? oversized()
        : json({ sha: rootTreeSha, tree: [tree('docs', docsTreeSha)], truncated: true })
    }
    if (url.endsWith(`/git/trees/${rootTreeSha}`)) {
      return json({
        sha: rootTreeSha,
        tree: [blob('README.md', skillBlobSha, 10), tree('docs', docsTreeSha), tree('skills', skillsTreeSha)],
        truncated: options.rootLevel === 'truncated',
      })
    }
    if (url.endsWith(`/git/trees/${docsTreeSha}?recursive=1`))
      return json({ sha: docsTreeSha, tree: [blob('guide.md', skillBlobSha, 10)], truncated: false })
    if (url.endsWith(`/git/trees/${skillsTreeSha}?recursive=1`)) {
      return json({
        sha: skillsTreeSha,
        tree: [tree('demo', skillTreeSha), blob('demo/SKILL.md', skillBlobSha, skillText.length)],
        truncated: false,
      })
    }
    return json({}, 404)
  })
}

/** facebook/react answers 301; react/react serves every Git object. */
function movedRepositoryFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith(`${API}/repos/facebook/react`))
      return new Response(null, { status: 301, headers: { location: `${API}/repositories/10270250` } })
    if (url === `${API}/repositories/10270250`)
      return json(repository('react', 'react', 10270250))
    const moved = `${API}/repos/react/react`
    if (url === `${moved}/commits/${commitSha}`)
      return json({ sha: commitSha, commit: { tree: { sha: rootTreeSha } } })
    if (url === `${moved}/git/trees/${rootTreeSha}`)
      return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
    if (url === `${moved}/git/trees/${skillsTreeSha}`)
      return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
    if (url === `${moved}/git/trees/${skillTreeSha}?recursive=1`)
      return json({ sha: skillTreeSha, tree: [blob('SKILL.md', skillBlobSha, skillText.length)], truncated: false })
    if (url === `${moved}/git/blobs/${skillBlobSha}`)
      return json(blobResponse(skillText, skillBlobSha))
    return json({}, 404)
  })
}

function namedRequest(name: string) {
  return {
    provider: 'github' as const,
    owner: 'skilld-dev',
    repository: 'skills',
    selector: { type: 'named-skill' as const, name },
  }
}

function resolvedSource(owner: string, name: string, repositoryId = 123) {
  return {
    provider: 'github' as const,
    repositoryId,
    owner,
    repository: name,
    visibility: 'public' as const,
    commitSha,
    treeSha: rootTreeSha,
    skillPath: 'skills/demo',
  }
}

function repository(owner: string, name: string, id = 123) {
  return { id, name, owner: { login: owner }, private: false, default_branch: 'main' }
}

/** A tree response one byte past the 8 MiB read limit. */
function oversized(): Response {
  return new Response(`{"pad":"${'x'.repeat(8 * 1024 * 1024)}"}`, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
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

function gitBlobSha(value: string): string {
  return createHash('sha1').update(`blob ${value.length}\0${value}`).digest('hex')
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
