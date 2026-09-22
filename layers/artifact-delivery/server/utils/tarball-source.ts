import type { ArtifactSourceFile } from './github-source'
import { gitBlobShaHex } from './encoding'

const BLOCK_SIZE = 512
const REGULAR_FILE_TYPEFLAGS = new Set(['0', '\0'])
const PAX_EXTENDED = 'x'
const PAX_GLOBAL = 'g'
const GNU_LONG_NAME = 'L'
const GNU_LONG_LINK = 'K'

/**
 * One file the Git tree lists for this Skill. The tree is the authority for
 * the path, the mode and the bytes: a GitHub tarball widens every file mode to
 * 0664 or 0775, so a tar header can never decide whether a file is executable.
 */
export interface TarballWantedFile {
  /** Path relative to the Skill directory. */
  path: string
  gitBlobSha: string
  size: number
  mode: 420 | 493
}

export type TarballUnusableReason
  = 'archive-too-large'
    | 'unavailable'
    | 'digest-mismatch'
    | 'duplicate-path'
    | 'malformed-archive'
    | 'missing-files'
    | 'size-mismatch'

export type TarballExtraction
  = { _tag: 'extracted', files: ArtifactSourceFile[] }
    | { _tag: 'unusable', reason: TarballUnusableReason, findings: string[] }

export interface TarballExtractionRequest {
  /** The gzipped tar bytes, as GitHub streams them. */
  body: ReadableStream<Uint8Array>
  /** `.` for a Skill at the Repository root, otherwise the Skill directory. */
  skillPath: string
  entries: readonly TarballWantedFile[]
  maxUncompressedBytes: number
}

/**
 * Streams a Repository tarball and keeps only the files the Git tree lists for
 * one Skill, discarding every other entry as it passes.
 *
 * Every kept file is verified against its Git blob digest, so the archive is
 * an untrusted byte source: nothing it returns can differ from what the Git
 * tree already named. Any defect makes the whole archive unusable rather than
 * producing a partial Skill, because a partial Skill would be signed.
 */
export async function extractSkillFilesFromTarball(
  request: TarballExtractionRequest,
): Promise<TarballExtraction> {
  const wanted = new Map(request.entries.map(entry => [entry.path, entry]))
  const found = new Map<string, ArtifactSourceFile>()
  // `DecompressionStream` declares its writable side as `BufferSource`, which
  // the `ReadableStream<Uint8Array>` pipe signature refuses. Both sides carry
  // `Uint8Array` at runtime.
  const gunzip = new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
  const reader = request.body.pipeThrough(gunzip).getReader()
  const source = createByteSource(reader, request.maxUncompressedBytes)

  try {
    let pendingLongName: string | null = null
    while (true) {
      const header = await source.exact(BLOCK_SIZE)
      if (header._tag !== 'bytes')
        return await finish(source, header, found, wanted)
      if (isZeroBlock(header.value))
        continue

      const parsed = parseHeader(header.value)
      const padded = roundToBlock(parsed.size)

      if (parsed.typeflag === GNU_LONG_NAME || parsed.typeflag === GNU_LONG_LINK) {
        const body = await source.exact(padded)
        if (body._tag !== 'bytes')
          return await finish(source, body, found, wanted)
        if (parsed.typeflag === GNU_LONG_NAME)
          pendingLongName = readString(body.value.subarray(0, parsed.size))
        continue
      }
      if (parsed.typeflag === PAX_EXTENDED || parsed.typeflag === PAX_GLOBAL) {
        const body = await source.exact(padded)
        if (body._tag !== 'bytes')
          return await finish(source, body, found, wanted)
        if (parsed.typeflag === PAX_EXTENDED)
          pendingLongName = readPaxPath(body.value.subarray(0, parsed.size)) ?? pendingLongName
        continue
      }

      const name = pendingLongName ?? parsed.name
      pendingLongName = null
      const relative = skillRelativePath(name, request.skillPath)
      const want = relative && REGULAR_FILE_TYPEFLAGS.has(parsed.typeflag)
        ? wanted.get(relative)
        : undefined
      if (!want) {
        const skipped = await source.skip(padded)
        if (skipped._tag !== 'bytes')
          return await finish(source, skipped, found, wanted)
        continue
      }
      if (found.has(want.path))
        return await unusable(source, 'duplicate-path', [want.path])
      if (parsed.size !== want.size)
        return await unusable(source, 'size-mismatch', [want.path])

      const body = await source.exact(padded)
      if (body._tag !== 'bytes')
        return await finish(source, body, found, wanted)
      const bytes = new Uint8Array(body.value.subarray(0, want.size))
      const digest = await gitBlobShaHex(bytes)
      if (digest !== want.gitBlobSha)
        return await unusable(source, 'digest-mismatch', [want.path])
      found.set(want.path, {
        path: want.path,
        mode: want.mode,
        bytes,
        gitBlobSha: want.gitBlobSha,
      })
    }
  }
  catch (thrown) {
    // A corrupt gzip member or a truncated body throws here. The reason and
    // the message travel back to the caller, which falls back to the per-blob
    // path rather than failing the build.
    await source.cancel()
    return { _tag: 'unusable', reason: 'malformed-archive', findings: [String(thrown)] }
  }
}

