import type { ArtifactSourceFile } from '../../layers/artifact-delivery/server/utils/github-source'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import { createDeterministicUstar, projectedUstarBytes } from '../../layers/artifact-delivery/server/utils/ustar'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const rootTreeSha = '89abcdef0123456789abcdef0123456789abcdef'
const skillsTreeSha = '1111111111111111111111111111111111111111'
const skillTreeSha = '2222222222222222222222222222222222222222'
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'
const skillBlobSha = gitBlobSha(skillText)

describe('artifact source size guards', () => {
  it('accepts a Skill with more files than the old 256 ceiling', async () => {
    const client = createPublicGithubSourceClient({
      fetch: skillTreeFetch(skillEntries(300)) as unknown as typeof fetch,
    })

    const loaded = await client.load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files).toHaveLength(300)
  })

  it('rejects a Skill past the file ceiling by name', async () => {
    const client = createPublicGithubSourceClient({
      fetch: skillTreeFetch(skillEntries(901)) as unknown as typeof fetch,
    })

    const loaded = await client.load(resolvedSource())

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The Skill folder `skills/demo` has 901 files. The limit is 900.',
    })
  })

  it('rejects a Skill whose packaged archive would exceed the ceiling, though its files do not', async () => {
    // 900 files of 11,000 bytes is 9,900,000 source bytes, inside the 10 MiB
    // ceiling. Each file costs a 512-byte header plus padding to the next
    // 512-byte block, so the archive lands at 10,599,424 bytes, outside it.
    const entries = Array.from({ length: 900 }, (_, index) =>
      blob(index === 0 ? 'SKILL.md' : `references/entry-${index}.md`, skillBlobSha, 11_000))
    const client = createPublicGithubSourceClient({
      fetch: skillTreeFetch(entries) as unknown as typeof fetch,
    })

    const loaded = await client.load(resolvedSource())

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The files the Skill reads in the Skill folder `skills/demo` pack to 10.11 MiB. The limit is 10 MiB.',
    })
  })

  it('names the text file over the one-file limit and its size', async () => {
    const entries = [
      blob('SKILL.md', skillBlobSha, skillText.length),
      blob('references/api.md', skillBlobSha, 2_153_066),
    ]
    const client = createPublicGithubSourceClient({
      fetch: skillTreeFetch(entries) as unknown as typeof fetch,
    })

    const loaded = await client.load(resolvedSource())

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The file `references/api.md` is 2.06 MiB. The limit for one file is 2 MiB.',
      findings: ['references/api.md: 2,153,066 bytes'],
    })
  })

  it('says that a root Skill counts every file in the Repository', async () => {
    const entries = [
      blob('SKILL.md', skillBlobSha, skillText.length),
      blob('docs/data/catalog.json', skillBlobSha, 2_479_001),
    ]
    const client = createPublicGithubSourceClient({
      fetch: rootTreeFetch(entries) as unknown as typeof fetch,
    })

    const loaded = await client.load({ ...resolvedSource(), skillPath: '.' })

    expect(loaded).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The file `docs/data/catalog.json` is 2.37 MiB. The limit for one file is 2 MiB. The Skill folder is the Repository root, so every file in the Repository counts.',
    })
  })
})

