import type { ArtifactSourceFile } from './github-source'
import { splitUstarPath } from './checks'

const BLOCK_SIZE = 512

export function createDeterministicUstar(inputFiles: ArtifactSourceFile[]): Uint8Array {
  const files = [...inputFiles].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const byteLength = files.reduce(
    (total, file) => total + BLOCK_SIZE + roundToBlock(file.bytes.byteLength),
    BLOCK_SIZE * 2,
  )
  const archive = new Uint8Array(byteLength)
  let offset = 0
  for (const file of files) {
    const header = createHeader(file)
    archive.set(header, offset)
    offset += BLOCK_SIZE
    archive.set(file.bytes, offset)
    offset += roundToBlock(file.bytes.byteLength)
  }
  return archive
}

function createHeader(file: ArtifactSourceFile): Uint8Array {
  const path = splitUstarPath(file.path)
  if (!path)
    throw new Error(`Artifact path does not fit USTAR: ${file.path}`)
  const header = new Uint8Array(BLOCK_SIZE)
  writeText(header, 0, 100, path.name)
  writeOctal(header, 100, 8, file.mode)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, file.bytes.byteLength)
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
