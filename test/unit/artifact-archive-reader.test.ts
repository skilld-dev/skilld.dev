import type { FileOrigin, FileSink, PackedFile } from '../../layers/artifact-delivery/server/utils/artifact-pack'
import type { TarFixtureEntry } from '../fixtures/tar-archive'
import { createHash, randomBytes } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createGithubArchiveReader } from '../../layers/artifact-delivery/server/utils/archive-reader'
import { tarGzFixture } from '../fixtures/tar-archive'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const topLevel = `skills-${commitSha}`
const encoder = new TextEncoder()
const archiveUrl = `https://codeload.github.com/skilld-dev/skills/tar.gz/${commitSha}`
const rawBase = `https://raw.githubusercontent.com/skilld-dev/skills/${commitSha}/`

const skill = encoder.encode('---\nname: demo\ndescription: Use this Skill for demo work.\n---\n')
const guide = encoder.encode('Read this first.\n')
const track = bytesOfLength(70_000)

const files: PackedFile[] = [
  packed('SKILL.md', skill),
  packed('assets/track.mp3', track),
  packed('references/guide.md', guide),
]

describe('reading Skill files from the Repository archive', () => {
  it('passes only the Skill folder, in Artifact order, from one archive request', async () => {
    const github = githubFetch({ archive: archiveOf([
      { path: 'README.md', bytes: encoder.encode('# Skills\n') },
      { path: 'skills/demo', typeflag: '5' },
      { path: 'skills/demo/SKILL.md', bytes: skill },
      { path: 'skills/demo/assets/track.mp3', bytes: track },
      { path: 'skills/demo/references/guide.md', bytes: guide },
      { path: 'skills/other/SKILL.md', bytes: skill },
    ]) })

    const read = await readAll(github.fetch)

    expect(read.outcome).toEqual({ _tag: 'read' })
    expect(read.files).toEqual([
      { path: 'SKILL.md', origin: 'archive', bytes: skill },
      { path: 'assets/track.mp3', origin: 'archive', bytes: track },
      { path: 'references/guide.md', origin: 'archive', bytes: guide },
    ])
    expect(github.requested).toEqual([archiveUrl])
  })

  it('stops reading the archive after the last Skill file', async () => {
    const later = Array.from({ length: 50 }, (_, index) => ({ path: `z/${index}.bin`, bytes: bytesOfLength(20_000) }))
    const github = githubFetch({ archive: archiveOf([
      { path: 'skills/demo/SKILL.md', bytes: skill },
      { path: 'skills/demo/assets/track.mp3', bytes: track },
      { path: 'skills/demo/references/guide.md', bytes: guide },
      ...later,
    ]) })

    const read = await readAll(github.fetch)

    expect(read.outcome).toEqual({ _tag: 'read' })
    expect(github.archiveCancelled()).toBe(true)
    // The 50 later entries hold about 1 MB. One network chunk past the Skill is read at most.
    expect(inflated.pulledBytes).toBeLessThan(200_000)
  })

  it('inflates the archive in small writes, so a file of zeros never arrives at once', async () => {
    // 8 MiB of zeros gzips to about 8 KiB: one network chunk could inflate
    // to the whole file. The default inflater is the runtime's own.
    const zeros = new Uint8Array(8 * 1024 * 1024)
    const noise = bytesOfLength(100_000)
    const plan = [packed('SKILL.md', skill), packed('assets/blank.bin', zeros), packed('assets/noise.bin', noise)]
    // One 100 KB response chunk, as a fast network may deliver.
    const archive = archiveOf([
      { path: 'skills/demo/SKILL.md', bytes: skill },
      { path: 'skills/demo/assets/blank.bin', bytes: zeros },
      { path: 'skills/demo/assets/noise.bin', bytes: noise },
    ])
    const largest: number[] = []
    const reader = createGithubArchiveReader({
      fetch: (async () => new Response(archive, { status: 200 })) as unknown as typeof fetch,
      owner: 'skilld-dev',
      repository: 'skills',
      commitSha,
      skillPath: 'skills/demo',
      files: plan,
      linkSources: new Map(),
      maxArchiveBytes: 64 * 1024 * 1024,
      budget: { githubReads: 0 },
    })
    let received = 0
    const outcome = await reader({
      begin: async () => {},
      chunk: async (bytes) => {
        received += bytes.byteLength
        largest.push(bytes.byteLength)
      },
      end: async () => ({ _tag: 'verified' }),
    }, new Set())

    expect(outcome).toEqual({ _tag: 'read' })
    expect(received).toBe(skill.byteLength + zeros.byteLength + noise.byteLength)
    expect(inputWrites.largest).toBeLessThanOrEqual(16 * 1024)
  })

  it('reads a Skill at the Repository root', async () => {
    const github = githubFetch({ archive: archiveOf([
      { path: 'SKILL.md', bytes: skill },
      { path: 'assets/track.mp3', bytes: track },
      { path: 'references/guide.md', bytes: guide },
    ]) })

    const read = await readAll(github.fetch, { skillPath: '.' })

    expect(read.files.map(file => file.path)).toEqual(['SKILL.md', 'assets/track.mp3', 'references/guide.md'])
  })

  it('reads a file the archive left out from GitHub at the exact commit, as export-ignore produces', async () => {
    const github = githubFetch({
      archive: archiveOf([
        { path: 'skills/demo/SKILL.md', bytes: skill },
        { path: 'skills/demo/references/guide.md', bytes: guide },
      ]),
      raw: { 'skills/demo/assets/track.mp3': track },
    })

    const read = await readAll(github.fetch)

    expect(read.outcome).toEqual({ _tag: 'read' })
    expect(read.files.map(file => [file.path, file.origin])).toEqual([
      ['SKILL.md', 'archive'],
      ['assets/track.mp3', 'github'],
      ['references/guide.md', 'archive'],
    ])
    expect(github.requested).toEqual([archiveUrl, `${rawBase}skills/demo/assets/track.mp3`])
  })

  it('reads a file from GitHub when the archive holds another size, as Git LFS or export-subst produce', async () => {
    const github = githubFetch({
      archive: archiveOf([
        { path: 'skills/demo/SKILL.md', bytes: skill },
        { path: 'skills/demo/assets/track.mp3', bytes: encoder.encode('version https://git-lfs.github.com/spec/v1\n') },
        { path: 'skills/demo/references/guide.md', bytes: guide },
      ]),
      raw: { 'skills/demo/assets/track.mp3': track },
    })

    const read = await readAll(github.fetch)

    expect(read.files.find(file => file.path === 'assets/track.mp3')).toEqual({ path: 'assets/track.mp3', origin: 'github', bytes: track })
  })

  it('reads the files it is told to from GitHub, and the rest from the archive', async () => {
    const github = githubFetch({
      archive: archiveOf([
        { path: 'skills/demo/SKILL.md', bytes: skill },
        { path: 'skills/demo/assets/track.mp3', bytes: track },
        { path: 'skills/demo/references/guide.md', bytes: guide },
      ]),
      raw: { 'skills/demo/references/guide.md': guide },
    })

    const read = await readAll(github.fetch, { readFromGithub: new Set(['references/guide.md']) })

    expect(read.files.map(file => [file.path, file.origin])).toEqual([
      ['SKILL.md', 'archive'],
      ['assets/track.mp3', 'archive'],
      ['references/guide.md', 'github'],
    ])
  })

  it('reads every file from GitHub when the archive request fails', async () => {
    const github = githubFetch({
      archiveStatus: 504,
      raw: {
        'skills/demo/SKILL.md': skill,
        'skills/demo/assets/track.mp3': track,
        'skills/demo/references/guide.md': guide,
      },
    })

    const read = await readAll(github.fetch)

    expect(read.outcome).toEqual({ _tag: 'read' })
    expect(read.files.every(file => file.origin === 'github')).toBe(true)
  })

  it('reads the rest from GitHub when the archive passes its byte ceiling first', async () => {
    const github = githubFetch({
      archive: archiveOf([
        { path: 'aaa/huge.bin', bytes: bytesOfLength(200_000) },
        { path: 'skills/demo/SKILL.md', bytes: skill },
        { path: 'skills/demo/assets/track.mp3', bytes: track },
        { path: 'skills/demo/references/guide.md', bytes: guide },
      ]),
      raw: {
        'skills/demo/SKILL.md': skill,
        'skills/demo/assets/track.mp3': track,
        'skills/demo/references/guide.md': guide,
      },
    })

    const read = await readAll(github.fetch, { maxArchiveBytes: 100_000 })

    expect(read.outcome).toEqual({ _tag: 'read' })
    expect(read.files.every(file => file.origin === 'github')).toBe(true)
    expect(github.archiveCancelled()).toBe(true)
  })

  it('refuses when the files left to read one by one pass the request budget', async () => {
    const github = githubFetch({
      archiveStatus: 503,
      raw: {
        'skills/demo/SKILL.md': skill,
        'skills/demo/assets/track.mp3': track,
        'skills/demo/references/guide.md': guide,
      },
    })

    const read = await readAll(github.fetch, { githubReads: 2 })

    expect(read.outcome).toMatchObject({ _tag: 'rejected', code: 'SOURCE_UNAVAILABLE' })
    expect(github.requested.filter(url => url.startsWith(rawBase))).toHaveLength(2)
  })

  it('stops at a rate-limited archive instead of reading every file', async () => {
    const github = githubFetch({ archiveStatus: 429, archiveHeaders: { 'retry-after': '90' }, raw: {} })

    const read = await readAll(github.fetch)

    expect(read.outcome).toMatchObject({ _tag: 'rejected', code: 'RATE_LIMITED' })
    expect(github.requested).toEqual([archiveUrl])
  })

  it('names a failed GitHub read as retryable', async () => {
    const github = githubFetch({ archiveStatus: 503, raw: {}, rawStatus: 502 })

    const read = await readAll(github.fetch)

    expect(read.outcome).toMatchObject({ _tag: 'rejected', code: 'SOURCE_UNAVAILABLE' })
  })

  it('reads every file from GitHub when the archive names another commit', async () => {
    const github = githubFetch({
      archive: archiveOf([
        { path: 'skills/demo/SKILL.md', bytes: skill },
        { path: 'skills/demo/assets/track.mp3', bytes: track },
        { path: 'skills/demo/references/guide.md', bytes: guide },
      ], 'f'.repeat(40)),
      raw: {
        'skills/demo/SKILL.md': skill,
        'skills/demo/assets/track.mp3': track,
        'skills/demo/references/guide.md': guide,
      },
    })

    const read = await readAll(github.fetch)

    expect(read.files.every(file => file.origin === 'github')).toBe(true)
  })

  it('reports the file in progress when the archive breaks inside it', async () => {
    const whole = archiveOf([
      { path: 'skills/demo/SKILL.md', bytes: skill },
      { path: 'skills/demo/assets/track.mp3', bytes: track },
      { path: 'skills/demo/references/guide.md', bytes: guide },
    ])
    const github = githubFetch({ archive: gzipPrefixOf(whole, 40_000) })

    const read = await readAll(github.fetch)

    expect(read.outcome).toMatchObject({ _tag: 'mismatch', path: 'assets/track.mp3', origin: 'archive' })
  })
})

