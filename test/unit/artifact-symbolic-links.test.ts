import type { CheckResult } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { LoadSourceResult } from '../../layers/artifact-delivery/server/utils/github-source'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { scanArtifact } from '../../layers/artifact-delivery/server/utils/artifact-pack'
import {
  createGithubSourceClient,
  createPublicGithubSourceClient,
  MAX_LINKED_BYTES,
  PUBLIC_ARTIFACT_LIMITS,
  selectArtifactEntries,
} from '../../layers/artifact-delivery/server/utils/github-source'
import { readDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'
import { tarGzFixture } from '../fixtures/tar-archive'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const topLevel = 'skilld-dev-skills-0123456'
const archiveUrl = `https://codeload.github.com/skilld-dev/skills/tar.gz/${commitSha}`
const rawBase = `https://raw.githubusercontent.com/skilld-dev/skills/${commitSha}/`
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\nRead _common/BOUNDARIES.md.\n'
const boundariesText = '# Boundaries\nStay in scope.\n'
const checkText = 'print("check")\n'
const guideText = 'Read this first.\n'

/** A Repository entry: a file with its text, or a symbolic link with the path it holds. */
type RepositoryEntry
  = | { path: string, text: string, mode?: '100644' | '100755' }
    | { path: string, link: string }

const sharedFolder: RepositoryEntry[] = [
  { path: '_common/BOUNDARIES.md', text: boundariesText },
  { path: '_common/scripts/check.py', text: checkText, mode: '100755' },
]
const demoSkill: RepositoryEntry[] = [
  { path: 'skills/demo/SKILL.md', text: skillText },
  { path: 'skills/demo/references/guide.md', text: guideText },
]

describe('symbolic links in a Skill folder', () => {
  it('packs the files of a folder link at the link path, from the one archive read', async () => {
    // simota/agent-skills: every Skill folder links the shared `_common` folder at the Repository root.
    const github = fakeGithub([...sharedFolder, ...demoSkill, { path: 'skills/demo/_common', link: '../../_common' }])

    const built = await loadAndScan(github.fetch)

    expect(built.files).toEqual([
      { path: 'SKILL.md', mode: 420, text: skillText },
      { path: '_common/BOUNDARIES.md', mode: 420, text: boundariesText },
      { path: '_common/scripts/check.py', mode: 493, text: checkText },
      { path: 'references/guide.md', mode: 420, text: guideText },
    ])
    expect(github.requested().filter(url => url.startsWith(rawBase))).toEqual([])
    expect(github.requested().filter(url => url === archiveUrl)).toHaveLength(1)
    expect(built.check).toMatchObject({
      name: 'symbolic-links',
      required: false,
      outcome: 'warn',
      findings: ['_common -> ../../_common'],
    })
  })

  it('packs a file link as a copy of the file it names', async () => {
    // austintgriffith/ethskills: AGENTS.md is a link to SKILL.md.
    const github = fakeGithub([...demoSkill, { path: 'skills/demo/AGENTS.md', link: 'SKILL.md' }])

    const built = await loadAndScan(github.fetch)

    expect(built.files).toEqual([
      { path: 'AGENTS.md', mode: 420, text: skillText },
      { path: 'SKILL.md', mode: 420, text: skillText },
      { path: 'references/guide.md', mode: 420, text: guideText },
    ])
    expect(built.check).toMatchObject({ outcome: 'warn', findings: ['AGENTS.md -> SKILL.md'] })
  })

  it('reads a link target from GitHub when waiting for it would hold more than 8 MiB', async () => {
    // garrytan/gstack: `connect-chrome` links a folder that sorts after the
    // rest of the Repository, and the Repository is the Skill folder.
    const large = 'x'.repeat(9 * 1024 * 1024)
    const github = fakeGithub([
      ...demoSkill,
      { path: 'skills/demo/browser', link: '../zeta' },
      { path: 'skills/demo/media/reel.txt', text: large },
      { path: 'skills/zeta/notes.md', text: guideText },
    ])

    const built = await loadAndScan(github.fetch)

    expect(built.files.map(file => file.path)).toEqual(['SKILL.md', 'browser/notes.md', 'media/reel.txt', 'references/guide.md'])
    expect(github.requested().filter(url => url.startsWith(rawBase))).toEqual([`${rawBase}skills/zeta/notes.md`])
  })

  it('holds the files a link file passes over while it waits for its target', async () => {
    // simota/agent-skills/anvil sits in `.archive/`, which the archive lists before `_common`.
    const github = fakeGithub([
      ...sharedFolder,
      { path: '.archive/demo/SKILL.md', text: skillText },
      { path: '.archive/demo/references/guide.md', text: guideText },
      { path: '.archive/demo/_common', link: '../../_common' },
    ])
    const client = createPublicGithubSourceClient({ fetch: github.fetch as unknown as typeof fetch })

    const built = await scan(await client.load({ ...resolvedSource(github.rootTreeSha), skillPath: '.archive/demo' }, { linkedFiles: false }))

    expect(built.files.map(file => file.path)).toEqual(['SKILL.md', '_common/BOUNDARIES.md', '_common/scripts/check.py', 'references/guide.md'])
    expect(github.requested().filter(url => url.startsWith(rawBase))).toEqual([])
  })

  it('waits in the archive for a link target when no later file needs an earlier entry', async () => {
    const github = fakeGithub([
      ...demoSkill,
      { path: 'skills/demo/zz', link: '../zeta' },
      { path: 'skills/zeta/notes.md', text: guideText },
    ])

    const built = await loadAndScan(github.fetch)

    expect(built.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md', 'zz/notes.md'])
    expect(github.requested().filter(url => url.startsWith(rawBase))).toEqual([])
  })

  it('packs no symbolic-links finding for a Skill without links', async () => {
    const built = await loadAndScan(fakeGithub(demoSkill).fetch)

    expect(built.check).toEqual({ name: 'symbolic-links', version: '1', required: false, outcome: 'pass' })
  })

  it('leaves out a link to a folder that holds it, and every link inside a followed folder', async () => {
    // simota/agent-skills/atlas links itself at reference/atlas, and `_common`
    // links every Skill folder back. tar --dereference recursed 5,800 folders deep on it.
    const github = fakeGithub([
      ...sharedFolder,
      { path: '_common/demo', link: '../skills/demo' },
      ...demoSkill,
      { path: 'skills/demo/_common', link: '../../_common' },
      { path: 'skills/demo/references/demo', link: '../../demo' },
    ])

    const built = await loadAndScan(github.fetch)

    expect(built.files.map(file => file.path)).toEqual([
      'SKILL.md',
      '_common/BOUNDARIES.md',
      '_common/scripts/check.py',
      'references/guide.md',
    ])
    expect(built.check?.findings).toEqual([
      '_common -> ../../_common',
      '_common/demo: left out, it is a link inside a followed folder',
      'references/demo -> ../../demo: left out, the folder holds the link',
    ])
  })

  it('follows a link that passes through another link', async () => {
    const github = fakeGithub([
      ...sharedFolder,
      ...demoSkill,
      { path: 'shared', link: '_common' },
      { path: 'skills/demo/BOUNDARIES.md', link: '../../shared/BOUNDARIES.md' },
    ])

    const built = await loadAndScan(github.fetch)

    expect(built.files).toContainEqual({ path: 'BOUNDARIES.md', mode: 420, text: boundariesText })
  })

  it.each([
    { name: 'leaves the Repository root', link: '../../../outside', finding: 'escape -> ../../../outside: the target is outside the Repository' },
    { name: 'is an absolute path', link: '/etc/passwd', finding: 'escape -> /etc/passwd: the target is an absolute path' },
    { name: 'points into .git', link: '../../.git/config', finding: 'escape -> ../../.git/config: the target is inside .git' },
    { name: 'names a missing file', link: 'missing.md', finding: 'escape -> missing.md: the target does not exist at this commit' },
    { name: 'passes through a file', link: 'SKILL.md/more', finding: 'escape -> SKILL.md/more: the target does not exist at this commit' },
    { name: 'holds the Skill folder', link: '..', finding: 'escape -> ..: the target folder holds the Skill folder' },
  ])('rejects a link that $name before it reads the archive', async ({ link, finding }) => {
    const github = fakeGithub([...demoSkill, { path: 'skills/demo/escape', link }])

    const loaded = await load(github.fetch)

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The Skill source layout was rejected.',
      findings: [finding],
    })
    expect(github.requested().filter(url => url === archiveUrl || url.startsWith(rawBase))).toEqual([])
  })

  it('rejects links that loop', async () => {
    const github = fakeGithub([
      ...demoSkill,
      { path: 'skills/demo/a.md', link: 'b.md' },
      { path: 'skills/demo/b.md', link: 'a.md' },
    ])

    const loaded = await load(github.fetch)

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      summary: 'The Skill source layout was rejected.',
      findings: ['a.md -> b.md: the link loops', 'b.md -> a.md: the link loops'],
    })
  })

  it('rejects a chain of more than 8 links', async () => {
    const chain: RepositoryEntry[] = Array.from({ length: 9 }, (_, index) => ({ path: `skills/demo/l${index}.md`, link: `l${index + 1}.md` }))
    const github = fakeGithub([...demoSkill, ...chain, { path: 'skills/demo/l9.md', link: 'SKILL.md' }])

    const loaded = await load(github.fetch)

    expect(loaded).toMatchObject({ _tag: 'rejected', summary: 'The Skill source layout was rejected.' })
    if (loaded._tag === 'rejected')
      expect(loaded.findings[0]).toBe('l0.md -> l1.md: the target passes through more than 8 links')
  })

  it('follows links the same way for a private build, reading each file as a blob', async () => {
    const github = fakeGithub([...sharedFolder, ...demoSkill, { path: 'skills/demo/_common', link: '../../_common' }], { visibility: 'private' })
    const client = createGithubSourceClient({ fetch: github.fetch as unknown as typeof fetch, token: 'installation-token', visibility: 'private' })

    const loaded = await client.load({ ...resolvedSource(github.rootTreeSha), visibility: 'private' }, { linkedFiles: false })
    const built = await scan(loaded)

    expect(built.files.map(file => file.path)).toEqual(['SKILL.md', '_common/BOUNDARIES.md', '_common/scripts/check.py', 'references/guide.md'])
    expect(github.requested().filter(url => url.includes('codeload') || url.startsWith(rawBase))).toEqual([])
  })
})

