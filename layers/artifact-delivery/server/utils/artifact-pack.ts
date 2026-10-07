import type { Hash } from 'node:crypto'
import type { ResolvedSource } from '../schemas/contracts'
import type { CollectedBehaviorHits } from './behavior-review'
import type { ArtifactFileObserver, CheckedArtifactSource } from './checks'
import type { OmittedArtifactFile, SourceRejection } from './github-source'
import type { SymbolicLinkNote } from './symbolic-links'
import { createHash } from 'node:crypto'
import { createBehaviorHitCollector } from './behavior-review'
import { createArtifactCheckScanner } from './checks'
import { projectedUstarBytes, USTAR_END_BYTES, ustarHeader, ustarPadding } from './ustar'

/** One file an Artifact packs, as the Git tree names it. */
export interface PackedFile {
  /** The path inside the Skill folder. */
  path: string
  mode: 420 | 493
  size: number
  gitBlobSha: string
}

/**
 * Where one file's bytes came from: the Repository archive, or GitHub's copy
 * of that one blob. Only archive bytes are worth reading again elsewhere.
 */
export type FileOrigin = 'archive' | 'github'

/** A packed file whose bytes passed their Git digest check. */
export type FileEnd
  = { _tag: 'verified' }
    | { _tag: 'mismatch', path: string, origin: FileOrigin, reason: string }

/** Receives the bytes of each packed file, in Artifact order. */
export interface FileSink {
  begin: (file: PackedFile, origin: FileOrigin) => Promise<void>
  chunk: (bytes: Uint8Array) => Promise<void>
  end: () => Promise<FileEnd>
}

export type ReadOutcome
  = { _tag: 'read' }
    | { _tag: 'mismatch', path: string, origin: FileOrigin, reason: string }
    | SourceRejection

/**
 * Reads every packed file once, in Artifact order, into the sink.
 *
 * `readFromGithub` names files whose archive bytes failed their digest. The
 * reader reads those from GitHub one by one instead.
 */
export type SkillFileReader = (sink: FileSink, readFromGithub: ReadonlySet<string>) => Promise<ReadOutcome>

/**
 * Writes the deterministic USTAR archive of the files as their bytes stream
 * past, and checks each file against its Git blob digest on the way.
 *
 * The output equals `createDeterministicUstar` over the same files. A file
 * that fails its digest ends the read with `mismatch`; the bytes written
 * so far are then wrong, and the caller discards them.
 */
export async function packArtifactFiles(input: {
  files: readonly PackedFile[]
  read: SkillFileReader
  readFromGithub: ReadonlySet<string>
  write: (bytes: Uint8Array) => Promise<void>
  observer?: ArtifactFileObserver
}): Promise<ReadOutcome> {
  let next = 0
  let current: { file: PackedFile, origin: FileOrigin, received: number, digest: Hash, overflow: boolean } | null = null
  const sink: FileSink = {
    async begin(file, origin) {
      const expected = input.files[next]
      if (current || !expected || expected.path !== file.path)
        throw new Error(`An Artifact reader skipped ahead to ${file.path}`)
      current = { file: expected, origin, received: 0, digest: createHash('sha1').update(`blob ${expected.size}\0`), overflow: false }
      input.observer?.begin(expected)
      await input.write(ustarHeader(expected))
    },
    async chunk(bytes) {
      if (!current)
        throw new Error('An Artifact reader sent bytes outside a file')
      if (bytes.byteLength === 0 || current.overflow)
        return
      const room = current.file.size - current.received
      // The archive header already promised the size, so extra bytes never
      // reach the output. The file then fails its check at `end`.
      const kept = bytes.byteLength > room ? bytes.subarray(0, room) : bytes
      current.overflow = bytes.byteLength > room
      current.received += kept.byteLength
      current.digest.update(kept)
      input.observer?.chunk(kept)
      if (kept.byteLength > 0)
        await input.write(kept)
    },
    async end() {
      if (!current)
        throw new Error('An Artifact reader ended no file')
      const { file, origin, received, digest, overflow } = current
      current = null
      if (overflow || received !== file.size)
        return { _tag: 'mismatch', path: file.path, origin, reason: `${received.toLocaleString('en-US')} bytes arrived for a ${file.size.toLocaleString('en-US')} byte blob` }
      if (digest.digest('hex') !== file.gitBlobSha)
        return { _tag: 'mismatch', path: file.path, origin, reason: 'the bytes failed their Git digest check' }
      input.observer?.end()
      const padding = ustarPadding(file.size)
      if (padding > 0)
        await input.write(new Uint8Array(padding))
      next++
      return { _tag: 'verified' }
    },
  }
  const outcome = await input.read(sink, input.readFromGithub)
  if (outcome._tag !== 'read')
    return outcome
  if (current || next !== input.files.length)
    throw new Error(`An Artifact reader stopped after ${next} of ${input.files.length} files`)
  await input.write(new Uint8Array(USTAR_END_BYTES))
  return outcome
}