type SourceRead
  = { _tag: 'bytes', value: Uint8Array }
    | { _tag: 'end' }
    | { _tag: 'too-large' }
    | { _tag: 'truncated' }

interface ByteSource {
  exact: (size: number) => Promise<SourceRead>
  skip: (size: number) => Promise<SourceRead>
  cancel: () => Promise<void>
}

function createByteSource(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): ByteSource {
  let carry: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let ended = false
  let total = 0
  let cancelled = false

  const pull = async (): Promise<SourceRead> => {
    const next = await reader.read()
    if (next.done) {
      ended = true
      return { _tag: 'end' }
    }
    total += next.value.byteLength
    if (total > maxBytes)
      return { _tag: 'too-large' }
    return { _tag: 'bytes', value: next.value }
  }

  const cancel = async (): Promise<void> => {
    if (cancelled)
      return
    cancelled = true
    // A cancelled body is the point of the ceiling: the rest is never read.
    await reader.cancel().catch(() => {
      // The stream is already closed or errored, which needs no handling here.
    })
  }

  return {
    cancel,
    async exact(size) {
      if (carry.byteLength >= size) {
        const value = carry.subarray(0, size)
        carry = carry.subarray(size)
        return { _tag: 'bytes', value }
      }
      const parts: Uint8Array[] = [carry]
      let have = carry.byteLength
      while (have < size) {
        if (ended)
          return have === 0 ? { _tag: 'end' } : { _tag: 'truncated' }
        const next = await pull()
        if (next._tag === 'too-large')
          return next
        if (next._tag === 'end')
          continue
        if (next._tag === 'truncated')
          return next
        parts.push(next.value)
        have += next.value.byteLength
      }
      const merged = new Uint8Array(have)
      let offset = 0
      for (const part of parts) {
        merged.set(part, offset)
        offset += part.byteLength
      }
      carry = merged.subarray(size)
      return { _tag: 'bytes', value: merged.subarray(0, size) }
    },
    async skip(size) {
      let left = size
      while (left > 0) {
        if (carry.byteLength > 0) {
          const take = Math.min(carry.byteLength, left)
          carry = carry.subarray(take)
          left -= take
          continue
        }
        if (ended)
          return { _tag: 'truncated' }
        const next = await pull()
        if (next._tag === 'too-large' || next._tag === 'truncated')
          return next
        if (next._tag === 'end')
          continue
        carry = next.value
      }
      return { _tag: 'bytes', value: new Uint8Array(0) }
    },
  }
}

async function finish(
  source: ByteSource,
  read: SourceRead,
  found: Map<string, ArtifactSourceFile>,
  wanted: Map<string, TarballWantedFile>,
): Promise<TarballExtraction> {
  if (read._tag === 'too-large')
    return await unusable(source, 'archive-too-large', [])
  if (read._tag === 'truncated')
    return await unusable(source, 'malformed-archive', ['The archive ended inside an entry.'])
  const missing = [...wanted.keys()].filter(path => !found.has(path)).sort(comparePath)
  if (missing.length > 0)
    return await unusable(source, 'missing-files', missing)
  await source.cancel()
  return {
    _tag: 'extracted',
    files: [...found.values()].sort((left, right) => comparePath(left.path, right.path)),
  }
}

async function unusable(
  source: ByteSource,
  reason: TarballUnusableReason,
  findings: string[],
): Promise<TarballExtraction> {
  await source.cancel()
  return { _tag: 'unusable', reason, findings }
}

interface TarHeader {
  name: string
  size: number
  typeflag: string
}

function parseHeader(block: Uint8Array): TarHeader {
  const name = readString(block.subarray(0, 100))
  const prefix = readString(block.subarray(345, 500))
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size: readOctal(block.subarray(124, 136)),
    typeflag: String.fromCharCode(block[156]!),
  }
}

/**
 * GitHub wraps every archive in one directory named for the Repository and the
 * short commit, so the first path segment carries no meaning.
 */
function skillRelativePath(path: string, skillPath: string): string | null {
  const separator = path.indexOf('/')
  if (separator === -1)
    return null
  const stripped = path.slice(separator + 1)
  if (skillPath === '.')
    return stripped === '' ? null : stripped
  if (!stripped.startsWith(`${skillPath}/`))
    return null
  const relative = stripped.slice(skillPath.length + 1)
  return relative === '' ? null : relative
}

function readPaxPath(record: Uint8Array): string | null {
  const text = new TextDecoder().decode(record)
  for (const line of text.split('\n')) {
    const match = /^\d+ path=(.*)$/.exec(line)
    if (match)
      return match[1]!
  }
  return null
}

function readString(bytes: Uint8Array): string {
  let end = 0
  while (end < bytes.byteLength && bytes[end] !== 0)
    end++
  return new TextDecoder().decode(bytes.subarray(0, end))
}

function readOctal(bytes: Uint8Array): number {
  let text = ''
  for (const byte of bytes) {
    if (byte === 0 || byte === 0x20)
      break
    text += String.fromCharCode(byte)
  }
  const value = text.length === 0 ? 0 : Number.parseInt(text, 8)
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every(byte => byte === 0)
}

function roundToBlock(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
}

function comparePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
