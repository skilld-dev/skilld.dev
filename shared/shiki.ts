import type { HighlighterCore, LanguageRegistration, ThemeRegistration } from '@shikijs/core'
import type { SkilldLang } from './shiki-language'
import { createHighlighterCore } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import { LANG_LOADERS, resolveShikiLang, SHIKI_THEMES } from './shiki-language'

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