interface ReadFile { path: string, origin: FileOrigin, bytes: Uint8Array }

/** The largest write the runtime's inflater received. */
const inputWrites = { largest: 0 }
const NativeDecompressionStream = globalThis.DecompressionStream
globalThis.DecompressionStream = class extends NativeDecompressionStream {
  constructor(format: CompressionFormat) {
    super(format)
    const writable = this.writable
    const writer = writable.getWriter()
    writer.releaseLock()
    const inner = writable.getWriter.bind(writable)
    Object.defineProperty(this, 'writable', {
      value: new WritableStream<BufferSource>({
        async write(chunk) {
          inputWrites.largest = Math.max(inputWrites.largest, (chunk as Uint8Array).byteLength)
          const target = inner()
          await target.write(chunk)
          target.releaseLock()
        },
        async close() {
          const target = inner()
          await target.close()
        },
        async abort(reason) {
          const target = inner()
          await target.abort(reason)
        },
      }),
    })
  }
} as typeof DecompressionStream

/**
 * Node's `DecompressionStream` reads its whole input before it answers, so it
 * cannot show that a read stopped early. This one inflates the gzip bytes
 * and serves them on demand, as workerd does, and records whether the reader
 * cancelled it. A cut gzip member fails when the reader reaches the cut.
 */
