import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  chooseArtifactByteSource,
  createGithubSourceClient,
  createPublicGithubSourceClient,
  TARBALL_MAX_TREE_BYTES,
} from '../../layers/artifact-delivery/server/utils/github-source'
import { createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { tarGzFixture } from '../fixtures/tar-archive'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const rootTreeSha = '89abcdef0123456789abcdef0123456789abcdef'
const skillsTreeSha = '1111111111111111111111111111111111111111'
const skillTreeSha = '2222222222222222222222222222222222222222'
const referencesTreeSha = '3333333333333333333333333333333333333333'
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'
const guideText = 'Read this first.\n'
const scriptText = '#!/usr/bin/env bash\necho demo\n'
const topLevel = 'skilld-dev-skills-0123456'
const encoder = new TextEncoder()

describe('artifact byte source choice', () => {
  it('reads the tarball when the tree is complete and inside the byte ceiling', () => {
    expect(chooseArtifactByteSource({
      visibility: 'public',
      treeTruncated: false,
      totalBlobBytes: TARBALL_MAX_TREE_BYTES,
    })).toEqual({ _tag: 'tarball' })
  })

  it('reads blobs when the tree total passes the byte ceiling by one byte', () => {
    expect(chooseArtifactByteSource({
      visibility: 'public',
      treeTruncated: false,
      totalBlobBytes: TARBALL_MAX_TREE_BYTES + 1,
    })).toEqual({ _tag: 'per-blob', reason: 'tree-too-large' })
  })

  it('reads blobs when the Repository tree came back truncated', () => {
    expect(chooseArtifactByteSource({
      visibility: 'public',
      treeTruncated: true,
      totalBlobBytes: 1024,
    })).toEqual({ _tag: 'per-blob', reason: 'tree-truncated' })
  })

  it('reads blobs for a private Repository, whatever its tree looks like', () => {
    expect(chooseArtifactByteSource({
      visibility: 'private',
      treeTruncated: false,
      totalBlobBytes: 1024,
    })).toEqual({ _tag: 'per-blob', reason: 'private-repository' })
  })
})

describe('loading a Skill from the Repository tarball', () => {
  it('loads every file from one tarball request and asks for no blobs', async () => {
    const fetchMock = sourceFetch({})
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md', 'run.sh'])
    expect(new TextDecoder().decode(loaded.value.files[0]!.bytes)).toBe(skillText)
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toEqual([])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/tarball/'))).toHaveLength(1)
  })

  it('takes the executable mode from the tree entry, not the tarball header', async () => {
    const client = createPublicGithubSourceClient({ fetch: sourceFetch({}) as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => [file.path, file.mode])).toEqual([
      ['SKILL.md', 420],
      ['references/guide.md', 420],
      ['run.sh', 493],
    ])
  })

  it('falls back to blobs when the tree came back truncated', async () => {
    const fetchMock = sourceFetch({ truncated: true })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md', 'run.sh'])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/tarball/'))).toEqual([])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toHaveLength(3)
  })

  it('falls back to blobs when export-ignore left a tree file out of the tarball', async () => {
    const fetchMock = sourceFetch({ omitFromTarball: ['skills/demo/references/guide.md'] })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md', 'run.sh'])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toHaveLength(3)
  })

  it('falls back to blobs when a tarball file fails its Git digest check', async () => {
    const fetchMock = sourceFetch({ rewriteInTarball: { 'skills/demo/references/guide.md': 'tampered\n' } })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(new TextDecoder().decode(loaded.value.files[1]!.bytes)).toBe(guideText)
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toHaveLength(3)
  })

  it('falls back to blobs when GitHub refuses the tarball request', async () => {
    const fetchMock = sourceFetch({ tarballStatus: 404 })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toHaveLength(3)
  })

  it('packages identical bytes whichever source the files came from', async () => {
    const fromTarball = await createPublicGithubSourceClient({
      fetch: sourceFetch({}) as unknown as typeof fetch,
    }).load(resolvedSource())
    const fromBlobs = await createPublicGithubSourceClient({
      fetch: sourceFetch({ tarballStatus: 404 }) as unknown as typeof fetch,
    }).load(resolvedSource())

    expect(fromTarball._tag).toBe('loaded')
    expect(fromBlobs._tag).toBe('loaded')
    if (fromTarball._tag !== 'loaded' || fromBlobs._tag !== 'loaded')
      return
    expect(createDeterministicUstar(fromTarball.value.files))
      .toEqual(createDeterministicUstar(fromBlobs.value.files))
  })

  it('asks for no tarball when the Repository is private', async () => {
    const fetchMock = sourceFetch({ visibility: 'private' })
    const client = createGithubSourceClient({
      fetch: fetchMock as unknown as typeof fetch,
      token: 'installation-token',
      visibility: 'private',
    })

    const loaded = await client.load({ ...resolvedSource(), visibility: 'private' })

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md', 'run.sh'])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/tarball/'))).toEqual([])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toHaveLength(3)
  })

  it('rejects a Skill holding a Git submodule before it reads any bytes', async () => {
    const fetchMock = sourceFetch({ submodule: true })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource())

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      findings: ['vendor/library is a Git submodule'],
    })
    expect(requestedPaths(fetchMock).filter(url => url.includes('/tarball/'))).toEqual([])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toEqual([])
  })
})

