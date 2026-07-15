import type { Renderer, Tokens } from 'marked'
import type { BundledLanguage, HighlighterGeneric } from 'shiki/bundle/web'
import { Marked } from 'marked'
import { bundledLanguages, createHighlighter } from 'shiki/bundle/web'

type WebHighlighter = HighlighterGeneric<BundledLanguage, 'github-light' | 'github-dark'>

let highlighterPromise: Promise<WebHighlighter> | null = null
function getHighlighter(): Promise<WebHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [],
    }) as Promise<WebHighlighter>
  }
  return highlighterPromise
}

const LANG_ALIASES: Record<string, BundledLanguage> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
}

function resolveLang(raw: string | undefined | null): BundledLanguage | null {
  if (!raw)
    return null
  const lang = raw.trim().toLowerCase().split(/\s+/)[0]!
  if (!lang)
    return null
  const aliased = LANG_ALIASES[lang] ?? (lang as BundledLanguage)
  return aliased in bundledLanguages ? aliased : null
}

function extractFenceLangs(body: string): Set<BundledLanguage> {
  const langs = new Set<BundledLanguage>()
  const re = /(?:^|\n)\s{0,3}(?:```|~~~)([^\n`~]*)/g
  for (const match of body.matchAll(re)) {
    const resolved = resolveLang(match[1])
    if (resolved)
      langs.add(resolved)
  }
  return langs
}

function highlightSync(highlighter: WebHighlighter | null, code: string, lang: BundledLanguage | null): string {
  if (!highlighter || !lang)
    return `<pre tabindex="0"><code>${escapeHtml(code)}</code></pre>`
  // Shiki throws if the lang wasn't actually loaded (some bundled langs fail
  // to register silently). Fall back to plain pre rather than 500ing the
  // whole page render.
  try {
    return highlighter.codeToHtml(code, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    })
  }
  catch {
    return `<pre tabindex="0"><code>${escapeHtml(code)}</code></pre>`
  }
}

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const HTML_ESCAPE_RE = /[&<>"']/g

function escapeHtml(s: string): string {
  return s.replace(HTML_ESCAPE_RE, c => HTML_ESCAPE[c]!)
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(?:javascript|vbscript|data|file):/i.test(trimmed)) {
    if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);/i.test(trimmed))
      return trimmed
    return '#'
  }
  return trimmed
}

export interface SkillRenderContext {
  owner: string
  repo: string
  name: string
  branch: string
  skillDir: string
  // Path of the markdown file being rendered, relative to skillDir.
  // Empty string when rendering SKILL.md.
  filePath: string
}

function isAbsoluteUrl(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)
}

