import type { FileSink, PackedFile, ReadOutcome, SkillFileReader } from './artifact-pack'
import type { SourceRejection } from './github-source'
import { fetchNoRedirect } from './fetch-no-redirect'
import { compareArtifactPaths } from './ustar'

const ARCHIVE_HOST = 'https://codeload.github.com'
const FILE_HOST = 'https://raw.githubusercontent.com'
/**
 * One pass over a Repository archive. Measured 2026-10-07 from a home
 * connection: codeload served PostHog/posthog (191 MiB gzipped) in 26 s and
 * n8n-io/n8n (54 MiB) in 7 s, about 8 MB/s while it builds the archive. The
 * queue consumer may run for 15 minutes.
 */
const ARCHIVE_PASS_TIMEOUT_MS = 5 * 60_000
/** A file read from GitHub gets 30 seconds plus one second for each MiB. */
const GITHUB_FILE_BASE_TIMEOUT_MS = 30_000
/** A pax record or GNU long name holds one path. Anything longer is not an archive GitHub wrote. */
const MAX_HEADER_RECORD_BYTES = 1024 * 1024
const BLOCK_SIZE = 512

/**
 * Files a build may still read from GitHub one by one. Each costs one Worker
 * subrequest, and a build has 1,000 for everything. A store that reads the
 * files again spends the same reads twice, so one budget covers every pass.
 */
export interface GithubReadBudget {
  githubReads: number
}

export interface ArchiveReport {
  reason: 'unavailable' | 'too-large' | 'other-commit' | 'malformed'
  detail: string
}

/**
 * Reads the packed files of one Skill from the Repository archive at the
 * exact commit, as codeload streams it.
 *
 * Nothing is buffered beyond one network chunk: entries outside the Skill
 * folder are skipped as they pass, each Skill file goes to the sink chunk by
 * chunk, and the request is cancelled after the last Skill file. A file the
 * archive leaves out, or holds with another size, is read from GitHub at the
 * same commit in its place, so the sink still receives Artifact order. The
 * sink checks every file against its Git blob digest, so neither host is
 * trusted for content.
 */
