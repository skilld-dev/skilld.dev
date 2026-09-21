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
      summary: 'The Skill has more than 900 files.',
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
      summary: 'The packaged Skill would exceed 10485760 bytes.',
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
