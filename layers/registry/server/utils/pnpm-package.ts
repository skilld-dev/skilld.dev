import type { PnpmPackage } from '../../shared/pnpm-package'
import { z } from 'zod'

const packageName = z.string().max(214).regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/)
const manifestSchema = z.object({ name: packageName, private: z.boolean().optional() })
const publishedSchema = z.object({
  name: packageName,
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/),
  repository: z.union([z.string(), z.object({ url: z.string(), directory: z.string().optional() })]),
  dist: z.object({ tarball: z.url() }),
})
const ABSENT = { _tag: 'Absent' } as const
const UNAVAILABLE = { _tag: 'Unavailable' } as const
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024

interface Source { owner: string, repo: string, ref: string, skillPath: string }

/** Inspect published bytes, rather than the AI-derived target_package classification. */
export async function detectPnpmPackage(source: Source, fetcher: typeof fetch): Promise<PnpmPackage> {
  const match = /^(?:(.+)\/)?skills\/([^/]+)\/SKILL\.md$/.exec(source.skillPath)
  if (!match || source.skillPath.split('/').some(part => part === '.' || part === '..' || part.includes('\\')))
    return ABSENT
  const directory = match[1] ?? ''
  // A nested Skill is not one of pnpm's immediate children of skills/.
  if (directory.split('/').includes('skills'))
    return ABSENT
  const skill = match[2]!
  const manifestPath = [directory, 'package.json'].filter(Boolean).join('/')
  const manifestUrl = `https://raw.githubusercontent.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/${encodeURIComponent(source.ref)}/${manifestPath.split('/').map(encodeURIComponent).join('/')}`
  const manifestRead = await readJson(manifestUrl, fetcher)
  if (manifestRead._tag !== 'Read')
    return manifestRead
  const manifest = manifestSchema.safeParse(manifestRead.value)
  if (!manifest.success || manifest.data.private)
    return ABSENT
  const publication = await readJson(`https://registry.npmjs.org/${encodeURIComponent(manifest.data.name)}/latest`, fetcher)
  if (publication._tag !== 'Read')
    return publication
  const published = publishedSchema.safeParse(publication.value)
  if (!published.success || published.data.name !== manifest.data.name)
    return ABSENT
  const repository = published.data.repository
  const repositoryUrl = typeof repository === 'string' ? repository : repository.url
  const identity = /^(?:git\+)?https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/.exec(repositoryUrl)
    ?? /^(?:git\+)?(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/#]+?)(?:\.git)?$/.exec(repositoryUrl)
  if (!identity || identity[1]!.toLowerCase() !== source.owner.toLowerCase() || identity[2]!.toLowerCase() !== source.repo.toLowerCase())
    return ABSENT
  if (typeof repository !== 'string' && repository.directory !== undefined && repository.directory.replace(/^\.\//, '').replace(/\/$/, '') !== directory)
    return ABSENT
  const tarball = new URL(published.data.dist.tarball)
  if (tarball.protocol !== 'https:' || tarball.hostname !== 'registry.npmjs.org' || tarball.port || tarball.username || tarball.password)
    return ABSENT
  const sent = await attempt(fetcher(tarball.href, { redirect: 'manual', signal: AbortSignal.timeout(8000) }))
  if (sent._tag === 'Unavailable')
    return UNAVAILABLE
  const response = sent.value
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    return UNAVAILABLE
  }
  // Bound both network bytes and decompressed bytes before parsing any archive header.
  const compressed = response.body.pipeThrough(byteLimit(MAX_COMPRESSED_BYTES))
  const gunzip = new DecompressionStream('gzip')
  const archive = await attempt(readBounded(compressed.pipeThrough({ writable: gunzip.writable as WritableStream<Uint8Array>, readable: gunzip.readable }), MAX_ARCHIVE_BYTES))
  if (archive._tag === 'Unavailable')
    return UNAVAILABLE
  const bundled = containsSkill(archive.value, `package/skills/${skill}/SKILL.md`)
  if (bundled === null)
    return UNAVAILABLE
  return bundled ? { _tag: 'Found', package: published.data.name, version: published.data.version, skill } : ABSENT
}

type JsonRead = { _tag: 'Read', value: unknown } | typeof ABSENT | typeof UNAVAILABLE

async function readJson(url: string, fetcher: typeof fetch): Promise<JsonRead> {
  const sent = await attempt(fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(4000) }))
  if (sent._tag === 'Unavailable')
    return UNAVAILABLE
  const response = sent.value
  // Transport failures remain retryable. They must never cache a negative package result.
  if (response.status !== 404 && !response.ok) {
    await response.body?.cancel()
    return UNAVAILABLE
  }
  if (response.status === 404) {
    await response.body?.cancel()
    return ABSENT
  }
  if (!response.body)
    return UNAVAILABLE
  const bytes = await attempt(readBounded(response.body, 1024 * 1024))
  if (bytes._tag === 'Unavailable')
    return UNAVAILABLE
  const parsed = await attempt(Promise.resolve().then(() => JSON.parse(new TextDecoder().decode(bytes.value)) as unknown))
  return parsed._tag === 'Read' ? parsed : UNAVAILABLE
}

function attempt<T>(promise: Promise<T>): Promise<{ _tag: 'Read', value: T } | typeof UNAVAILABLE> {
  return promise.then(value => ({ _tag: 'Read' as const, value })).catch(() => {
    // Expected transport, body, and parse failures become a retryable result, never an Absent result.
    return UNAVAILABLE
  })
}

function byteLimit(max: number): TransformStream<Uint8Array, Uint8Array> {
  let size = 0
  return new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength
      if (size > max)
        throw new Error('Package archive exceeds its byte limit.')
      controller.enqueue(chunk)
    },
  })
}

async function readBounded(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream.pipeThrough(byteLimit(max))).arrayBuffer())
}

/** A regular nonempty file only. PAX and GNU path records apply to the next header. */
function containsSkill(bytes: Uint8Array, target: string): boolean | null {
  const decoder = new TextDecoder()
  const text = (start: number, size: number) => decoder.decode(bytes.subarray(start, start + size)).split('\0')[0]!
  let nextPath: string | undefined
  let found = false
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0))
      return found
    const sizeText = text(offset + 124, 12).trim()
    if (!/^[0-7]+$/.test(sizeText))
      return null
    const size = Number.parseInt(sizeText, 8)
    const start = offset + 512
    if (start + Math.ceil(size / 512) * 512 > bytes.length)
      return null
    const checksum = Number.parseInt(text(offset + 148, 8).trim(), 8)
    const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0)
    if (checksum !== sum)
      return null
    const type = String.fromCharCode(header[156]!)
    if (type === 'L') {
      nextPath = text(start, size).replace(/\n$/, '')
    }
    else if (type === 'x') {
      for (let position = start; position < start + size;) {
        const space = bytes.indexOf(32, position)
        if (space < position || space >= start + size)
          return null
        const length = Number(decoder.decode(bytes.subarray(position, space)))
        if (!Number.isSafeInteger(length) || length <= space - position + 1 || position + length > start + size)
          return null
        const record = decoder.decode(bytes.subarray(space + 1, position + length - 1))
        if (record.startsWith('path='))
          nextPath = record.slice(5)
        position += length
      }
    }
    else if (type !== 'g') {
      const prefix = text(offset + 345, 155)
      const path = nextPath ?? [prefix, text(offset, 100)].filter(Boolean).join('/')
      if (path === target)
        found = (type === '0' || type === '\0') && size > 0
      nextPath = undefined
    }
    offset = start + Math.ceil(size / 512) * 512
  }
  return null
}
