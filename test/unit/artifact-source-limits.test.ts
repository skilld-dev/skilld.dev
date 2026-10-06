import type { ArtifactSourceFile } from '../../layers/artifact-delivery/server/utils/github-source'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { completeAttestation, createAttestationStatement, encodeAttestationStatement } from '../../layers/artifact-delivery/server/utils/attestation'
import {
  createPublicGithubSourceClient,
  MAX_LINKED_BYTES,
  PRIVATE_ARTIFACT_LIMITS,
  PUBLIC_ARTIFACT_LIMITS,
  selectArtifactEntries,
} from '../../layers/artifact-delivery/server/utils/github-source'
import { createDeterministicUstar, projectedUstarBytes } from '../../layers/artifact-delivery/server/utils/ustar'

const MIB = 1024 * 1024
const commitSha = '0123456789abcdef0123456789abcdef01234567'
const rootTreeSha = '89abcdef0123456789abcdef0123456789abcdef'
const skillsTreeSha = '1111111111111111111111111111111111111111'
const skillTreeSha = '2222222222222222222222222222222222222222'
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'
const skillBlobSha = gitBlobSha(skillText)
const linking = { ...PUBLIC_ARTIFACT_LIMITS, maxLinkedBytes: MAX_LINKED_BYTES }

describe('public Artifact limits', () => {
  it('packs music over the old 2 MiB file limit, as latent-spaces/brag needs for its films', async () => {
    const loaded = await load([
      ['assets/music/track-1.mp3', 2_107_000],
      ['assets/music/track-2.mp3', 3_936_384],
      ['scripts/render.ts', 4_000],
    ])

    expect(loaded).toMatchObject({ _tag: 'loaded', value: { omitted: [], linked: [] } })
    if (loaded._tag !== 'loaded')
      return
    expect(loaded.value.files.map(file => file.path)).toEqual([
      'SKILL.md',
      'assets/music/track-1.mp3',
      'assets/music/track-2.mp3',
      'scripts/render.ts',
    ])
  })

  it('packs a Skill that fills the 64 MiB archive', () => {
    // 63 files of 1 MiB and SKILL.md pack to 63 MiB and 33 KiB.
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 63 }, (_, index) => [`assets/clip-${index}.mp4`, MIB])), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({ _tag: 'selected', omitted: [], linked: [] })
  })

  it('packs 2,000 files, over the old 900', () => {
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 1999 }, (_, index) => [`references/entry-${index}.md`, 100])), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({ _tag: 'selected', omitted: [] })
    if (selected._tag === 'selected')
      expect(selected.entries).toHaveLength(2000)
  })

  it('leaves files the Skill does not read out, largest first, until 2,000 files remain', () => {
    const selected = selectArtifactEntries(skillWith([
      ...Array.from({ length: 1990 }, (_, index) => [`references/entry-${index}.md`, 100] as const),
      ...Array.from({ length: 20 }, (_, index) => [`assets/frame-${index}.png`, 1_000 + index] as const),
    ]), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected._tag).toBe('selected')
    if (selected._tag !== 'selected')
      return
    expect(selected.entries).toHaveLength(2000)
    expect(selected.omitted.map(entry => entry.path).sort()).toEqual(
      Array.from({ length: 11 }, (_, index) => `assets/frame-${19 - index}.png`).sort(),
    )
  })

  it('refuses more files the Skill reads than the CLI accepts', () => {
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 2000 }, (_, index) => [`references/entry-${index}.md`, 100])), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The Skill folder `skills/demo` has 2,001 files the Skill reads. The limit is 2,000.',
    })
  })

  it('leaves the largest media out until the archive fits 64 MiB, for a CLI without linked files', () => {
    // thvroyal/kimi-skills/kimi-xlsx: one 73 MiB binary beside its scripts.
    const selected = selectArtifactEntries(skillWith([
      ['scripts/KimiXlsx', 77_001_601],
      ['scripts/run.py', 4_000],
    ]), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'selected',
      omitted: [{ path: 'scripts/KimiXlsx', size: 77_001_601 }],
      linked: [],
    })
  })

  it('refuses text the Skill reads that packs over 64 MiB', () => {
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 5 }, (_, index) => [`references/part-${index}.md`, 14 * MIB])), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The files the Skill reads in the Skill folder `skills/demo` pack to 70.01 MiB. The limit is 64 MiB.',
    })
  })

  it('refuses a file list too long to sign in one D1 row', () => {
    // Each path is 238 bytes, the most a USTAR header holds is 256.
    const folder = `references/${'d'.repeat(130)}`
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 1500 }, (_, index) => [`${folder}/${'n'.repeat(85)}-${String(index).padStart(4, '0')}.md`, 10])), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({ _tag: 'rejected', code: 'INVALID_SOURCE' })
    if (selected._tag === 'rejected')
      expect(selected.summary).toMatch(/too long to sign/)
  })

  it('refuses a path the Artifact format cannot hold before it reads a byte', () => {
    // cat-xierluo/legal-skills: a file name of 106 UTF-8 bytes.
    const path = `references/case-types/61-${'暂时解除乘坐飞机、高铁限制措施申请'.repeat(2)}书.md`
    const selected = selectArtifactEntries(skillWith([[path, 1_000]]), 'skills/demo', PUBLIC_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'A Skill path cannot be represented by the Artifact format.',
      findings: [path],
    })
  })

  it('leaves media out of a root Skill, so the README images never block it', async () => {
    const loaded = await load([['docs/assets/interactive-motion.gif', 70 * MIB]], 'root')

    expect(loaded).toMatchObject({
      _tag: 'loaded',
      value: {
        omitted: [{
          path: 'docs/assets/interactive-motion.gif',
          bytes: 70 * MIB,
          url: `https://github.com/skilld-dev/skills/blob/${commitSha}/docs/assets/interactive-motion.gif`,
        }],
      },
    })
  })
})

