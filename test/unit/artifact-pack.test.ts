import type { ResolvedSource } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { FileSink, PackedFile, SkillFileReader } from '../../layers/artifact-delivery/server/utils/artifact-pack'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { packArtifactFiles, scanArtifact } from '../../layers/artifact-delivery/server/utils/artifact-pack'
import { checkArtifactSource } from '../../layers/artifact-delivery/server/utils/checks'
import { compareArtifactPaths, createDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'

const encoder = new TextEncoder()
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'

const source: ResolvedSource = {
  provider: 'github',
  repositoryId: 1,
  owner: 'skilld-dev',
  repository: 'skills',
  visibility: 'public',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  treeSha: '89abcdef0123456789abcdef0123456789abcdef',
  skillPath: 'skills/demo',
}

describe('artifact path order', () => {
  it('orders paths by their UTF-8 bytes, as a Git archive lists them', () => {
    // UTF-16 code units put U+1F600 (a surrogate pair, 0xD83D) before U+FF21
    // (0xFF21). UTF-8 bytes put it after: F0 9F 98 80 against EF BC A1.
    const paths = ['Ａ.md', '\u{1F600}.md', 'a-b/x.md', 'a/y.md', 'a.txt']

    expect([...paths].sort(compareArtifactPaths)).toEqual(['a-b/x.md', 'a.txt', 'a/y.md', 'Ａ.md', '\u{1F600}.md'])
  })
})

describe('streamed Artifact packing', () => {
  it('writes the same bytes as the in-memory packer, whatever the chunk size', async () => {
    const files = skillFiles({
      'SKILL.md': skillText,
      'assets/music/track.mp3': bytesOfLength(300 * 1024 + 7),
      'references/guide.md': 'Read this first.\n',
      'run.sh': '#!/usr/bin/env bash\necho demo\n',
    })

    for (const chunkSize of [7, 511, 512, 64 * 1024]) {
      const written: Uint8Array[] = []
      const outcome = await packArtifactFiles({
        files: files.map(file => file.packed),
        read: memoryReader(files, chunkSize),
        readFromGithub: new Set(),
        write: async (bytes) => {
          written.push(bytes.slice())
        },
      })

      expect(outcome).toEqual({ _tag: 'read' })
      expect(concat(written)).toEqual(createDeterministicUstar(files.map(file => file.source)))
    }
  })

  it('reports a file whose bytes do not match its Git blob digest', async () => {
    const files = skillFiles({ 'SKILL.md': skillText, 'references/guide.md': 'Read this first.\n' })
    const tampered = files.map(file => file.packed.path === 'references/guide.md'
      ? { ...file, bytes: encoder.encode('Read this last.\n') }
      : file)

    const outcome = await packArtifactFiles({
      files: files.map(file => file.packed),
      read: memoryReader(tampered, 4),
      readFromGithub: new Set(),
      write: async () => {},
    })

    expect(outcome).toMatchObject({ _tag: 'mismatch', path: 'references/guide.md' })
  })

  it('reports a file that arrives shorter than its tree entry', async () => {
    const files = skillFiles({ 'SKILL.md': skillText, 'references/guide.md': 'Read this first.\n' })
    const short = files.map(file => file.packed.path === 'references/guide.md'
      ? { ...file, bytes: file.bytes.subarray(0, 4) }
      : file)

    const outcome = await packArtifactFiles({
      files: files.map(file => file.packed),
      read: memoryReader(short, 64),
      readFromGithub: new Set(),
      write: async () => {},
    })

    expect(outcome).toMatchObject({ _tag: 'mismatch', path: 'references/guide.md' })
  })
})

describe('artifact scan', () => {
  it('names the content digest and size of the archive it would store, and keeps a small one', async () => {
    const files = skillFiles({ 'SKILL.md': skillText, 'references/guide.md': 'Read this first.\n' })
    const archive = createDeterministicUstar(files.map(file => file.source))

    const scanned = await scanArtifact({
      source,
      files: files.map(file => file.packed),
      read: memoryReader(files, 3),
      omitted: [],
      spoolBytes: 1024 * 1024,
    })

    expect(scanned).toMatchObject({
      _tag: 'scanned',
      contentSha256: sha256(archive),
      contentBytes: archive.byteLength,
    })
    if (scanned._tag !== 'scanned')
      return
    expect(scanned.spool).toEqual(archive)
    expect(scanned.checked).toEqual(await checkArtifactSource(source, files.map(file => file.source)))
  })

  it('keeps no copy of an archive over the spool size', async () => {
    const files = skillFiles({ 'SKILL.md': skillText, 'assets/clip.mp4': bytesOfLength(4096) })

    const scanned = await scanArtifact({
      source,
      files: files.map(file => file.packed),
      read: memoryReader(files, 1000),
      omitted: [],
      spoolBytes: 2048,
    })

    expect(scanned).toMatchObject({ _tag: 'scanned', spool: null })
  })

  it('reads a file from GitHub again when the archive bytes fail their digest', async () => {
    const files = skillFiles({ 'SKILL.md': skillText, 'references/guide.md': 'Read this first.\n' })
    const asked: Array<ReadonlySet<string>> = []
    // An `export-subst` file keeps its length and changes its bytes in the
    // archive. Only a read from GitHub returns the blob.
    const read: SkillFileReader = async (sink, readFromGithub) => {
      asked.push(new Set(readFromGithub))
      const served = files.map(file => file.packed.path === 'references/guide.md' && !readFromGithub.has(file.packed.path)
        ? { ...file, bytes: encoder.encode('Read this frst!\n') }
        : file)
      return await memoryReader(served, 5)(sink, readFromGithub)
    }

    const scanned = await scanArtifact({ source, files: files.map(file => file.packed), read, omitted: [], spoolBytes: 1024 * 1024 })

    expect(scanned).toMatchObject({ _tag: 'scanned', readFromGithub: new Set(['references/guide.md']) })
    expect(asked.map(paths => [...paths])).toEqual([[], ['references/guide.md']])
  })

  it('refuses a file whose GitHub bytes also fail their digest', async () => {
    const files = skillFiles({ 'SKILL.md': skillText, 'references/guide.md': 'Read this first.\n' })
    const tampered = files.map(file => file.packed.path === 'references/guide.md'
      ? { ...file, bytes: encoder.encode('Read this frst!\n') }
      : file)

    const scanned = await scanArtifact({
      source,
      files: files.map(file => file.packed),
      read: memoryReader(tampered, 5),
      omitted: [],
      spoolBytes: 1024 * 1024,
    })

    expect(scanned).toMatchObject({
      _tag: 'rejected',
      code: 'INVALID_SOURCE',
      summary: 'A Git blob failed its Git digest check.',
      findings: ['references/guide.md'],
    })
  })
})

interface TestFile {
  packed: PackedFile
  source: { path: string, mode: 420 | 493, bytes: Uint8Array, gitBlobSha: string }
  bytes: Uint8Array
}

function skillFiles(contents: Record<string, string | Uint8Array>): TestFile[] {
  return Object.entries(contents)
    .map(([path, content]) => {
      const bytes = typeof content === 'string' ? encoder.encode(content) : content
      const mode = path.endsWith('.sh') ? 493 as const : 420 as const
      const gitBlobSha = gitBlobSha1(bytes)
      return {
        packed: { path, mode, size: bytes.byteLength, gitBlobSha },
        source: { path, mode, bytes, gitBlobSha },
        bytes,
      }
    })
    .sort((left, right) => compareArtifactPaths(left.packed.path, right.packed.path))
}

/** Serves each file in Artifact order, in chunks of one size. */
function memoryReader(files: Array<{ packed: PackedFile, bytes: Uint8Array }>, chunkSize: number): SkillFileReader {
  return async (sink: FileSink, readFromGithub) => {
    for (const file of files) {
      await sink.begin(file.packed, readFromGithub.has(file.packed.path) ? 'github' : 'archive')
      for (let offset = 0; offset < file.bytes.byteLength; offset += chunkSize)
        await sink.chunk(file.bytes.subarray(offset, offset + chunkSize))
      const ended = await sink.end()
      if (ended._tag === 'mismatch')
        return ended
    }
    return { _tag: 'read' }
  }
}

function bytesOfLength(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index++)
    bytes[index] = (index * 31 + 7) % 251
  return bytes
}

function gitBlobSha1(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.byteLength
  }
  return merged
}
