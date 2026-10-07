import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createGithubSourceClient,
  createPublicGithubSourceClient,
} from '../../layers/artifact-delivery/server/utils/github-source'
import { createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { readLoadedFiles } from '../fixtures/loaded-source'
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
const archiveUrl = `https://codeload.github.com/skilld-dev/skills/tar.gz/${commitSha}`
const rawBase = `https://raw.githubusercontent.com/skilld-dev/skills/${commitSha}/`

describe('loading a public Skill from the Repository archive', () => {
  it('reads every file from one archive request and asks for no blobs', async () => {
    const fetchMock = sourceFetch({})

    const read = await loadAndRead(fetchMock)

    expect(read._tag).toBe('read')
    if (read._tag !== 'read')
      return
    expect(read.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md', 'run.sh'])
    expect(new TextDecoder().decode(read.files[0]!.bytes)).toBe(skillText)
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toEqual([])
    expect(requestedPaths(fetchMock).filter(url => url.includes('codeload.github.com'))).toEqual([archiveUrl])
  })

  it('takes the executable mode from the tree entry, not the archive header', async () => {
    const read = await loadAndRead(sourceFetch({}))

    expect(read._tag).toBe('read')
    if (read._tag !== 'read')
      return
    expect(read.files.map(file => [file.path, file.mode])).toEqual([
      ['SKILL.md', 420],
      ['references/guide.md', 420],
      ['run.sh', 493],
    ])
  })

  it('reads the archive when the tree came back truncated', async () => {
    const fetchMock = sourceFetch({ truncated: true })

    const read = await loadAndRead(fetchMock)

    expect(read._tag).toBe('read')
    expect(requestedPaths(fetchMock).filter(url => url.includes('codeload.github.com'))).toHaveLength(1)
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toEqual([])
  })

  it('reads a file export-ignore left out of the archive from GitHub at the commit', async () => {
    const fetchMock = sourceFetch({ omitFromTarball: ['skills/demo/references/guide.md'] })

    const read = await loadAndRead(fetchMock)

    expect(read._tag).toBe('read')
    expect(requestedPaths(fetchMock).filter(url => url.startsWith(rawBase))).toEqual([`${rawBase}skills/demo/references/guide.md`])
  })

  it('reads a file from GitHub when its archive bytes fail the Git digest check', async () => {
    // `export-subst` can rewrite a file in the archive and keep its length.
    const fetchMock = sourceFetch({ rewriteInTarball: { 'skills/demo/references/guide.md': 'Read this frst!\n' } })

    const read = await loadAndRead(fetchMock)

    expect(read._tag).toBe('read')
    if (read._tag !== 'read')
      return
    expect(new TextDecoder().decode(read.files[1]!.bytes)).toBe(guideText)
    expect(requestedPaths(fetchMock).filter(url => url.startsWith(rawBase))).toEqual([`${rawBase}skills/demo/references/guide.md`])
  })

  it('reads every file from GitHub when codeload refuses the archive', async () => {
    const fetchMock = sourceFetch({ tarballStatus: 404 })

    const read = await loadAndRead(fetchMock)

    expect(read._tag).toBe('read')
    expect(requestedPaths(fetchMock).filter(url => url.startsWith(rawBase))).toHaveLength(3)
  })

  it('packs identical bytes whichever host served the files', async () => {
    const fromArchive = await loadAndRead(sourceFetch({}))
    const fromGithub = await loadAndRead(sourceFetch({ tarballStatus: 404 }))

    expect(fromArchive._tag).toBe('read')
    expect(fromGithub._tag).toBe('read')
    if (fromArchive._tag !== 'read' || fromGithub._tag !== 'read')
      return
    expect(createDeterministicUstar(fromArchive.files)).toEqual(createDeterministicUstar(fromGithub.files))
  })

  it('reads blobs and no archive when the Repository is private', async () => {
    const fetchMock = sourceFetch({ visibility: 'private' })
    const client = createGithubSourceClient({
      fetch: fetchMock as unknown as typeof fetch,
      token: 'installation-token',
      visibility: 'private',
    })

    const loaded = await client.load({ ...resolvedSource(), visibility: 'private' }, { linkedFiles: false })
    if (loaded._tag !== 'loaded')
      throw new Error('The private load failed')
    const read = await readLoadedFiles(loaded.value)

    expect(read._tag).toBe('read')
    expect(requestedPaths(fetchMock).filter(url => url.includes('codeload') || url.startsWith(rawBase))).toEqual([])
    expect(requestedPaths(fetchMock).filter(url => url.includes('/git/blobs/'))).toHaveLength(3)
  })

  it('rejects a Skill holding a Git submodule before it reads any bytes', async () => {
    const fetchMock = sourceFetch({ submodule: true })
    const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })

    const loaded = await client.load(resolvedSource(), { linkedFiles: false })

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      findings: ['vendor/library is a Git submodule'],
    })
    expect(requestedPaths(fetchMock).filter(url => url.includes('codeload') || url.includes('/git/blobs/'))).toEqual([])
  })
})

async function loadAndRead(fetchMock: ReturnType<typeof sourceFetch>) {
  const loaded = await createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch }).load(resolvedSource(), { linkedFiles: false })
  if (loaded._tag !== 'loaded')
    throw new Error(`The load failed: ${loaded.summary}`)
  return await readLoadedFiles(loaded.value)
}

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
    if (url === archiveUrl) {
      if (options.tarballStatus)
        return new Response('no', { status: options.tarballStatus })
      return new Response(archive, { status: 200, headers: { 'content-type': 'application/x-gzip' } })
    }
    if (url.startsWith(rawBase)) {
      const entry = files.find(([path]) => url === `${rawBase}skills/demo/${path}`)
      return entry ? new Response(entry[1], { status: 200 }) : new Response(null, { status: 404 })
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