describe('the D1 row a signed Skill fills', () => {
  it('stays under 2,000,000 bytes for the longest file list a build accepts', async () => {
    // 2,000 files whose paths fill the 448 KiB file list, and 100 KB of check results.
    const pathBytes = Math.floor(448 * 1024 / 2000) - 126 - 1
    const entries = skillWith(Array.from({ length: 1999 }, (_, index) => [`r/${String(index).padStart(4, '0')}-${'p'.repeat(pathBytes - 7)}`, 999_999]))
    const selected = selectArtifactEntries(entries, 'skills/demo', PUBLIC_ARTIFACT_LIMITS)
    expect(selected._tag).toBe('selected')
    if (selected._tag !== 'selected')
      return
    const checkResults = Array.from({ length: 5 }, (_, index) => ({
      name: `check-${index}`,
      version: '1',
      outcome: 'warn' as const,
      required: false,
      summary: 's'.repeat(400),
      findings: Array.from({ length: 40 }, () => 'f'.repeat(500)),
    }))
    const statement = encodeAttestationStatement(createAttestationStatement({
      artifactId: `sha256:${'a'.repeat(64)}`,
      createdAt: new Date(0).toISOString(),
      source: resolvedSource(),
      contentSha256: 'a'.repeat(64),
      contentBytes: 1,
      files: selected.entries.map(entry => ({ path: entry.path, mode: 420, size: entry.size, sha256: 'b'.repeat(64) })),
      checkResults,
    }))
    const attestation = JSON.stringify(completeAttestation(statement, { algorithm: 'Ed25519', keyId: 'skilld-production-2026-08', value: 'C'.repeat(86) }))
    const row = [JSON.stringify(checkResults), statement, attestation].reduce((total, column) => total + Buffer.byteLength(column), 0)

    expect(Buffer.byteLength(JSON.stringify(checkResults))).toBeGreaterThan(100_000)
    expect(row).toBeLessThan(2_000_000)
  })
})

