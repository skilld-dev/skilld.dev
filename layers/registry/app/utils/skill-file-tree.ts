import type { FileIconName } from '#shared/file-icons'

interface SkillAsset {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

export type SkillFileTreeNode
  = | { kind: 'dir', path: string, name: string, children: SkillFileTreeNode[], initiallyOpen: boolean }
    | { kind: 'file', path: string, name: string, asset: SkillAsset }

// A lone folder this small opens on load. More folders, or a bigger one, start
// closed, so SKILL.md stays near the top of the tree.
const AUTO_EXPAND_MAX_CHILDREN = 5
const LICENSE_NAME = /^licen[cs]e(?:\.\w+)?$/i

function rank(node: SkillFileTreeNode): number {
  if (node.kind === 'dir')
    return 0
  if (node.path === 'SKILL.md')
    return 1
  return LICENSE_NAME.test(node.name) ? 3 : 2
}

function sortNodes(nodes: SkillFileTreeNode[]): SkillFileTreeNode[] {
  return nodes
    .map(node => node.kind === 'dir' ? { ...node, children: sortNodes(node.children) } : node)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

function withInitialOpen(nodes: SkillFileTreeNode[], parentOpen: boolean): SkillFileTreeNode[] {
  const folders = nodes.filter(node => node.kind === 'dir')
  return nodes.map((node) => {
    if (node.kind !== 'dir')
      return node
    const initiallyOpen = parentOpen && folders.length === 1 && node.children.length <= AUTO_EXPAND_MAX_CHILDREN
    return { ...node, initiallyOpen, children: withInitialOpen(node.children, initiallyOpen) }
  })
}

/**
 * The Skill folder as a tree: folders first, then SKILL.md, then the other
 * files, with LICENSE last. The API never lists SKILL.md, so it is added here.
 */
export function buildSkillFileTree(assets: SkillAsset[], skillMdSize: number): SkillFileTreeNode[] {
  const root: SkillFileTreeNode[] = []
  for (const asset of [{ path: 'SKILL.md', size: skillMdSize, type: 'markdown' as const }, ...assets]) {
    const parts = asset.path.split('/').filter(Boolean)
    let level = root
    parts.forEach((segment, index) => {
      const path = parts.slice(0, index + 1).join('/')
      if (index === parts.length - 1) {
        level.push({ kind: 'file', path, name: segment, asset })
        return
      }
      let dir = level.find((node): node is Extract<SkillFileTreeNode, { kind: 'dir' }> => node.kind === 'dir' && node.name === segment)
      if (!dir) {
        dir = { kind: 'dir', path, name: segment, children: [], initiallyOpen: false }
        level.push(dir)
      }
      level = dir.children
    })
  }
  return withInitialOpen(sortNodes(root), true)
}

const FILENAME_ICONS: Record<string, FileIconName> = {
  'skill.md': 'file-type-markdown',
  'readme.md': 'file-type-markdown',
  'license': 'file-type-license',
  'license.md': 'file-type-license',
  'package.json': 'file-type-node',
  'tsconfig.json': 'file-type-tsconfig',
  '.gitignore': 'file-type-git',
  'dockerfile': 'file-type-docker',
  'makefile': 'file-type-makefile',
}

const EXT_ICONS: Record<string, FileIconName> = {
  md: 'file-type-markdown',
  markdown: 'file-type-markdown',
  ts: 'file-type-typescript',
  tsx: 'file-type-reactts',
  js: 'file-type-js',
  jsx: 'file-type-reactjs',
  mjs: 'file-type-js',
  cjs: 'file-type-js',
  vue: 'file-type-vue',
  json: 'file-type-json',
  yaml: 'file-type-yaml',
  yml: 'file-type-yaml',
  toml: 'file-type-toml',
  py: 'file-type-python',
  rb: 'file-type-ruby',
  rs: 'file-type-rust',
  go: 'file-type-go',
  sh: 'file-type-shell',
  bash: 'file-type-shell',
  zsh: 'file-type-shell',
  fish: 'file-type-shell',
  sql: 'file-type-sql',
  html: 'file-type-html',
  css: 'file-type-css',
  scss: 'file-type-scss',
  png: 'file-type-image',
  jpg: 'file-type-image',
  jpeg: 'file-type-image',
  gif: 'file-type-image',
  webp: 'file-type-image',
  svg: 'file-type-svg',
  csv: 'file-type-excel',
  txt: 'file-type-text',
}

export function fileIcon(name: string): FileIconName {
  const lower = name.toLowerCase()
  if (FILENAME_ICONS[lower])
    return FILENAME_ICONS[lower]!
  const ext = lower.split('.').pop() ?? ''
  return EXT_ICONS[ext] ?? 'default-file'
}

const LANG_BY_EXT: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  vue: 'vue',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'shell',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  xml: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  csv: 'text',
  txt: 'text',
  env: 'bash',
  dockerfile: 'dockerfile',
}

const FILENAME_LANG: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'makefile': 'makefile',
  '.gitignore': 'text',
  '.env': 'bash',
}

export function highlightLangFromPath(path: string): string {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  if (FILENAME_LANG[name])
    return FILENAME_LANG[name]!
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return LANG_BY_EXT[ext] ?? 'text'
}

export function isInlineRenderable(type: 'markdown' | 'code' | 'image' | 'data' | 'other'): boolean {
  return type === 'markdown' || type === 'code' || type === 'data'
}
