// `shiki/core`, `shiki/types` and `shiki/engine/javascript` are thin re-exports
// that carry no bundle map — importing bare `shiki` is what drags the full one in.
import type { HighlighterCore, LanguageRegistration, ThemeRegistration } from 'shiki/types'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

// Importing `shiki` (or `shiki/bundle/web`) pulls Shiki's full bundle map into
// the graph: 253 language chunks, 65 themes, and the Oniguruma WASM engine —
// ~9 MB across the client and Worker builds for a set of languages we can name
// exactly. This module is the single Shiki entrypoint for the app; everything
// below is an explicit dynamic import, so only these chunks get emitted.
//
// The JS regex engine (not Oniguruma) is deliberate: workerd can't instantiate
// the Oniguruma WASM at SSR time, so highlighting has to run on the JS engine
// to appear in server-rendered HTML.

// Roughly the intersection of what `shiki/bundle/web` covered and what actually
// shows up in SKILL.md fences and skill source files. Adding one costs ~20-40 KB
// raw in a lazily-loaded chunk, so err toward including a plausible language
// rather than dropping a code block to plain text.
const LANG_LOADERS = {
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

// Fence tags and file extensions map onto the canonical ids above. Shiki knows
// most of these aliases itself, but it only learns them once the owning grammar
// is loaded, and we need to resolve the id *before* deciding what to load.
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

/**
 * Resolve a fence tag or extension to a language we can actually highlight.
 * Returns null for anything unsupported so callers can fall back to plain text.
 */
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

let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [
      import('@shikijs/themes/github-light'),
      import('@shikijs/themes/github-dark'),
    ] as unknown as ThemeRegistration[],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })
  return highlighterPromise
}

/**
 * Get a highlighter with `langs` registered. Languages that fail to load are
 * dropped rather than thrown — a grammar that won't compile should cost one
 * unhighlighted code block, not the whole page render.
 */
export async function loadShikiHighlighter(langs: Iterable<SkilldLang>): Promise<HighlighterCore> {
  const highlighter = await getHighlighter()
  const loaded = new Set(highlighter.getLoadedLanguages())
  const missing = [...new Set(langs)].filter(lang => !loaded.has(lang))
  if (!missing.length)
    return highlighter

  const grammars = await Promise.all(missing.map(async (lang) => {
    return LANG_LOADERS[lang]().then(
      module => (module as { default: LanguageRegistration[] }).default,
      (error: unknown) => {
        console.warn(`[shiki] failed to load grammar "${lang}"`, error)
        return null
      },
    )
  }))

  const usable = grammars.filter((grammar): grammar is LanguageRegistration[] => grammar !== null)
  if (usable.length) {
    await highlighter.loadLanguage(...usable).catch((error: unknown) => {
      console.warn('[shiki] loadLanguage failed', missing, error)
    })
  }
  return highlighter
}

/**
 * Highlight a whole document. Returns null when the language isn't supported,
 * leaving the fallback markup to the caller.
 */
export async function highlightToHtml(code: string, raw: string | null | undefined): Promise<string | null> {
  const lang = resolveShikiLang(raw)
  if (!lang)
    return null
  const highlighter = await loadShikiHighlighter([lang])
  if (!highlighter.getLoadedLanguages().includes(lang))
    return null
  return highlighter.codeToHtml(code, {
    lang,
    themes: SHIKI_THEMES,
    defaultColor: false,
  })
}