const inflated = {
  cancelled: false,
  pulledBytes: 0,
  stream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    inflated.cancelled = false
    inflated.pulledBytes = 0
    let bytes: Uint8Array | null = null
    let failure: Error | null = null
    let offset = 0
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!bytes && !failure) {
          const gzipped = concat(await Array.fromAsync(body))
          try {
            bytes = new Uint8Array(gunzipSync(gzipped))
          }
          catch {
            bytes = new Uint8Array(gunzipSync(gzipped, { finishFlush: 2 }))
            failure = new Error('unexpected end of file')
          }
        }
        if (offset >= bytes!.byteLength) {
          if (failure)
            controller.error(failure)
          else
            controller.close()
          return
        }
        const chunk = bytes!.slice(offset, offset + 4096)
        offset += chunk.byteLength
        inflated.pulledBytes += chunk.byteLength
        controller.enqueue(chunk)
      },
      cancel() {
        inflated.cancelled = true
      },
    })
  },
}

async function readAll(
  fetcher: typeof fetch,
  options: { skillPath?: string, readFromGithub?: ReadonlySet<string>, maxArchiveBytes?: number, githubReads?: number } = {},
) {
  const reader = createGithubArchiveReader({
    fetch: fetcher,
    owner: 'skilld-dev',
    repository: 'skills',
    commitSha,
    skillPath: options.skillPath ?? 'skills/demo',
    files,
    linkSources: new Map(),
    maxArchiveBytes: options.maxArchiveBytes ?? 64 * 1024 * 1024,
    budget: { githubReads: options.githubReads ?? 100 },
    gunzip: inflated.stream,
  })
  const read: ReadFile[] = []
  let current: { path: string, origin: FileOrigin, parts: Uint8Array[] } | null = null
  const sink: FileSink = {
    async begin(file, origin) {
      current = { path: file.path, origin, parts: [] }
    },
    async chunk(bytes) {
      current!.parts.push(bytes.slice())
    },
    async end() {
      const file = current!
      current = null
      const bytes = concat(file.parts)
      const expected = files.find(candidate => candidate.path === file.path)!
      if (bytes.byteLength !== expected.size)
        return { _tag: 'mismatch', path: file.path, origin: file.origin, reason: 'size' }
      read.push({ path: file.path, origin: file.origin, bytes })
      return { _tag: 'verified' }
    },
  }
  const outcome = await reader(sink, options.readFromGithub ?? new Set())
  return { outcome, files: read }
}