describe('a Skill with media over the size limits', () => {
  it('leaves each media file over the one-file limit out and delivers the rest', async () => {
    // latent-spaces/brag/brag: its films use four music files of 2.01 to 3.76 MiB.
    const served = servedSkill([
      ['assets/music/track-1.mp3', 2_107_000],
      ['assets/music/track-2.mp3', 3_936_384],
      ['scripts/render.ts', 4_000],
      ['scripts/KimiXlsx', 2_200_000],
    ])

    const loaded = await createPublicGithubSourceClient({ fetch: served as unknown as typeof fetch }).load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => file.path)).toEqual(['SKILL.md', 'scripts/render.ts'])
    expect(loaded.value.omitted).toEqual([
      omission('assets/music/track-1.mp3', 2_107_000),
      omission('assets/music/track-2.mp3', 3_936_384),
      omission('scripts/KimiXlsx', 2_200_000),
    ])
  })

  it('leaves the largest media out until the folder fits', async () => {
    // tt-a1i/archify packs to 10.36 MiB with its example renders.
    const served = servedSkill([
      ['references/guide.md', 1_500_000],
      ...Array.from({ length: 6 }, (_, index) => [`examples/render-${index}.png`, 1_600_000 + index * 1_000] as const),
    ])

    const loaded = await createPublicGithubSourceClient({ fetch: served as unknown as typeof fetch }).load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.omitted).toEqual([omission('examples/render-5.png', 1_605_000)])
    expect(loaded.value.files.map(file => file.path)).toContain('references/guide.md')
    expect(loaded.value.files).toHaveLength(7)
  })

  it('leaves example and test files out before it refuses the text a Skill reads', async () => {
    // tt-a1i/archify packs to 10.36 MiB, all text: five rendered examples of
    // about 760 KB each and its test suite sit beside the scripts it runs.
    const served = servedSkill([
      ['assets/template.html', 727_976],
      ...Array.from({ length: 5 }, (_, index) => [`scripts/module-${index}.mjs`, 1_200_000] as const),
      ...Array.from({ length: 5 }, (_, index) => [`examples/render-${index}.html`, 760_000 + index] as const),
      ['test/cli.test.mjs', 201_323],
    ])

    const loaded = await createPublicGithubSourceClient({ fetch: served as unknown as typeof fetch }).load(resolvedSource())

    expect(loaded._tag).toBe('loaded')
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.omitted.map(file => file.path)).toEqual(['examples/render-4.html'])
    expect(loaded.value.files.map(file => file.path)).toContain('assets/template.html')
  })

  it('leaves media out of a root Skill, so the README images never block it', async () => {
    const served = servedSkill([['docs/assets/interactive-motion.gif', 2_479_001]], 'root')

    const loaded = await createPublicGithubSourceClient({ fetch: served as unknown as typeof fetch })
      .load({ ...resolvedSource(), skillPath: '.' })

    expect(loaded).toMatchObject({
      _tag: 'loaded',
      value: {
        omitted: [{
          path: 'docs/assets/interactive-motion.gif',
          bytes: 2_479_001,
          url: `https://github.com/skilld-dev/skills/blob/${commitSha}/docs/assets/interactive-motion.gif`,
        }],
      },
    })
  })

  function omission(path: string, bytes: number) {
    return { path, bytes, url: `https://github.com/skilld-dev/skills/blob/${commitSha}/skills/demo/${path}` }
  }

  /** A Skill folder whose blobs exist, so a load that keeps a file can read it. */
  function servedSkill(files: ReadonlyArray<readonly [string, number]>, at: 'skills/demo' | 'root' = 'skills/demo') {
    const contents = new Map<string, Buffer>([[skillBlobSha, Buffer.from(skillText)]])
    const entries = [blob('SKILL.md', skillBlobSha, skillText.length)]
    for (const [index, [path, size]] of files.entries()) {
      const bytes = Buffer.alloc(size, index + 1)
      const sha = createHash('sha1').update(`blob ${size}\0`).update(bytes).digest('hex')
      contents.set(sha, bytes)
      entries.push(blob(path, sha, size))
    }
    const tree = at === 'root' ? rootTreeFetch(entries) : skillTreeFetch(entries)
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const sha = String(input).match(/\/git\/blobs\/([a-f0-9]{40})$/)?.[1]
      const bytes = sha ? contents.get(sha) : undefined
      if (!sha || !bytes)
        return await tree(input, init)
      return json({ sha, size: bytes.byteLength, encoding: 'base64', content: bytes.toString('base64') })
    })
  }
})

describe('projected archive size', () => {
  it.each([
    [[10]],
    [[512, 512]],
    [[1, 511, 512, 513, 1024]],
    [Array.from({ length: 200 }, (_, index) => index * 37)],
  ])('matches the bytes the packer writes for %#', (sizes) => {
    const files: ArtifactSourceFile[] = sizes.map((size, index) => ({
      path: `file-${index}.md`,
      mode: 420,
      bytes: new Uint8Array(size),
      gitBlobSha: 'f'.repeat(40),
    }))

    expect(projectedUstarBytes(sizes)).toBe(createDeterministicUstar(files).byteLength)
  })

  it('counts the two trailing blocks for an empty file list', () => {
    expect(projectedUstarBytes([])).toBe(createDeterministicUstar([]).byteLength)
  })
})

function skillEntries(count: number) {
  return Array.from({ length: count }, (_, index) =>
    blob(index === 0 ? 'SKILL.md' : `references/entry-${index}.md`, skillBlobSha, skillText.length))
}

function skillTreeFetch(entries: object[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/repos/skilld-dev/skills'))
      return json(publicRepository())
    if (url.endsWith(`/git/trees/${rootTreeSha}`))
      return json({ sha: rootTreeSha, tree: [tree('skills', skillsTreeSha)] })
    if (url.endsWith(`/git/trees/${skillsTreeSha}`))
      return json({ sha: skillsTreeSha, tree: [tree('demo', skillTreeSha)] })
    if (url.endsWith(`/git/trees/${skillTreeSha}?recursive=1`))
      return json({ sha: skillTreeSha, tree: entries, truncated: false })
    if (url.includes(`/git/blobs/${skillBlobSha}`))
      return json({ sha: skillBlobSha, size: skillText.length, encoding: 'base64', content: btoa(skillText) })
    return json({}, 404)
  })
}

function rootTreeFetch(entries: object[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/repos/skilld-dev/skills'))
      return json(publicRepository())
    if (url.endsWith(`/git/trees/${rootTreeSha}?recursive=1`))
      return json({ sha: rootTreeSha, tree: entries, truncated: false })
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