interface FetchOptions {
  visibility?: 'public' | 'private'
  truncated?: boolean
  omitFromTarball?: string[]
  rewriteInTarball?: Record<string, string>
  tarballStatus?: number
  submodule?: boolean
}

function sourceFetch(options: FetchOptions) {
  const files: Array<[string, string, string]> = [
    ['SKILL.md', skillText, '100644'],
    ['references/guide.md', guideText, '100644'],
    ['run.sh', scriptText, '100755'],
  ]
  const treeEntries = files.map(([path, text, mode]) => ({
    path,
    mode,
    type: 'blob',
    sha: gitBlobSha(text),
    size: encoder.encode(text).byteLength,
  }))
  if (options.submodule) {
    treeEntries.push({
      path: 'vendor/library',
      mode: '160000',
      type: 'commit',
      sha: commitSha,
      size: 0,
    })
  }
  const archive = tarGzFixture(topLevel, files
    .filter(([path]) => !(options.omitFromTarball ?? []).includes(`skills/demo/${path}`))
    .map(([path, text]) => ({
      path: `skills/demo/${path}`,
      bytes: encoder.encode(options.rewriteInTarball?.[`skills/demo/${path}`] ?? text),
    })))

  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/repos/skilld-dev/skills'))
      return json({ ...publicRepository(), private: options.visibility === 'private' })
    if (url.endsWith(`/git/trees/${rootTreeSha}`))
      return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
    if (url.endsWith(`/git/trees/${skillsTreeSha}`))
      return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
    if (url.endsWith(`/git/trees/${skillTreeSha}?recursive=1`))
      return json({ sha: skillTreeSha, tree: treeEntries, truncated: options.truncated ?? false })
    // A truncated recursive read makes the client walk one tree per directory.
    if (url.endsWith(`/git/trees/${skillTreeSha}`)) {
      return json({
        sha: skillTreeSha,
        truncated: false,
        tree: [
          ...treeEntries.filter(entry => !entry.path.includes('/')),
          tree('references', referencesTreeSha),
        ],
      })
    }
    if (url.endsWith(`/git/trees/${referencesTreeSha}`)) {
      return json({
        sha: referencesTreeSha,
        truncated: false,
        tree: treeEntries
          .filter(entry => entry.path.startsWith('references/'))
          .map(entry => ({ ...entry, path: entry.path.slice('references/'.length) })),
      })
    }
    if (url.includes('/tarball/')) {
      if (options.tarballStatus)
        return new Response('no', { status: options.tarballStatus })
      return new Response(archive, { status: 200, headers: { 'content-type': 'application/x-gzip' } })
    }
    const blobMatch = /\/git\/blobs\/([a-f0-9]{40})$/.exec(url)
    if (blobMatch) {
      const entry = files.find(([, text]) => gitBlobSha(text) === blobMatch[1])
      if (entry) {
        return json({
          sha: blobMatch[1],
          size: encoder.encode(entry[1]).byteLength,
          encoding: 'base64',
          content: Buffer.from(entry[1], 'utf8').toString('base64'),
        })
      }
    }
    return json({}, 404)
  })
}

function requestedPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(call => String(call[0]))
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
  return createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0${value}`).digest('hex')
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
