import { gzipSync } from 'node:zlib'

const BLOCK_SIZE = 512

export interface TarFixtureEntry {
  path: string
  bytes?: Uint8Array
  /** Octal string as GitHub writes it, for example `0000664`. */
  mode?: string
  /** `0` file, `5` directory, `2` symbolic link. */
  typeflag?: string
  linkname?: string
}

/**
 * Builds a gzipped tar the way codeload does: every path under one top level
 * directory, file modes widened to 0664 and 0775.
 */
export function tarGzFixture(topLevel: string, entries: TarFixtureEntry[], options: { globalComment?: string } = {}): Uint8Array {
  const blocks: Uint8Array[] = []
  if (options.globalComment !== undefined) {
    // GitHub opens every archive with a pax global header that names the commit.
    const record = paxRecord('comment', options.globalComment)
    blocks.push(header('pax_global_header', record.byteLength, '0000666', 'g', ''))
    const padded = new Uint8Array(Math.ceil(record.byteLength / BLOCK_SIZE) * BLOCK_SIZE)
    padded.set(record)
    blocks.push(padded)
  }
  for (const entry of entries) {
    const bytes = entry.bytes ?? new Uint8Array(0)
    const typeflag = entry.typeflag ?? '0'
    const mode = entry.mode ?? (typeflag === '5' ? '0000775' : '0000664')
    blocks.push(header(`${topLevel}/${entry.path}`, bytes.byteLength, mode, typeflag, entry.linkname ?? ''))
    if (bytes.byteLength > 0) {
      const padded = new Uint8Array(Math.ceil(bytes.byteLength / BLOCK_SIZE) * BLOCK_SIZE)
      padded.set(bytes)
      blocks.push(padded)
    }
  }
  blocks.push(new Uint8Array(BLOCK_SIZE * 2))
  let size = 0
  for (const block of blocks)
    size += block.byteLength
  const tar = new Uint8Array(size)
  let offset = 0
  for (const block of blocks) {
    tar.set(block, offset)
    offset += block.byteLength
  }
  return new Uint8Array(gzipSync(tar))
}

export function streamOf(bytes: Uint8Array, chunkSize = 1024): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

function paxRecord(key: string, value: string): Uint8Array {
  const body = ` ${key}=${value}\n`
  let length = body.length + 1
  while (`${length}${body}`.length !== length)
    length++
  return new TextEncoder().encode(`${length}${body}`)
}

function header(path: string, size: number, mode: string, typeflag: string, linkname: string): Uint8Array {
  const block = new Uint8Array(BLOCK_SIZE)
  const encoder = new TextEncoder()
  const encodedPath = encoder.encode(path)
  if (encodedPath.byteLength > 100)
    throw new Error(`Tar fixture path exceeds 100 bytes: ${path}`)
  block.set(encodedPath, 0)
  block.set(encoder.encode(mode.padStart(7, '0')), 100)
  block.set(encoder.encode('0000000'), 108)
  block.set(encoder.encode('0000000'), 116)
  block.set(encoder.encode(size.toString(8).padStart(11, '0')), 124)
  block.set(encoder.encode('00000000000'), 136)
  block.fill(0x20, 148, 156)
  block.set(encoder.encode(typeflag), 156)
  block.set(encoder.encode(linkname), 157)
  block.set(encoder.encode('ustar\0'), 257)
  block.set(encoder.encode('00'), 263)
  let checksum = 0
  for (const byte of block)
    checksum += byte
  block.set(encoder.encode(checksum.toString(8).padStart(6, '0')), 148)
  block[154] = 0
  block[155] = 0x20
  return block
}