export function createGithubArchiveReader(input: {
  fetch: typeof globalThis.fetch
  owner: string
  repository: string
  commitSha: string
  skillPath: string
  /** In Artifact order. */
  files: readonly PackedFile[]
  /** Uncompressed archive bytes one pass reads at most. */
  maxArchiveBytes: number
  budget: GithubReadBudget
  gunzip?: (body: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>
  report?: (report: ArchiveReport) => void
  /** Unix seconds, for the retry time a rate limit names. */
  now?: () => number
}): SkillFileReader {
  const now = input.now ?? (() => Math.floor(Date.now() / 1000))
  const gunzip = input.gunzip ?? gunzipStream
  const repositoryPath = (path: string) => input.skillPath === '.' ? path : `${input.skillPath}/${path}`
  const encodedRepository = `${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`

  const readFromGithub = async (file: PackedFile, sink: FileSink): Promise<ReadOutcome | null> => {
    if (input.budget.githubReads <= 0) {
      return rejection(
        'SOURCE_UNAVAILABLE',
        'The Repository archive left out more Skill files than one build can read one by one.',
        [file.path],
      )
    }
    input.budget.githubReads--
    const url = `${FILE_HOST}/${encodedRepository}/${input.commitSha}/${repositoryPath(file.path).split('/').map(encodeURIComponent).join('/')}`
    const sent = await fetchNoRedirect(input.fetch, url, {
      headers: { 'User-Agent': 'skilld.dev' },
      signal: AbortSignal.timeout(GITHUB_FILE_BASE_TIMEOUT_MS + Math.ceil(file.size / 1024)),
    }).then(
      fetched => ({ _tag: 'sent' as const, fetched }),
      (error: unknown) => ({ _tag: 'threw' as const, reason: describe(error) }),
    )
    if (sent._tag === 'threw')
      return rejection('SOURCE_UNAVAILABLE', 'GitHub did not serve a Skill file.', [`${file.path}: ${sent.reason}`])
    if (sent.fetched._tag === 'unexpected-redirect')
      return rejection('SOURCE_UNAVAILABLE', 'GitHub redirected a Skill file.', [`${file.path}: ${sent.fetched.status}`])
    const response = sent.fetched.response
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel()
      if (response.status === 429)
        return rateLimited('GitHub refused a Skill file: its rate limit is spent.', file.path, retryAt(response, now()))
      return rejection('SOURCE_UNAVAILABLE', 'GitHub did not serve a Skill file.', [`${file.path}: ${response.status}`])
    }
    await sink.begin(file, 'github')
    const reader = response.body.getReader()
    let received = 0
    while (true) {
      const next = await reader.read().then(
        value => ({ _tag: 'chunk' as const, value }),
        (error: unknown) => ({ _tag: 'failed' as const, reason: describe(error) }),
      )
      if (next._tag === 'failed')
        return rejection('SOURCE_UNAVAILABLE', 'GitHub stopped serving a Skill file.', [`${file.path}: ${next.reason}`])
      if (next.value.done)
        break
      received += next.value.value.byteLength
      await sink.chunk(next.value.value)
      // The sink refuses extra bytes. Stop reading them too.
      if (received > file.size) {
        await reader.cancel().catch(() => {
          // The answer is already wrong. A body that will not close changes nothing.
        })
        break
      }
    }
    const ended = await sink.end()
    return ended._tag === 'mismatch' ? ended : null
  }

  return async (sink, githubFiles) => {
    let next = 0
    /** Reads from GitHub every file that sorts before `path`, or every file left when it is null. */
    const readMissingBefore = async (path: string | null): Promise<ReadOutcome | null> => {
      for (; next < input.files.length; next++) {
        const file = input.files[next]!
        if (path !== null && compareArtifactPaths(repositoryPath(file.path), path) >= 0)
          break
        const outcome = await readFromGithub(file, sink)
        if (outcome)
          return outcome
      }
      return null
    }

    const archive = await openArchive(input, encodedRepository, gunzip, now)
    // Reading every file one by one would meet the same limit.
    if (archive._tag === 'rate-limited')
      return rateLimited('GitHub refused the Repository archive: its rate limit is spent.', '', archive.retryAt)
    if (archive._tag === 'unavailable') {
      input.report?.({ reason: 'unavailable', detail: archive.reason })
    }
    else {
      const entries = archive.entries
      try {
        while (next < input.files.length) {
          const entry = await entries.next()
          if (entry._tag === 'end')
            break
          if (entry._tag === 'stopped') {
            input.report?.({ reason: entry.reason, detail: entry.detail })
            break
          }
          if (entry.type !== 'file') {
            const skipped = await entries.skip(entry.size)
            if (skipped._tag !== 'ok') {
              input.report?.({ reason: skipped._tag === 'too-large' ? 'too-large' : 'malformed', detail: skipped.detail })
              break
            }
            continue
          }
          const missing = await readMissingBefore(entry.path)
          if (missing)
            return missing
          const file = input.files[next]
          if (!file || repositoryPath(file.path) !== entry.path) {
            const skipped = await entries.skip(entry.size)
            if (skipped._tag !== 'ok') {
              input.report?.({ reason: skipped._tag === 'too-large' ? 'too-large' : 'malformed', detail: skipped.detail })
              break
            }
            continue
          }
          if (githubFiles.has(file.path) || entry.size !== file.size) {
            const skipped = await entries.skip(entry.size)
            const outcome = await readFromGithub(file, sink)
            if (outcome)
              return outcome
            next++
            if (skipped._tag !== 'ok') {
              input.report?.({ reason: skipped._tag === 'too-large' ? 'too-large' : 'malformed', detail: skipped.detail })
              break
            }
            continue
          }
          await sink.begin(file, 'archive')
          const forwarded = await entries.forward(entry.size, async bytes => await sink.chunk(bytes))
          const ended = await sink.end()
          if (forwarded._tag !== 'ok') {
            input.report?.({ reason: forwarded._tag === 'too-large' ? 'too-large' : 'malformed', detail: forwarded.detail })
            // The file arrived short. The next pass reads it from GitHub.
            return ended._tag === 'mismatch'
              ? ended
              : { _tag: 'mismatch', path: file.path, origin: 'archive', reason: forwarded.detail }
          }
          if (ended._tag === 'mismatch')
            return ended
          next++
        }
      }
      finally {
        await entries.cancel()
      }
    }
    const rest = await readMissingBefore(null)
    return rest ?? { _tag: 'read' }
  }
}

type OpenedArchive
  = { _tag: 'open', entries: ArchiveEntries }
    | { _tag: 'unavailable', reason: string }
    | { _tag: 'rate-limited', retryAt: number | null }

