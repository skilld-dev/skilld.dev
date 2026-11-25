import { Buffer } from 'node:buffer'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'

const compress = promisify(gzip)
const decompress = promisify(gunzip)
const TREE_CACHE_ENCODING = 'skilld-github-tree-gzip-v1'
const MIN_BYTES = 16 * 1024
const MAX_BYTES = 4 * 1024 * 1024
// Workerd charges backing buffers in chunks. Decoded bytes must still match exactly.
const ZLIB_OUTPUT_HEADROOM = 32 * 1024

export async function encodeGithubTreeCacheValue(value: string): Promise<string> {
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes < MIN_BYTES || bytes > MAX_BYTES)
    return value

  const compressed = await compress(value)
  // Leave out etag and body so a rollback reads this as a cold cache entry.
  const envelope = JSON.stringify({ _skilldCache: TREE_CACHE_ENCODING, bytes, data: Buffer.from(compressed).toString('base64') })
  return envelope.length < bytes ? envelope : value
}

export async function decodeGithubTreeCacheValue(value: unknown): Promise<unknown> {
  if (!value || typeof value !== 'object' || !('_skilldCache' in value) || value._skilldCache !== TREE_CACHE_ENCODING)
    return value

  if (!('bytes' in value) || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes)
    || value.bytes < MIN_BYTES || value.bytes > MAX_BYTES
    || !('data' in value) || typeof value.data !== 'string' || !value.data || value.data.length >= value.bytes) {
    throw new Error('Invalid GitHub tree cache envelope')
  }

  const decoded = await decompress(Buffer.from(value.data, 'base64'), { maxOutputLength: value.bytes + ZLIB_OUTPUT_HEADROOM })
  if (decoded.byteLength !== value.bytes)
    throw new Error('Invalid GitHub tree cache length')
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded)) as unknown
}