describe('linked files', () => {
  it('links the largest files instead of leaving them out, for a CLI that reads them', async () => {
    const loaded = await load([
      ['scripts/KimiXlsx', 77_001_601],
      ['scripts/run.py', 4_000],
    ], 'skills/demo', true)

    expect(loaded).toMatchObject({
      _tag: 'loaded',
      value: {
        omitted: [],
        linked: [{ path: 'scripts/KimiXlsx', mode: 420, size: 77_001_601 }],
      },
    })
    if (loaded._tag === 'loaded')
      expect(loaded.value.files.map(file => file.path)).toEqual(['SKILL.md', 'scripts/run.py'])
  })

  it('links text the Skill reads when that is what keeps the archive over 64 MiB', () => {
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 5 }, (_, index) => [`references/part-${index}.md`, 14 * MIB])), 'skills/demo', linking)

    expect(selected._tag).toBe('selected')
    // Equal sizes leave in path order, so one commit always links the same file.
    if (selected._tag === 'selected')
      expect(selected.linked.map(entry => entry.path)).toEqual(['references/part-0.md'])
  })

  it('never links SKILL.md', () => {
    const selected = selectArtifactEntries([blob('SKILL.md', skillBlobSha, 70 * MIB)], 'skills/demo', linking)

    expect(selected).toMatchObject({ _tag: 'rejected', code: 'INVALID_SOURCE' })
  })

  it('leaves media out once the linked bytes reach their limit', () => {
    const selected = selectArtifactEntries(skillWith([
      ...Array.from({ length: 3 }, (_, index) => [`assets/film-${index}.mp4`, 95 * MIB] as const),
      ['assets/poster.png', 30 * MIB],
    ]), 'skills/demo', linking)

    expect(selected._tag).toBe('selected')
    if (selected._tag !== 'selected')
      return
    expect(selected.linked.map(entry => entry.path)).toEqual(['assets/film-0.mp4', 'assets/film-1.mp4'])
    expect(selected.omitted.map(entry => entry.path)).toEqual(['assets/film-2.mp4'])
    expect(selected.entries.map(entry => entry.path)).toEqual(['SKILL.md', 'assets/poster.png'])
  })

  it('links nothing when the Skill fits, so every CLI gets the same Artifact', () => {
    const selected = selectArtifactEntries(skillWith([['assets/track.mp3', 4 * MIB]]), 'skills/demo', linking)

    expect(selected).toMatchObject({ _tag: 'selected', linked: [], omitted: [] })
  })
})

describe('private Artifact limits', () => {
  it('names the text file over the one-file limit and its size', () => {
    const selected = selectArtifactEntries(skillWith([['references/api.md', 2_153_066]]), 'skills/demo', PRIVATE_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'The file `references/api.md` is 2.06 MiB. The limit for one file is 2 MiB.',
      findings: ['references/api.md: 2,153,066 bytes'],
    })
  })

  it('says that a root Skill counts every file in the Repository', () => {
    const selected = selectArtifactEntries(skillWith([['docs/data/catalog.json', 2_479_001]]), '.', PRIVATE_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'rejected',
      summary: 'The file `docs/data/catalog.json` is 2.37 MiB. The limit for one file is 2 MiB. The Skill folder is the Repository root, so every file in the Repository counts.',
    })
  })

  it('leaves media over 2 MiB out and keeps the 10 MiB archive limit', () => {
    const selected = selectArtifactEntries(skillWith([
      ['assets/music/track.mp3', 3_936_384],
      ['references/guide.md', 1_500_000],
      ...Array.from({ length: 6 }, (_, index) => [`examples/render-${index}.png`, 1_600_000 + index * 1_000] as const),
    ]), 'skills/demo', PRIVATE_ARTIFACT_LIMITS)

    expect(selected._tag).toBe('selected')
    if (selected._tag === 'selected')
      expect(selected.omitted.map(entry => entry.path)).toEqual(['assets/music/track.mp3', 'examples/render-5.png'])
  })

  it('keeps the 900 file limit', () => {
    const selected = selectArtifactEntries(skillWith(Array.from({ length: 900 }, (_, index) => [`references/entry-${index}.md`, 100])), 'skills/demo', PRIVATE_ARTIFACT_LIMITS)

    expect(selected).toMatchObject({
      _tag: 'rejected',
      summary: 'The Skill folder `skills/demo` has 901 files the Skill reads. The limit is 900.',
    })
  })
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

/** Loads a public Skill folder of these sizes. A load reads the tree only. */
async function load(files: ReadonlyArray<readonly [string, number]>, at: 'skills/demo' | 'root' = 'skills/demo', linkedFiles = false) {
  const entries = skillWith(files)
  const fetch = at === 'root' ? rootTreeFetch(entries) : skillTreeFetch(entries)
  const client = createPublicGithubSourceClient({ fetch: fetch as unknown as typeof globalThis.fetch })
  return await client.load(at === 'root' ? { ...resolvedSource(), skillPath: '.' } : resolvedSource(), { linkedFiles })
}

function skillWith(files: ReadonlyArray<readonly [string, number]>) {
  return [
    blob('SKILL.md', skillBlobSha, skillText.length),
    ...files.map(([path, size], index) => blob(path, createHash('sha1').update(`${path}\0${index}`).digest('hex'), size)),
  ]
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
  return { path, mode: '040000', type: 'tree' as const, sha }
}

function blob(path: string, sha: string, size: number) {
  return { path, mode: '100644', type: 'blob' as const, sha, size }
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