describe('choosing files when a link put some in the Skill', () => {
  it('never offers a file a link put in the Skill as a linked file', () => {
    // The skilld CLI reads a linked file at the link path, where GitHub serves no file.
    const selected = selectArtifactEntries([
      { path: 'SKILL.md', mode: '100644', type: 'blob', sha: 'a'.repeat(40), size: 100 },
      { path: 'shared/model.bin', mode: '100644', type: 'blob', sha: 'b'.repeat(40), size: 70 * 1024 * 1024, from: 'models/model.bin' },
    ], 'skills/demo', { ...PUBLIC_ARTIFACT_LIMITS, maxLinkedBytes: MAX_LINKED_BYTES })

    expect(selected).toMatchObject({ _tag: 'selected', linked: [], omitted: [{ path: 'shared/model.bin' }] })
  })
})

async function load(fetchMock: ReturnType<typeof fakeGithub>['fetch']): Promise<LoadSourceResult> {
  const client = createPublicGithubSourceClient({ fetch: fetchMock as unknown as typeof fetch })
  return await client.load(resolvedSource(rootTree()), { linkedFiles: false })
}

async function loadAndScan(fetchMock: ReturnType<typeof fakeGithub>['fetch']) {
  return await scan(await load(fetchMock))
}

/** Scans a load the way a build does: the packed files, and the symbolic-links check result. */
async function scan(loaded: LoadSourceResult) {
  if (loaded._tag !== 'loaded')
    throw new Error(`The load failed: ${loaded.summary} ${loaded.findings.join('; ')}`)
  const scanned = await scanArtifact({
    source: loaded.value.source,
    files: loaded.value.files,
    read: loaded.value.read,
    omitted: loaded.value.omitted,
    symbolicLinks: loaded.value.symbolicLinks,
    spoolBytes: Number.POSITIVE_INFINITY,
  })
  if (scanned._tag === 'rejected')
    throw new Error(`The scan failed: ${scanned.summary} ${scanned.findings.join('; ')}`)
  const files = await readDeterministicUstar(scanned.spool!)
  if (!files)
    throw new Error('The scan packed an archive it cannot read back')
  return {
    files: files.map(file => ({ path: file.path, mode: file.mode, text: new TextDecoder().decode(file.bytes) })),
    check: scanned.checked.checkResults.find((check: CheckResult) => check.name === 'symbolic-links'),
  }
}

