import type { ShjTheme, ShjToken, ShjTokenized } from 'rangi'
import { tokenize } from 'rangi'
import { aliases, languages } from 'rangi/languages'
import { githubDark, githubLight } from 'rangi/themes'

// rangi ships every grammar it knows in ~13 KB min+gzip and tokenizes
// synchronously, so there is no highlighter to construct, no WASM engine to
// instantiate under workerd, and no per-language chunk to load. Highlighting is
// a pure function from (code, lang) to markup.
//
// The markup matches what `comark/plugins/rangi` emits for Learn content: the
// light colour is inlined and the dark one rides along as `--shiki-dark`, so a
// single stylesheet rule covers every highlighted block on the site.

const THEME = { light: githubLight, dark: githubDark } satisfies Record<'light' | 'dark', ShjTheme>

// Fragment grammars are reached only through another grammar's `sub`; they are
// never a fence language. `plain`/`text`/`txt` stay unresolved on purpose so an
// unhighlighted fence renders as a bare `<pre><code>` instead of an empty
// highlight wrapper.
const NON_FENCE_GRAMMARS = new Set(['js_template_literals', 'todo', 'plain', 'text', 'txt'])

const FENCE_LANGS = new Set(
  Object.keys(languages).filter(name => !NON_FENCE_GRAMMARS.has(name)),
)

// An alias holds the very grammar it stands for, so the primary name is the one
// key that maps to the same object and is not itself an alias. Resolving onto it
// keeps `ts` and `typescript` producing byte-identical markup.
const PRIMARY_NAME = new Map<unknown, string>()
for (const [name, grammar] of Object.entries(languages)) {
  if (!(name in aliases))
    PRIMARY_NAME.set(grammar, name)
}

// Only names rangi has no alias of its own for. It already answers to `ts`,
// `python`, `yml`, `dockerfile`, `shell` and the rest, which pass straight
// through. A name that resolves to no bundled grammar stays unhighlighted.
const LANG_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  'env': 'bash',
  'fish': 'bash',
  'mdc': 'md',
  'mdx': 'md',
  'postcss': 'css',
  'regexp': 'regex',
  'sass': 'scss',
  'shellscript': 'bash',
}

export type SkilldLang = string

/**
 * Resolve a fence info string or file extension to a bundled grammar. Returns
 * null when nothing highlights it, leaving the fallback markup to the caller.
 */
export function resolveHighlightLang(raw: string | null | undefined): SkilldLang | null {
  if (!raw)
    return null
  const name = raw.trim().toLowerCase().split(/\s+/)[0]
  if (!name)
    return null
  const resolved = LANG_ALIASES[name] ?? name
  if (!FENCE_LANGS.has(resolved))
    return null
  return PRIMARY_NAME.get(languages[resolved as keyof typeof languages]) ?? resolved
}

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const HTML_ESCAPE_RE = /[&<>"']/g

export function escapeHtml(s: string): string {
  return s.replace(HTML_ESCAPE_RE, c => HTML_ESCAPE[c]!)
}

function tokenColor(theme: ShjTheme, type: ShjToken): string {
  return theme.tokens[type] ?? theme.fg
}

function renderToken(token: ShjTokenized): string {
  const text = escapeHtml(token.text)
  if (!token.type)
    return text
  const style = `color:${tokenColor(THEME.light, token.type)};--shiki-dark:${tokenColor(THEME.dark, token.type)}`
  return `<span class="shj-${token.type}" style="${style}">${text}</span>`
}

/**
 * Highlight a whole document. Returns null when the language isn't one we
 * bundle a grammar for, leaving the fallback markup to the caller.
 *
 * `lang` comes from {@link resolveHighlightLang}, so it is safe to interpolate
 * into the class attribute.
 */
export function highlightToHtml(code: string, raw: string | null | undefined): string | null {
  const lang = resolveHighlightLang(raw)
  if (!lang)
    return null
  return `<pre tabindex="0" class="rangi shiki shj-lang-${lang}"><code>${tokenizeToHtml(code, lang)}</code></pre>`
}

function tokenizeToHtml(code: string, lang: SkilldLang): string {
  return tokenize(code, { lang }).map(renderToken).join('')
}

/**
 * Highlight a snippet to the inner spans only, for a caller that owns the
 * surrounding `<code>` element. Unhighlightable input comes back escaped, so
 * the result is always safe to bind with `v-html`. Stripping the tags gives
 * back the input text exactly.
 */
export function highlightCodeBody(code: string, raw: string | null | undefined): string {
  const lang = resolveHighlightLang(raw)
  return lang ? tokenizeToHtml(code, lang) : escapeHtml(code)
}