async function openArchive(
  input: { fetch: typeof globalThis.fetch, commitSha: string, maxArchiveBytes: number },
  encodedRepository: string,
  gunzip: (body: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>,
  now: () => number,
): Promise<OpenedArchive> {
  const sent = await fetchNoRedirect(input.fetch, `${ARCHIVE_HOST}/${encodedRepository}/tar.gz/${input.commitSha}`, {
    headers: { 'User-Agent': 'skilld.dev' },
    signal: AbortSignal.timeout(ARCHIVE_PASS_TIMEOUT_MS),
  }).then(
    fetched => ({ _tag: 'sent' as const, fetched }),
    (error: unknown) => ({ _tag: 'threw' as const, reason: describe(error) }),
  )
  if (sent._tag === 'threw')
    return { _tag: 'unavailable', reason: sent.reason }
  if (sent.fetched._tag === 'unexpected-redirect')
    return { _tag: 'unavailable', reason: `codeload redirected ${sent.fetched.status}` }
  const response = sent.fetched.response
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel()
    if (response.status === 429)
      return { _tag: 'rate-limited', retryAt: retryAt(response, now()) }
    return { _tag: 'unavailable', reason: `codeload returned ${response.status}` }
  }
  return { _tag: 'open', entries: archiveEntries(gunzip(response.body).getReader(), input.commitSha, input.maxArchiveBytes) }
}

type ArchiveEntry
  = { _tag: 'entry', type: 'file' | 'other', path: string, size: number }
    | { _tag: 'end' }
    | { _tag: 'stopped', reason: 'too-large' | 'other-commit' | 'malformed', detail: string }

type BodyRead
  = { _tag: 'ok' }
    | { _tag: 'too-large' | 'malformed', detail: string }

interface ArchiveEntries {
  /** The next entry with a body still to read: a file, or something to skip. */
  next: () => Promise<ArchiveEntry>
  /** Passes one entry body to `each` chunk by chunk, then skips its padding. */
  forward: (size: number, each: (bytes: Uint8Array) => Promise<void>) => Promise<BodyRead>
  skip: (size: number) => Promise<BodyRead>
  cancel: () => Promise<void>
}

type Pulled
  = { _tag: 'bytes', value: Uint8Array }
    | { _tag: 'end' }
    | { _tag: 'too-large' | 'malformed', detail: string }

/**
 * The entries of a GitHub tar archive. GitHub writes ustar headers, a pax
 * global header that names the commit, pax `x` records for long paths, and
 * wraps every path in one directory named for the Repository and commit.
 */
function archiveEntries(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  commitSha: string,
  maxBytes: number,
): ArchiveEntries {
  let carry: Uint8Array = new Uint8Array(0)
  let total = 0
  let cancelled = false

  const pull = async (): Promise<Pulled> => {
    const next = await reader.read().then(
      value => ({ _tag: 'read' as const, value }),
      (error: unknown) => ({ _tag: 'failed' as const, detail: describe(error) }),
    )
    if (next._tag === 'failed')
      return { _tag: 'malformed', detail: next.detail }
    if (next.value.done)
      return { _tag: 'end' }
    total += next.value.value.byteLength
    if (total > maxBytes)
      return { _tag: 'too-large', detail: `The archive passed ${maxBytes.toLocaleString('en-US')} bytes.` }
    return { _tag: 'bytes', value: next.value.value }
  }

  /** Exactly `size` bytes, for a header or a pax record. */
  const exact = async (size: number): Promise<Pulled> => {
    const parts: Uint8Array[] = []
    let have = 0
    while (have < size) {
      if (carry.byteLength === 0) {
        const pulled = await pull()
        if (pulled._tag === 'end')
          return have === 0 ? pulled : { _tag: 'malformed', detail: 'The archive ended inside a header.' }
        if (pulled._tag !== 'bytes')
          return pulled
        carry = pulled.value
      }
      const take = Math.min(size - have, carry.byteLength)
      parts.push(carry.subarray(0, take))
      carry = carry.subarray(take)
      have += take
    }
    if (parts.length === 1)
      return { _tag: 'bytes', value: parts[0]! }
    const merged = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      merged.set(part, offset)
      offset += part.byteLength
    }
    return { _tag: 'bytes', value: merged }
  }

  const forward = async (size: number, each: ((bytes: Uint8Array) => Promise<void>) | null): Promise<BodyRead> => {
    let left = roundToBlock(size)
    let body = size
    while (left > 0) {
      if (carry.byteLength === 0) {
        const pulled = await pull()
        if (pulled._tag === 'end')
          return { _tag: 'malformed', detail: 'The archive ended inside an entry.' }
        if (pulled._tag !== 'bytes')
          return pulled
        carry = pulled.value
      }
      const take = Math.min(left, carry.byteLength)
      const piece = carry.subarray(0, take)
      carry = carry.subarray(take)
      left -= take
      if (each && body > 0) {
        const content = piece.subarray(0, Math.min(body, piece.byteLength))
        body -= content.byteLength
        await each(content)
      }
    }
    return { _tag: 'ok' }
  }

  return {
    async next() {
      let longPath: string | null = null
      while (true) {
        const block = await exact(BLOCK_SIZE)
        if (block._tag === 'end')
          return { _tag: 'end' }
        if (block._tag !== 'bytes')
          return { _tag: 'stopped', reason: block._tag, detail: block.detail }
        const header = block.value
        if (header.every(byte => byte === 0))
          continue
        const size = readOctal(header.subarray(124, 136))
        const typeflag = String.fromCharCode(header[156]!)
        if (size === null)
          return { _tag: 'stopped', reason: 'malformed', detail: 'An archive header has an invalid size.' }
        if (typeflag === 'g' || typeflag === 'x' || typeflag === 'L') {
          if (size > MAX_HEADER_RECORD_BYTES)
            return { _tag: 'stopped', reason: 'malformed', detail: 'An archive header record is too long.' }
          const record = await exact(roundToBlock(size))
          if (record._tag === 'end')
            return { _tag: 'stopped', reason: 'malformed', detail: 'The archive ended inside a header record.' }
          if (record._tag !== 'bytes')
            return { _tag: 'stopped', reason: record._tag, detail: record.detail }
          const text = new TextDecoder().decode(record.value.subarray(0, size))
          if (typeflag === 'g') {
            const comment = paxValue(text, 'comment')
            if (comment !== null && comment !== commitSha)
              return { _tag: 'stopped', reason: 'other-commit', detail: `The archive names commit ${comment.slice(0, 40)}.` }
          }
          else if (typeflag === 'x') {
            longPath = paxValue(text, 'path') ?? longPath
          }
          else {
            longPath = text.replace(/\0[\s\S]*$/, '')
          }
          continue
        }
        const name = longPath ?? headerPath(header)
        longPath = null
        const separator = name.indexOf('/')
        const path = separator === -1 ? '' : name.slice(separator + 1)
        return {
          _tag: 'entry',
          type: (typeflag === '0' || typeflag === '\0') && path !== '' ? 'file' : 'other',
          path,
          size,
        }
      }
    },
    forward: async (size, each) => await forward(size, each),
    skip: async size => await forward(size, null),
    async cancel() {
      if (cancelled)
        return
      cancelled = true
      // Cancelling is the point of stopping early: the rest is never read.
      await reader.cancel().catch(() => {
        // The stream already ended or failed, which needs nothing here.
      })
    },
  }
}

