/**
 * File-type icons for the Skill file explorer, served as static SVG files.
 *
 * They used to be `i-vscode-icons-*` names rendered by @nuxt/icon, which put
 * every one of them, 80 KB with a 23 KB licence glyph, in the client bundle
 * that every page preloads. As files, a Skill page fetches only the few its
 * tree shows, and no other page fetches any. `modules/file-icons` writes them
 * at build time from `@iconify-json/vscode-icons`.
 */

export const FILE_ICON_NAMES = [
  'default-file',
  'default-folder',
  'default-folder-opened',
  'file-type-css',
  'file-type-docker',
  'file-type-excel',
  'file-type-git',
  'file-type-go',
  'file-type-html',
  'file-type-image',
  'file-type-js',
  'file-type-json',
  'file-type-license',
  'file-type-makefile',
  'file-type-markdown',
  'file-type-node',
  'file-type-python',
  'file-type-reactjs',
  'file-type-reactts',
  'file-type-ruby',
  'file-type-rust',
  'file-type-scss',
  'file-type-shell',
  'file-type-sql',
  'file-type-svg',
  'file-type-text',
  'file-type-toml',
  'file-type-tsconfig',
  'file-type-typescript',
  'file-type-vue',
  'file-type-yaml',
] as const

export type FileIconName = typeof FILE_ICON_NAMES[number]

export const FILE_ICON_BASE_URL = '/_file-icons'

export function fileIconSrc(name: FileIconName): string {
  return `${FILE_ICON_BASE_URL}/${name}.svg`
}

interface IconifyIcon {
  body: string
  width?: number
  height?: number
  left?: number
  top?: number
}

interface IconifyAlias {
  parent: string
  [transform: string]: unknown
}

export interface IconifyCollection {
  width?: number
  height?: number
  left?: number
  top?: number
  icons: Record<string, IconifyIcon>
  aliases?: Record<string, IconifyAlias>
}

export type FileIconSvg
  = | { _tag: 'Ok', svg: string }
    | { _tag: 'Err', reason: string }

/**
 * One icon as a standalone SVG document.
 *
 * Handles what this set needs: per-icon sizes and plain aliases. An alias that
 * flips or rotates its parent is refused rather than drawn unflipped, so a new
 * icon that needs it fails the build instead of shipping wrong.
 */
export function fileIconSvg(collection: IconifyCollection, name: string): FileIconSvg {
  const alias = collection.aliases?.[name]
  if (alias && Object.keys(alias).some(key => key !== 'parent'))
    return { _tag: 'Err', reason: `${name} is an alias with a transform` }
  const icon = collection.icons[alias?.parent ?? name]
  if (!icon)
    return { _tag: 'Err', reason: `${name} is not in the collection` }
  const left = icon.left ?? collection.left ?? 0
  const top = icon.top ?? collection.top ?? 0
  const width = icon.width ?? collection.width ?? 16
  const height = icon.height ?? collection.height ?? 16
  return {
    _tag: 'Ok',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}">${icon.body}</svg>`,
  }
}
