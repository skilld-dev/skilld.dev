interface SkillAsset {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

export interface SkillFileTreeNode {
  kind: 'file' | 'dir'
  path: string
  name: string
  children?: SkillFileTreeNode[]
  asset?: SkillAsset
}

const FILENAME_ICONS: Record<string, string> = {
  'skill.md': 'i-vscode-icons-file-type-markdown',
  'readme.md': 'i-vscode-icons-file-type-markdown',
  'license': 'i-vscode-icons-file-type-license',
  'license.md': 'i-vscode-icons-file-type-license',
  'package.json': 'i-vscode-icons-file-type-node',
  'tsconfig.json': 'i-vscode-icons-file-type-tsconfig',
  '.gitignore': 'i-vscode-icons-file-type-git',
  'dockerfile': 'i-vscode-icons-file-type-docker',
  'makefile': 'i-vscode-icons-file-type-makefile',
}

const EXT_ICONS: Record<string, string> = {
  md: 'i-vscode-icons-file-type-markdown',
  markdown: 'i-vscode-icons-file-type-markdown',
  ts: 'i-vscode-icons-file-type-typescript',
  tsx: 'i-vscode-icons-file-type-reactts',
  js: 'i-vscode-icons-file-type-js',
  jsx: 'i-vscode-icons-file-type-reactjs',
  mjs: 'i-vscode-icons-file-type-js',
  cjs: 'i-vscode-icons-file-type-js',
  vue: 'i-vscode-icons-file-type-vue',
  json: 'i-vscode-icons-file-type-json',
  yaml: 'i-vscode-icons-file-type-yaml',
  yml: 'i-vscode-icons-file-type-yaml',
  toml: 'i-vscode-icons-file-type-toml',
  py: 'i-vscode-icons-file-type-python',
  rb: 'i-vscode-icons-file-type-ruby',
  rs: 'i-vscode-icons-file-type-rust',
  go: 'i-vscode-icons-file-type-go',
  sh: 'i-vscode-icons-file-type-shell',
  bash: 'i-vscode-icons-file-type-shell',
  zsh: 'i-vscode-icons-file-type-shell',
  fish: 'i-vscode-icons-file-type-shell',
  sql: 'i-vscode-icons-file-type-sql',
  html: 'i-vscode-icons-file-type-html',
  css: 'i-vscode-icons-file-type-css',
  scss: 'i-vscode-icons-file-type-scss',
  png: 'i-vscode-icons-file-type-image',
  jpg: 'i-vscode-icons-file-type-image',
  jpeg: 'i-vscode-icons-file-type-image',
  gif: 'i-vscode-icons-file-type-image',
  webp: 'i-vscode-icons-file-type-image',
  svg: 'i-vscode-icons-file-type-svg',
  csv: 'i-vscode-icons-file-type-excel',
  txt: 'i-vscode-icons-file-type-text',
}

export function fileIcon(name: string): string {
  const lower = name.toLowerCase()
  if (FILENAME_ICONS[lower])
    return FILENAME_ICONS[lower]!
  const ext = lower.split('.').pop() ?? ''
  return EXT_ICONS[ext] ?? 'i-vscode-icons-default-file'
}

const SHIKI_LANG_BY_EXT: Record<string, string> = {
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

export function shikiLangFromPath(path: string): string {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  if (FILENAME_LANG[name])
    return FILENAME_LANG[name]!
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return SHIKI_LANG_BY_EXT[ext] ?? 'text'
}

export function isInlineRenderable(type: 'markdown' | 'code' | 'image' | 'data' | 'other'): boolean {
  return type === 'markdown' || type === 'code' || type === 'data'
}