function githubFetch(input: {
  archive?: Uint8Array
  archiveStatus?: number
  archiveHeaders?: Record<string, string>
  raw?: Record<string, Uint8Array>
  rawStatus?: number
}) {
  const requested: string[] = []
  let cancelled = false
  const fetcher = async (request: string | URL | Request): Promise<Response> => {
    const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
    requested.push(url)
    if (url === archiveUrl) {
      if (input.archiveStatus)
        return new Response(null, { status: input.archiveStatus, headers: input.archiveHeaders })
      const bytes = input.archive!
      let offset = 0
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.byteLength) {
            controller.close()
            return
          }
          controller.enqueue(bytes.slice(offset, offset + 4096))
          offset += 4096
        },
        cancel() {
          cancelled = true
        },
      }), { status: 200 })
    }
    if (url.startsWith(rawBase)) {
      if (input.rawStatus)
        return new Response(null, { status: input.rawStatus })
      const path = decodeURIComponent(url.slice(rawBase.length))
      const bytes = input.raw?.[path]
      return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 })
    }
    throw new Error(`Unexpected request ${url}`)
  }
  return { fetch: fetcher as unknown as typeof fetch, requested, archiveCancelled: () => cancelled || inflated.cancelled }
}

/** A GitHub archive: a pax global header naming the commit, then the entries. */
function archiveOf(entries: TarFixtureEntry[], commit = commitSha): Uint8Array {
  return tarGzFixture(topLevel, entries, { globalComment: commit })
}

function gzipPrefixOf(gzipped: Uint8Array, length: number): Uint8Array {
  return gzipped.slice(0, length)
}

function packed(path: string, bytes: Uint8Array): PackedFile {
  return {
    path,
    mode: 420,
    size: bytes.byteLength,
    gitBlobSha: createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex'),
  }
}

/** Bytes gzip cannot shrink, so a cut archive ends inside the file. */
function bytesOfLength(length: number): Uint8Array {
  return new Uint8Array(randomBytes(length))
}

function concat(parts: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.byteLength
  }
  return merged
}
