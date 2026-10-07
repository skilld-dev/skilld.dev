import type { ArtifactSourceFile } from './github-source'
import { splitUstarPath } from './checks'
import { gitBlobShaHex } from './encoding'

const BLOCK_SIZE = 512

export function createDeterministicUstar(inputFiles: ArtifactSourceFile[]): Uint8Array {
  const files = [...inputFiles].sort((left, right) => compareArtifactPaths(left.path, right.path))
  const byteLength = files.reduce(
    (total, file) => total + BLOCK_SIZE + roundToBlock(file.bytes.byteLength),
    BLOCK_SIZE * 2,
  )
  const archive = new Uint8Array(byteLength)
  let offset = 0
  for (const file of files) {
    const header = ustarHeader({ path: file.path, mode: file.mode, size: file.bytes.byteLength })
    archive.set(header, offset)
    offset += BLOCK_SIZE
    archive.set(file.bytes, offset)
    offset += roundToBlock(file.bytes.byteLength)
  }
  return archive
}

/**
 * The order of files in an Artifact: by the UTF-8 bytes of their paths.
 *
 * It is the order a Git archive lists a tree in, so a build can stream the
 * Repository tarball and write each Skill file as it passes. All 487
 * tarballs of the 2026-10-07 sweep listed their files in this order. It
 * differs from JavaScript string order only where a path holds a character
 * outside the Basic Multilingual Plane.
 */
export function compareArtifactPaths(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length;) {
    const leftPoint = left.codePointAt(index)!
    const rightPoint = right.codePointAt(index)!
    if (leftPoint !== rightPoint)
      return leftPoint < rightPoint ? -1 : 1
    index += leftPoint > 0xFFFF ? 2 : 1
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1
}

/** The 512-byte USTAR header {@link createDeterministicUstar} writes for one file. */
export function ustarHeader(file: { path: string, mode: 420 | 493, size: number }): Uint8Array {
  const path = splitUstarPath(file.path)
  if (!path)
    throw new Error(`Artifact path does not fit USTAR: ${file.path}`)
  const header = new Uint8Array(BLOCK_SIZE)
  writeText(header, 0, 100, path.name)
  writeOctal(header, 100, 8, file.mode)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, file.size)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  header[156] = 0x30
  writeText(header, 257, 6, 'ustar\0')
  writeText(header, 263, 2, '00')
  writeText(header, 345, 155, path.prefix)
  const checksum = header.reduce((total, byte) => total + byte, 0)
  const encodedChecksum = checksum.toString(8).padStart(6, '0')
  writeText(header, 148, 6, encodedChecksum)
  header[154] = 0
  header[155] = 0x20
  return header
}

function writeText(target: Uint8Array, offset: number, size: number, value: string): void {
  const bytes = new TextEncoder().encode(value)
  if (bytes.byteLength > size)
    throw new Error('USTAR text field exceeded its fixed width')
  target.set(bytes, offset)
}

function writeOctal(target: Uint8Array, offset: number, size: number, value: number): void {
  const encoded = value.toString(8).padStart(size - 1, '0')
  if (encoded.length > size - 1)
    throw new Error('USTAR number exceeded its fixed width')
  writeText(target, offset, size - 1, encoded)
  target[offset + size - 1] = 0
}

function roundToBlock(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
}

/** The zero bytes that pad a file of this size to a whole block. */
export function ustarPadding(size: number): number {
  return roundToBlock(size) - size
}

/** The two zero blocks that close an archive. */
export const USTAR_END_BYTES = BLOCK_SIZE * 2

/**
 * Bytes {@link createDeterministicUstar} will write for files of these sizes.
 *
 * Every file costs a 512-byte header plus its content padded up to the next
 * 512-byte block, and the archive closes with two empty blocks. So the source
 * total understates the archive by up to 1023 bytes per file, which is why a
 * size guard has to run on this number rather than on the sum of the blobs.
 */
export function projectedUstarBytes(sizes: readonly number[]): number {
  return sizes.reduce(
    (total, size) => total + BLOCK_SIZE + roundToBlock(size),
    BLOCK_SIZE * 2,
  )
}

/**
 * The files of an archive {@link createDeterministicUstar} wrote, or null for
 * any other archive.
 *
 * The files must pack back to the exact input bytes. So a stored Artifact
 * yields exactly the files it was packed from, and nothing a lenient parser
 * could read in two ways.
 */
export async function readDeterministicUstar(archive: Uint8Array): Promise<ArtifactSourceFile[] | null> {
  const entries: Array<{ path: string, mode: 420 | 493, bytes: Uint8Array }> = []
  let offset = 0
  while (offset + BLOCK_SIZE <= archive.byteLength) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE)
    if (header.every(byte => byte === 0))
      break
    const name = readText(header, 0, 100)
    const prefix = readText(header, 345, 155)
    const mode = readOctal(header, 100, 8)
    const size = readOctal(header, 124, 12)
    if (size === null || header[156] !== 0x30 || (mode !== 420 && mode !== 493))
      return null
    const start = offset + BLOCK_SIZE
    if (start + size > archive.byteLength)
      return null
    entries.push({ path: prefix ? `${prefix}/${name}` : name, mode, bytes: archive.slice(start, start + size) })
    offset = start + roundToBlock(size)
  }
  const files = await Promise.all(entries.map(async entry => ({ ...entry, gitBlobSha: await gitBlobShaHex(entry.bytes) })))
  const repacked = files.length > 0 ? createDeterministicUstar(files) : null
  return repacked && sameBytes(repacked, archive) ? files : null
}

/** A NUL-terminated field. Invalid UTF-8 decodes lossily and then fails the repack comparison. */
function readText(source: Uint8Array, offset: number, size: number): string {
  const field = source.subarray(offset, offset + size)
  const end = field.indexOf(0)
  return new TextDecoder().decode(field.subarray(0, end === -1 ? size : end))
}

function readOctal(source: Uint8Array, offset: number, size: number): number | null {
  const text = readText(source, offset, size)
  return /^[0-7]+$/.test(text) ? Number.parseInt(text, 8) : null
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}