function splitFragment(href: string): { path: string, suffix: string } {
  const path = href.split(/[?#]/)[0]!
  const hashIdx = href.indexOf('#')
  const queryIdx = href.indexOf('?')
  const indices = [hashIdx, queryIdx].filter(i => i >= 0)
  const suffix = indices.length ? href.slice(Math.min(...indices)) : ''
  return { path, suffix }
}

function joinPath(base: string, rel: string): string {
  const segments = base.split('/').filter(Boolean)
  for (const part of rel.split('/')) {
    if (part === '' || part === '.')
      continue
    if (part === '..') {
      segments.pop()
      continue
    }
    segments.push(part)
  }
  return segments.join('/')
}

function rewriteHref(href: string, kind: 'link' | 'image', ctx?: SkillRenderContext): string {
  if (!ctx || !href || isAbsoluteUrl(href))
    return href
  const { path, suffix } = splitFragment(href)
  if (!path)
    return href
  // Resolve relative to the directory containing the file we're rendering.
  const baseDir = ctx.filePath
    ? joinPath(ctx.skillDir, ctx.filePath.split('/').slice(0, -1).join('/'))
    : ctx.skillDir
  const resolved = joinPath(baseDir, path)
  const isInsideSkillDir = resolved === ctx.skillDir || resolved.startsWith(`${ctx.skillDir}/`)
  const isMarkdown = /\.(?:md|markdown)$/i.test(resolved)
  if (kind === 'link' && isInsideSkillDir && isMarkdown) {
    const rel = resolved.slice(ctx.skillDir.length + 1)
    if (!rel)
      return `/gh/${ctx.owner}/${ctx.repo}/${ctx.name}${suffix}`
    return `/gh/${ctx.owner}/${ctx.repo}/${ctx.name}/-/${rel}${suffix}`
  }
  const branchOrBlob = kind === 'image' ? 'raw' : 'blob'
  return `https://github.com/${ctx.owner}/${ctx.repo}/${branchOrBlob}/${ctx.branch}/${resolved}${suffix}`
}

const SKILL_TAG_RE = /^<(\/?)([A-Z][A-Z0-9-]*)\s*>$/

function createSkillMd(ctx: SkillRenderContext | undefined, highlighter: WebHighlighter | null): Marked {
  return new Marked({
    gfm: true,
    async: false,
    renderer: {
      html({ text }: { text: string }) {
        const m = text.match(SKILL_TAG_RE)
        if (m)
          return `<code class="skill-tag">&lt;${m[1]}${m[2]}&gt;</code>`
        return escapeHtml(text)
      },
      link({ href, title, tokens }: { href: string, title?: string | null, tokens: unknown[] }) {
        const safe = sanitizeUrl(rewriteHref(href, 'link', ctx))
        const text = (this as { parser: { parseInline: (t: unknown[]) => string } }).parser.parseInline(tokens)
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        const external = /^https?:\/\//i.test(safe)
        const extra = external ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${escapeHtml(safe)}"${t}${extra}>${text}</a>`
      },
      image({ href, title, text }: { href: string, title?: string | null, text: string }) {
        const safe = sanitizeUrl(rewriteHref(href, 'image', ctx))
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${t}>`
      },
      heading(this: Renderer, token: Tokens.Heading) {
        const content = this.parser.parseInline(token.tokens)
        const level = Math.min(token.depth + 1, 6)
        return `<h${level}>${content}</h${level}>\n`
      },
      tablecell(this: Renderer, token: Tokens.TableCell) {
        const content = this.parser.parseInline(token.tokens)
        const tag = token.header ? 'th' : 'td'
        const scope = token.header ? ' scope="col"' : ''
        const align = token.align ? ` align="${token.align}"` : ''
        return `<${tag}${scope}${align}>${content}</${tag}>\n`
      },
      code({ text, lang }: Tokens.Code) {
        const resolved = resolveLang(lang)
        return highlightSync(highlighter, text, resolved)
      },
    },
  })
}

export interface ParsedSkillMd {
  frontmatter: Record<string, unknown>
  body: string
  html: string
}

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed)
    return ''
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    }
    catch {
      // Fall through to string handling
    }
  }
  return trimmed.replace(/^['"]|['"]$/g, '')
}

export async function parseSkillMd(raw: string, ctx?: SkillRenderContext): Promise<ParsedSkillMd> {
  const frontmatter: Record<string, unknown> = {}
  let body = raw

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (fmMatch) {
    for (const line of fmMatch[1]!.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':')
      if (colonIdx <= 0)
        continue
      const key = line.slice(0, colonIdx)
      if (!/^[A-Z_][\w-]*$/i.test(key))
        continue
      frontmatter[key] = parseFrontmatterValue(line.slice(colonIdx + 1))
    }
    body = fmMatch[2]!
  }

  const needed = extractFenceLangs(body)
  let highlighter: WebHighlighter | null = null
  if (needed.size) {
    highlighter = await getHighlighter()
    const loaded = new Set(highlighter.getLoadedLanguages())
    const toLoad = [...needed].filter(l => !loaded.has(l))
    if (toLoad.length) {
      // Some bundled langs (e.g. nested grammars) can fail to load; swallow
      // here so the page still renders — highlightSync also falls back to
      // plain pre per-block if codeToHtml throws.
      await highlighter.loadLanguage(...toLoad).catch((err) => {
        console.warn('[skill-md-render] loadLanguage failed', toLoad, err)
      })
    }
  }

  let html = createSkillMd(ctx, highlighter).parse(body) as string
  html = html.replace(/<pre\b([^>]*)>/g, (match, attrs: string) => {
    if (/\btabindex=/.test(attrs))
      return match
    return `<pre tabindex="0"${attrs}>`
  })
  return { frontmatter, body, html }
}