/**
 * The largest write the inflater takes. Gzip shrinks a run of zeros about
 * 1,000 to 1, and an inflater answers each write in full, so one network
 * chunk of 1 MiB could arrive as a gigabyte. Writes of 16 KiB cap that at
 * about 16 MiB.
 */
const INFLATE_WRITE_BYTES = 16 * 1024

function gunzipStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const sliced = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      for (let offset = 0; offset < chunk.byteLength; offset += INFLATE_WRITE_BYTES)
        controller.enqueue(chunk.subarray(offset, offset + INFLATE_WRITE_BYTES))
    },
  }))
  // `DecompressionStream` declares its writable side as `BufferSource`, which
  // the `ReadableStream<Uint8Array>` pipe signature refuses. Both sides carry
  // `Uint8Array` at runtime.
  return sliced.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
}

function headerPath(header: Uint8Array): string {
  const name = readString(header.subarray(0, 100))
  const prefix = readString(header.subarray(345, 500))
  return prefix ? `${prefix}/${name}` : name
}

function paxValue(records: string, key: string): string | null {
  for (const line of records.split('\n')) {
    const match = /^\d+ ([^=]+)=(.*)$/.exec(line)
    if (match?.[1] === key)
      return match[2]!
  }
  return null
}

function readString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end))
}

function readOctal(bytes: Uint8Array): number | null {
  let text = ''
  for (const byte of bytes) {
    if (byte === 0 || byte === 0x20)
      break
    text += String.fromCharCode(byte)
  }
  if (text.length === 0)
    return 0
  if (!/^[0-7]+$/.test(text))
    return null
  const value = Number.parseInt(text, 8)
  return Number.isSafeInteger(value) ? value : null
}

function roundToBlock(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
}

function describe(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 200)
}

/** Unix seconds a `Retry-After` delay names, or null without one. */
function retryAt(response: Response, now: number): number | null {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isSafeInteger(seconds) && seconds > 0 ? now + seconds : null
}

function rateLimited(summary: string, path: string, at: number | null): SourceRejection {
  const limited = rejection('RATE_LIMITED', summary, path ? [path] : [])
  return at === null ? limited : { ...limited, retryAfterSeconds: at }
}

function rejection(code: SourceRejection['code'], summary: string, findings: string[]): SourceRejection {
  return { _tag: 'rejected', code, summary, findings: findings.map(finding => finding.slice(0, 500)) }
}
