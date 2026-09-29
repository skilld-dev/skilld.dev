import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const OG_STATIC_FONTS_DIR = '_og-static-fonts'

const FONT_REFERENCE = /\/_og-static-fonts\/([\w.-]+\.(?:ttf|otf|woff2?))/g
// The minified `#og-image/fonts` list: `{family:"Inter",src:...}`. The lookbehind skips CSS `font-family:"..."`.
const FONT_FAMILY = /(?<![\w-])"?family"?:\s*"([^"]+)"/g
const FONT_FILE = /\.(?:ttf|otf|woff2?)$/
const SERVER_CODE = /\.m?js$/

export type SyncResult
  = | { _tag: 'Ok', referenced: number }
    | { _tag: 'Err', missingFiles: string[], missingFamilies: string[] }

export interface SyncInput {
  /** Nitro server output. Every `/_og-static-fonts/*` string in it is a font the renderer will fetch. */
  serverDir: string
  /** Where nuxt-og-image downloads static fonts during the Nitro build. */
  cacheDir: string
  /** Nitro public output, served as Worker static assets. */
  publicDir: string
  /** Families that OG images must render in. A family absent from the bundle means a silent fall back to Inter. */
  families: string[]
}

function listFiles(dir: string, match: RegExp): string[] {
  if (!existsSync(dir))
    return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && match.test(entry.name))
    .map(entry => join(entry.parentPath, entry.name))
}

function scanServer(serverDir: string): { files: Set<string>, families: Set<string> } {
  const files = new Set<string>()
  const families = new Set<string>()
  for (const file of listFiles(serverDir, SERVER_CODE)) {
    const code = readFileSync(file, 'utf8')
    for (const match of code.matchAll(FONT_REFERENCE))
      files.add(match[1]!)
    for (const match of code.matchAll(FONT_FAMILY))
      families.add(match[1]!)
  }
  return { files, families }
}

/**
 * Copy downloaded OG fonts into the public output, then prove every font the
 * server bundle references is present.
 *
 * nuxt-og-image copies its static-font cache on `nitro:build:public-assets`,
 * which runs on `rollup:before`. It downloads Google fonts while Rollup resolves
 * `#og-image/fonts`, so on a cold cache the copy finds an empty folder and the
 * build ships font URLs that answer 404. If the download fails outright, the
 * family never reaches the bundle and every image renders in Inter.
 */
export function syncOgStaticFonts({ serverDir, cacheDir, publicDir, families }: SyncInput): SyncResult {
  const outputDir = join(publicDir, OG_STATIC_FONTS_DIR)
  mkdirSync(outputDir, { recursive: true })
  for (const file of listFiles(cacheDir, FONT_FILE)) {
    const name = file.slice(file.lastIndexOf('/') + 1)
    copyFileSync(file, join(outputDir, name))
  }

  const bundle = scanServer(serverDir)
  const missingFiles = [...bundle.files].filter(name => !existsSync(join(outputDir, name))).sort()
  const missingFamilies = families.filter(family => !bundle.families.has(family)).sort()
  return missingFiles.length > 0 || missingFamilies.length > 0
    ? { _tag: 'Err', missingFiles, missingFamilies }
    : { _tag: 'Ok', referenced: bundle.files.size }
}
