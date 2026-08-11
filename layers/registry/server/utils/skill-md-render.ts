import type { HighlighterCore } from '@shikijs/core'
import type { Renderer, Tokens } from 'marked'
import type { SkilldLang } from '#shared/shiki-language'
import { Marked } from 'marked'
import { resolveShikiLang, SHIKI_THEMES } from '#shared/shiki-language'
import { createSkillReferenceTokenizer } from './skill-dependencies'
import { parseFrontmatterDocument } from './skill-frontmatter'

function extractFenceLangs(body: string): Set<SkilldLang> {
  const langs = new Set<SkilldLang>()
  const re = /(?:^|\n)\s{0,3}(?:```|~~~)([^\n`~]*)/g
  for (const match of body.matchAll(re)) {
    const resolved = resolveShikiLang(match[1])
    if (resolved)
      langs.add(resolved)
  }
  return langs
}

function highlightSync(highlighter: HighlighterCore | null, code: string, lang: SkilldLang | null): string {
  if (!highlighter || !lang)
    return `<pre tabindex="0"><code>${escapeHtml(code)}</code></pre>`
  // Shiki throws if the lang wasn't actually loaded (some bundled langs fail
  // to register silently). Fall back to plain pre rather than 500ing the
  // whole page render.
  try {
    return highlighter.codeToHtml(code, {
      lang,
      themes: SHIKI_THEMES,
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
  skillNames?: string[]
  registryOwner?: string
  registryRepo?: string
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

function createSkillMd(
  ctx: SkillRenderContext | undefined,
  highlighter: HighlighterCore | null,
): { marked: Marked, dependencies: Set<string> } {
  const dependencies = new Set<string>()
  const tokenizeSkillReferences = createSkillReferenceTokenizer(ctx?.skillNames ?? [], ctx?.name ?? '')
  let linkDepth = 0
  const renderDependency = (name: string): string => {
    dependencies.add(name)
    const owner = ctx?.registryOwner ?? ctx?.owner ?? ''
    const repo = ctx?.registryRepo ?? ctx?.repo ?? ''
    const href = `/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(name)}`
    return `<a href="${href}" data-skill-dependency="${escapeHtml(name)}">/${escapeHtml(name)}</a>`
  }
  const marked = new Marked({
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
        linkDepth++
        const text = (this as { parser: { parseInline: (t: unknown[]) => string } }).parser.parseInline(tokens)
        linkDepth--
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        const external = /^https?:\/\//i.test(safe)
        const extra = external ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${escapeHtml(safe)}"${t}${extra}>${text}</a>`
      },
      text(this: Renderer, token: Tokens.Text | Tokens.Escape) {
        if (token.type === 'text' && token.tokens?.length)
          return this.parser.parseInline(token.tokens)
        if (token.type === 'escape' || linkDepth > 0 || !ctx?.skillNames?.length)
          return escapeHtml(token.text)
        return tokenizeSkillReferences(token.text)
          .map((part) => {
            if (part._tag === 'text')
              return escapeHtml(part.value)
            return renderDependency(part.name)
          })
          .join('')
      },
      codespan({ text }: Tokens.Codespan) {
        if (linkDepth > 0)
          return `<code>${escapeHtml(text)}</code>`
        const parts = tokenizeSkillReferences(text)
        if (parts.length === 1 && parts[0]?._tag === 'dependency')
          return renderDependency(parts[0].name)
        return `<code>${escapeHtml(text)}</code>`
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
        const resolved = resolveShikiLang(lang)
        return highlightSync(highlighter, text, resolved)
      },
    },
  })
  return { marked, dependencies }
}

export interface ParsedSkillMd {
  frontmatter: Record<string, unknown>
  body: string
  html: string
  dependencies: string[]
}

export async function parseSkillMd(raw: string, ctx?: SkillRenderContext): Promise<ParsedSkillMd> {
  const { frontmatter, body } = parseFrontmatterDocument(raw)

  const needed = extractFenceLangs(body)
  // Grammars that fail to load are dropped inside loadShikiHighlighter, and
  // highlightSync falls back to a plain pre per block, so a bad fence costs one
  // unhighlighted block rather than the page render.
  const highlighter = needed.size
    ? await import('#shared/shiki').then(({ loadShikiHighlighter }) => loadShikiHighlighter(needed))
    : null

  const renderer = createSkillMd(ctx, highlighter)
  let html = renderer.marked.parse(body) as string
  html = html.replace(/<pre\b([^>]*)>/g, (match, attrs: string) => {
    if (/\btabindex=/.test(attrs))
      return match
    return `<pre tabindex="0"${attrs}>`
  })
  return { frontmatter, body, html, dependencies: [...renderer.dependencies] }
}
