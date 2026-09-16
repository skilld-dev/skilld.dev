import type { Renderer, Tokens } from 'marked'
import { Marked } from 'marked'
import { escapeHtml, highlightToHtml } from '#shared/highlight'
import { createSkillReferenceTokenizer } from './skill-dependencies'
import { parseFrontmatterDocument } from './skill-frontmatter'

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

/**
 * Hosts that serve GitHub content a Skill author cannot point at their own
 * server. An image from any other host can be a tracking pixel: it reports the
 * visitor's IP address and visit time to the author.
 */
const GITHUB_IMAGE_HOSTS = new Set([
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'avatars.githubusercontent.com',
])

function parseAbsoluteUrl(href: string): URL | null {
  if (!/^(?:https?:)?\/\//i.test(href))
    return null
  try {
    return new URL(href, 'https://github.com')
  }
  catch {
    // A malformed URL is not an image source; the caller shows the alt text.
    return null
  }
}

function isGithubImageUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return false
  if (GITHUB_IMAGE_HOSTS.has(url.hostname))
    return true
  return url.hostname === 'github.com'
    && (/^\/[^/]+\/[^/]+\/raw\//.test(url.pathname) || url.pathname.startsWith('/user-attachments/assets/'))
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
        const url = parseAbsoluteUrl(safe)
        const inlineData = /^data:image\//i.test(safe)
        if (inlineData || (url && isGithubImageUrl(url)))
          return `<img src="${escapeHtml(inlineData ? safe : url!.href)}" alt="${escapeHtml(text)}"${t} referrerpolicy="no-referrer" loading="lazy">`
        // Never load an image from another host. Offer the address as a link,
        // unless the image already sits inside a link. With no alt text and no
        // parseable URL (blocked scheme, malformed href) the raw href becomes
        // the visible text, or the link renders empty.
        if (!url || linkDepth > 0)
          return escapeHtml(text || url?.href || href)
        return `<a href="${escapeHtml(url.href)}"${t} target="_blank" rel="noopener noreferrer">${escapeHtml(text || url.href)}</a>`
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
        // A fence in a language we bundle no grammar for costs one plain block,
        // not the page render.
        return highlightToHtml(text, lang) ?? `<pre tabindex="0"><code>${escapeHtml(text)}</code></pre>`
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

  const renderer = createSkillMd(ctx)
  let html = renderer.marked.parse(body) as string
  html = html.replace(/<pre\b([^>]*)>/g, (match, attrs: string) => {
    if (/\btabindex=/.test(attrs))
      return match
    return `<pre tabindex="0"${attrs}>`
  })
  return { frontmatter, body, html, dependencies: [...renderer.dependencies] }
}
