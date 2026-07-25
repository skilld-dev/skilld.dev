// Keep language discovery independent from Shiki's parser engine. Importers can
// decide whether highlighting is needed before loading the heavy implementation.
export const LANG_LOADERS = {
  astro: () => import('@shikijs/langs/astro'),
  bash: () => import('@shikijs/langs/shellscript'),
  c: () => import('@shikijs/langs/c'),
  clojure: () => import('@shikijs/langs/clojure'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  csv: () => import('@shikijs/langs/csv'),
  dart: () => import('@shikijs/langs/dart'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/docker'),
  elixir: () => import('@shikijs/langs/elixir'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  haskell: () => import('@shikijs/langs/haskell'),
  html: () => import('@shikijs/langs/html'),
  http: () => import('@shikijs/langs/http'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  json5: () => import('@shikijs/langs/json5'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  jsx: () => import('@shikijs/langs/jsx'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  less: () => import('@shikijs/langs/less'),
  lua: () => import('@shikijs/langs/lua'),
  makefile: () => import('@shikijs/langs/make'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdc: () => import('@shikijs/langs/mdc'),
  mdx: () => import('@shikijs/langs/mdx'),
  nginx: () => import('@shikijs/langs/nginx'),
  perl: () => import('@shikijs/langs/perl'),
  php: () => import('@shikijs/langs/php'),
  powershell: () => import('@shikijs/langs/powershell'),
  python: () => import('@shikijs/langs/python'),
  r: () => import('@shikijs/langs/r'),
  regex: () => import('@shikijs/langs/regexp'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  sass: () => import('@shikijs/langs/sass'),
  scala: () => import('@shikijs/langs/scala'),
  scss: () => import('@shikijs/langs/scss'),
  sql: () => import('@shikijs/langs/sql'),
  svelte: () => import('@shikijs/langs/svelte'),
  swift: () => import('@shikijs/langs/swift'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  vue: () => import('@shikijs/langs/vue'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
  zig: () => import('@shikijs/langs/zig'),
} satisfies Record<string, () => Promise<unknown>>

export type SkilldLang = keyof typeof LANG_LOADERS

const LANG_ALIASES: Record<string, SkilldLang> = {
  'c++': 'cpp',
  'cjs': 'javascript',
  'cs': 'csharp',
  'cts': 'typescript',
  'docker': 'dockerfile',
  'ex': 'elixir',
  'exs': 'elixir',
  'env': 'bash',
  'fish': 'bash',
  'gql': 'graphql',
  'hs': 'haskell',
  'js': 'javascript',
  'jsonl': 'json',
  'kt': 'kotlin',
  'make': 'makefile',
  'md': 'markdown',
  'mjs': 'javascript',
  'mts': 'typescript',
  'pl': 'perl',
  'postcss': 'css',
  'ps1': 'powershell',
  'py': 'python',
  'rb': 'ruby',
  'regexp': 'regex',
  'rs': 'rust',
  'sh': 'bash',
  'shell': 'bash',
  'shellscript': 'bash',
  'ts': 'typescript',
  'yml': 'yaml',
  'zsh': 'bash',
}

export const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const

export function resolveShikiLang(raw: string | null | undefined): SkilldLang | null {
  if (!raw)
    return null
  const lang = raw.trim().toLowerCase().split(/\s+/)[0]
  if (!lang)
    return null
  if (lang in LANG_ALIASES)
    return LANG_ALIASES[lang]!
  return lang in LANG_LOADERS ? lang as SkilldLang : null
}