export interface ScannedArtifact {
  _tag: 'scanned'
  contentSha256: string
  contentBytes: number
  checked: CheckedArtifactSource
  /**
   * The matches of behaviors that need approval, for the behavior review.
   * The build turns them into the `behavior-review` check result.
   */
  behaviorHits: CollectedBehaviorHits
  /** The archive itself, when it is at most `spoolBytes`. Null means a store reads the files again. */
  spool: Uint8Array | null
  /** Files read from GitHub one by one, because their archive bytes failed. */
  readFromGithub: ReadonlySet<string>
}

/**
 * The largest archive a scan keeps in memory, so storing it reads nothing
 * again. The build before streaming held up to 10 MiB of files and their
 * 10 MiB archive at once; this keeps one copy of at most 16 MiB in an
 * isolate of 128 MiB that also serves the site. A larger archive streams
 * from GitHub a second time, straight into R2.
 */
export const ARTIFACT_SPOOL_BYTES = 16 * 1024 * 1024

/**
 * The most times a scan reads the files again. Each pass reads from GitHub
 * one more file whose archive bytes kept their size and failed their digest,
 * as `export-subst` produces. A pass costs one archive request.
 */
const MAX_SCAN_PASSES = 4

/**
 * Reads the files once to learn everything the build signs: the archive
 * digest and size, the file inventory and the check results. Nothing is
 * stored. An archive at most `spoolBytes` long is kept, so storing it reads
 * nothing again.
 */
export async function scanArtifact(input: {
  source: ResolvedSource
  files: readonly PackedFile[]
  read: SkillFileReader
  omitted: OmittedArtifactFile[]
  /** The symbolic links the load followed or left out. The `symbolic-links` check lists them. */
  symbolicLinks: SymbolicLinkNote[]
  spoolBytes: number
}): Promise<ScannedArtifact | SourceRejection> {
  const contentBytes = projectedUstarBytes(input.files.map(file => file.size))
  const readFromGithub = new Set<string>()
  for (let pass = 0; pass < MAX_SCAN_PASSES; pass++) {
    const digest = createHash('sha256')
    const spool = contentBytes <= input.spoolBytes ? new Uint8Array(contentBytes) : null
    let written = 0
    const scanner = createArtifactCheckScanner(input.source)
    const hits = createBehaviorHitCollector()
    const outcome = await packArtifactFiles({
      files: input.files,
      read: input.read,
      readFromGithub,
      observer: {
        begin: (file) => {
          scanner.begin(file)
          hits.begin(file)
        },
        chunk: (bytes) => {
          scanner.chunk(bytes)
          hits.chunk(bytes)
        },
        end: () => {
          scanner.end()
          hits.end()
        },
      },
      write: async (bytes) => {
        digest.update(bytes)
        spool?.set(bytes, written)
        written += bytes.byteLength
      },
    })
    if (outcome._tag === 'rejected')
      return outcome
    if (outcome._tag === 'mismatch') {
      if (outcome.origin === 'github' || readFromGithub.has(outcome.path))
        return digestRejection(outcome.path)
      readFromGithub.add(outcome.path)
      continue
    }
    if (written !== contentBytes)
      throw new Error(`The Artifact packed to ${written} bytes, not the ${contentBytes} it declared`)
    return {
      _tag: 'scanned',
      contentSha256: digest.digest('hex'),
      contentBytes,
      checked: scanner.finish(input.omitted, input.symbolicLinks),
      behaviorHits: hits.finish(),
      spool,
      readFromGithub,
    }
  }
  return {
    _tag: 'rejected',
    code: 'SOURCE_UNAVAILABLE',
    summary: 'The Repository archive kept serving files that fail their Git digest check.',
    findings: [...readFromGithub].slice(0, 100),
  }
}

function digestRejection(path: string): SourceRejection {
  return {
    _tag: 'rejected',
    code: 'INVALID_SOURCE',
    summary: 'A Git blob failed its Git digest check.',
    findings: [path],
  }
}
