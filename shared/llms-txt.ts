/**
 * llms.txt as a small root index plus one nested file per sitemap.
 *
 * nuxt-ai-ready lists every `ai_ready_pages` row in one file. Here that was
 * 1.48M characters and 11,872 links, most of them retired `/skills/<owner>/...`
 * URLs that answer 301, 404, or 410. Agents read about the first 100k
 * characters. These files list the sitemaps instead, so they follow the same
 * admission rules as search, and each file stays far under that limit.
 */

export const SITE_ORIGIN = 'https://skilld.dev'

export const LLMS_INDEX_PATH = '/llms.txt'

/** The skilld Skill this site publishes, so `nuxt.config.ts` and llms.txt name it alike. */
export const REGISTRY_SKILL = {
  name: 'skilld-registry',
  description: 'Search skilld.dev and return verified commands to run or install a skill.',
} as const

/** A nested llms file: the pages of one sitemap, linked from the root index. */
export interface LlmsSection {
  path: `/llms/${string}.txt`
  /** The sitemap name, `skills` for `/__sitemap__/skills-0.xml`. */
  sitemap: string
  title: string
  description: string
}

/** The root index lists this sitemap inline. */
const PAGES_SITEMAP = 'pages'

/**
 * The sitemap of retired URLs (301, 404, 410), so Google drops them sooner.
 * It must never reach an Agent.
 */
const RETIRED_SITEMAP = 'retired'

export const LLMS_SECTIONS: readonly LlmsSection[] = [
  {
    path: '/llms/skills.txt',
    sitemap: 'skills',
    title: 'Skills',
    description: 'Every Skill page and track in the skilld sitemap.',
  },
  {
    path: '/llms/demos.txt',
    sitemap: 'demos',
    title: 'Skill Demos',
    description: 'Each demo is one recorded run: the prompt, and what the Agent built with the Skill.',
  },
]

/** Title and description of a page, from the `ai_ready_pages` row the Markdown renderer wrote. */
export interface PageMeta {
  title: string
  description: string
}

/** A page path, such as `/gh/antfu/skills/antfu`. */
export interface SitemapPage {
  path: string
}

const LOC_RE = /<loc>([^<]+)<\/loc>/g
const SITEMAP_NAME_RE = /\/__sitemap__\/(.+?)(?:-\d+)?\.xml$/
const TITLE_SUFFIX_RE = /\s+·\s+skilld$/

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

/** Every `<loc>` of a sitemap or sitemap index, decoded. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(LOC_RE)].map(match => decodeXml(match[1]!.trim()))
}

/** `skills` for `https://skilld.dev/__sitemap__/skills-0.xml`. Null for any other URL. */
export function sitemapName(loc: string): string | null {
  const pathname = URL.canParse(loc, SITE_ORIGIN) ? new URL(loc, SITE_ORIGIN).pathname : ''
  return SITEMAP_NAME_RE.exec(pathname)?.[1] ?? null
}

/** The sitemaps an llms file reads. The retired sitemap is never one of them. */
export function readableSitemap(name: string): boolean {
  return name !== RETIRED_SITEMAP
}

/**
 * Page paths from sitemap locs, in sitemap order. A loc with a query string is
 * a view of a page already listed, and a loc on another origin is not ours.
 */
export function sitemapPages(locs: readonly string[]): SitemapPage[] {
  const seen = new Set<string>()
  const pages: SitemapPage[] = []
  for (const loc of locs) {
    if (!URL.canParse(loc, SITE_ORIGIN))
      continue
    const url = new URL(loc, SITE_ORIGIN)
    if (url.origin !== SITE_ORIGIN || url.search)
      continue
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/'
    if (seen.has(path))
      continue
    seen.add(path)
    pages.push({ path })
  }
  return pages
}

