// Writes every static brand file in public/ from the one mark geometry in
// shared/brand-mark.ts. Other repositories and READMEs link these filenames,
// so the names stay fixed while the drawing changes.
//
// Run: pnpm brand:assets
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { BRAND_DARK, BRAND_LIGHT, BRAND_TILE, lockupSvg, markSvg } from '../shared/brand-mark'

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))

function png(svg: string, size: number): Buffer {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng())
}

/** An ICO container of PNG entries. Every browser that still asks for favicon.ico reads PNG entries. */
function ico(entries: Array<{ size: number, data: Buffer }>): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = 6 + 16 * entries.length
  const directory = entries.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...directory, ...entries.map(entry => entry.data)])
}

function brandFiles(): Record<string, string | Buffer> {
  const tile = markSvg({ colors: BRAND_DARK, tile: BRAND_TILE })
  const smallTile = markSvg({ colors: BRAND_DARK, tile: BRAND_TILE, cut: 'small' })
  return {
    // Browser tabs draw the SVG favicon at 16px, so it takes the small cut and follows the OS scheme.
    'favicon.svg': markSvg({ colors: BRAND_LIGHT, dark: BRAND_DARK, cut: 'small' }),
    // favicon.ico cannot follow the scheme, so it sits on the stone tile. nuxt.config.ts declares these three sizes.
    'favicon.ico': ico([
      { size: 16, data: png(smallTile, 16) },
      { size: 32, data: png(tile, 32) },
      { size: 48, data: png(tile, 48) },
    ]),
    // The weekly email header and the Discord digest avatar use the tile, because Gmail strips SVG.
    'logo-icon.svg': tile,
    'logo-icon.png': png(tile, 512),
    // `logo` and `logo-mark` are for dark backgrounds; the `-light` files are for light ones.
    'logo.svg': lockupSvg({ colors: BRAND_DARK, height: 84 }),
    'logo-light.svg': lockupSvg({ colors: BRAND_LIGHT, height: 84 }),
    'logo-mark.svg': markSvg({ colors: BRAND_DARK }),
    'logo-mark-light.svg': markSvg({ colors: BRAND_LIGHT }),
  }
}

const files = brandFiles()
await Promise.all(Object.entries(files).map(([name, data]) => writeFile(resolve(PUBLIC, name), data)))
console.log(`Wrote ${Object.keys(files).length} brand files to public/: ${Object.keys(files).join(', ')}`)