/**
 * GitHub for one Repository: the REST trees and blobs, the codeload archive
 * with each link as a tar link entry, and raw.githubusercontent.com, which
 * answers a link with the path it holds and a path through a folder link
 * with 404, as GitHub does.
 */
function fakeGithub(entries: RepositoryEntry[], options: { visibility?: 'public' | 'private' } = {}) {
  const encoder = new TextEncoder()
  const contentOf = (entry: RepositoryEntry) => 'link' in entry ? entry.link : entry.text
  const blobs = entries.map(entry => ({
    path: entry.path,
    mode: 'link' in entry ? '120000' : entry.mode ?? '100644',
    type: 'blob',
    sha: gitBlobSha(contentOf(entry)),
    size: encoder.encode(contentOf(entry)).byteLength,
  }))
  const folders = new Set([''])
  for (const entry of entries) {
    const segments = entry.path.split('/')
    for (let index = 1; index < segments.length; index++)
      folders.add(segments.slice(0, index).join('/'))
  }
  const folderBySha = new Map([...folders].map(folder => [treeShaOf(folder), folder]))
  const listing = (folder: string, recursive: boolean) => {
    const prefix = folder ? `${folder}/` : ''
    const trees = [...folders]
      .filter(other => other !== '' && other !== folder && other.startsWith(prefix))
      .map(other => ({ path: other.slice(prefix.length), mode: '040000', type: 'tree', sha: treeShaOf(other) }))
    const files = blobs
      .filter(blob => blob.path.startsWith(prefix))
      .map(blob => ({ ...blob, path: blob.path.slice(prefix.length) }))
    const all = [...trees, ...files]
    return recursive ? all : all.filter(entry => !entry.path.includes('/'))
  }
  const archive = tarGzFixture(topLevel, [...entries]
    .sort((left, right) => left.path < right.path ? -1 : 1)
    .map(entry => 'link' in entry
      ? { path: entry.path, typeflag: '2', linkname: entry.link, mode: '0000777' }
      : { path: entry.path, bytes: encoder.encode(entry.text) }), { globalComment: commitSha })

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/repos/skilld-dev/skills'))
      return json({ id: 123, name: 'skills', owner: { login: 'skilld-dev' }, private: options.visibility === 'private', default_branch: 'main' })
    const treeMatch = /\/git\/trees\/([a-f0-9]{40})(\?recursive=1)?$/.exec(url)
    if (treeMatch) {
      const folder = folderBySha.get(treeMatch[1]!)
      return folder === undefined
        ? json({}, 404)
        : json({ sha: treeMatch[1], truncated: false, tree: listing(folder, Boolean(treeMatch[2])) })
    }
    const blobMatch = /\/git\/blobs\/([a-f0-9]{40})$/.exec(url)
    if (blobMatch) {
      const entry = entries.find(candidate => gitBlobSha(contentOf(candidate)) === blobMatch[1])
      return entry
        ? json({ sha: blobMatch[1], size: encoder.encode(contentOf(entry)).byteLength, encoding: 'base64', content: Buffer.from(contentOf(entry), 'utf8').toString('base64') })
        : json({}, 404)
    }
    if (url === archiveUrl)
      return new Response(archive, { status: 200 })
    if (url.startsWith(rawBase)) {
      const path = url.slice(rawBase.length).split('/').map(decodeURIComponent).join('/')
      const entry = entries.find(candidate => candidate.path === path)
      return entry ? new Response(contentOf(entry), { status: 200 }) : new Response('404: Not Found', { status: 404 })
    }
    return json({}, 404)
  })
  return {
    fetch: fetchMock,
    rootTreeSha: treeShaOf(''),
    requested: () => fetchMock.mock.calls.map(call => String(call[0])),
  }
}

function rootTree(): string {
  return treeShaOf('')
}

function treeShaOf(folder: string): string {
  return createHash('sha1').update(`tree ${folder}`).digest('hex')
}

function resolvedSource(treeSha: string) {
  return {
    provider: 'github' as const,
    repositoryId: 123,
    owner: 'skilld-dev',
    repository: 'skills',
    visibility: 'public' as const,
    commitSha,
    treeSha,
    skillPath: 'skills/demo',
  }
}

function gitBlobSha(value: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0${value}`).digest('hex')
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}