/** The Markdown URL of a page: `/index.md` for the homepage, `<path>.md` otherwise. */
export function markdownUrl(path: string): string {
  return `${SITE_ORIGIN}${path === '/' ? '/index' : path}.md`
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function linkText(value: string): string {
  return oneLine(value).replace(/[[\]]/g, '\\$&')
}

function linkLine(title: string, url: string, description: string): string {
  const note = oneLine(description)
  return `- [${linkText(title)}](${url})${note ? `: ${note}` : ''}`
}

function pageLine(page: SitemapPage, meta: ReadonlyMap<string, PageMeta>): string {
  const row = meta.get(page.path)
  const title = row?.title.replace(TITLE_SUFFIX_RE, '').trim() || page.path
  return linkLine(title, markdownUrl(page.path), row?.description ?? '')
}

export interface LlmsSite {
  name: string
  description: string
}

function header(site: LlmsSite, description: string): string[] {
  return [`# ${site.name}`, '', `> ${oneLine(description)}`, '', `Canonical Origin: ${SITE_ORIGIN}/`, '']
}

export interface LlmsIndexInput {
  site: LlmsSite
  /** Pages from the pages sitemap, listed inline. */
  pages: readonly SitemapPage[]
  /** Nested files that have at least one page. */
  sections: readonly LlmsSection[]
  meta: ReadonlyMap<string, PageMeta>
}

/** The root `/llms.txt`. */
export function renderLlmsIndex(input: LlmsIndexInput): string {
  const lines = [
    ...header(input.site, input.site.description),
    'Each page link below opens the Markdown version of that page.',
    '',
    '## Agent setup',
    '',
    linkLine('Set up skilld', `${SITE_ORIGIN}/agent.md`, 'Setup steps an Agent reads and follows: the CLI, the MCP server, or a plain URL fetch.'),
    linkLine(REGISTRY_SKILL.name, `${SITE_ORIGIN}/SKILL.md`, REGISTRY_SKILL.description),
    linkLine('Agent Skills index', `${SITE_ORIGIN}/.well-known/agent-skills/index.json`, 'Every Skill this site publishes, with a sha256 digest for each one.'),
    linkLine('MCP server card', `${SITE_ORIGIN}/api/mcp/server-card`, 'The discovery MCP server and how to connect to it.'),
    linkLine('API catalog', `${SITE_ORIGIN}/.well-known/api-catalog`, 'The public API and the MCP server, as an RFC 9727 linkset.'),
    linkLine('OpenAPI', `${SITE_ORIGIN}/api/v1/openapi.json`, 'The public API contract.'),
    '',
    '## Indexes',
    '',
    ...input.sections.map(section => linkLine(section.title, `${SITE_ORIGIN}${section.path}`, section.description)),
    linkLine('AI sitemap', `${SITE_ORIGIN}/ai-sitemap.xml`, 'Every AI-ready page, including pages that are noindex for Google.'),
    linkLine('Sitemap', `${SITE_ORIGIN}/sitemap_index.xml`, 'XML sitemap for search engines and crawlers.'),
    linkLine('robots.txt', `${SITE_ORIGIN}/robots.txt`, 'Crawler rules and permissions.'),
  ]
  if (input.pages.length) {
    lines.push('', '## Pages', '', ...input.pages.map(page => pageLine(page, input.meta)))
  }
  return `${lines.join('\n')}\n`
}

export interface LlmsSectionInput {
  site: LlmsSite
  section: LlmsSection
  pages: readonly SitemapPage[]
  meta: ReadonlyMap<string, PageMeta>
}

/** One nested file, such as `/llms/skills.txt`. */
export function renderLlmsSection(input: LlmsSectionInput): string {
  const lines = [
    ...header({ ...input.site, name: `${input.site.name}: ${input.section.title}` }, input.section.description),
    `The index of every file is ${SITE_ORIGIN}${LLMS_INDEX_PATH}.`,
    '',
    `## ${input.section.title}`,
    '',
    ...input.pages.map(page => pageLine(page, input.meta)),
  ]
  return `${lines.join('\n')}\n`
}

/** The section a nested file path serves, or null. */
export function llmsSectionFor(path: string): LlmsSection | null {
  return LLMS_SECTIONS.find(section => section.path === path) ?? null
}

/** Which sitemap feeds the root index, so the shell knows what to read. */
export function isPagesSitemap(name: string): boolean {
  return name === PAGES_SITEMAP
}
