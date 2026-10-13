import type { H3Event } from 'h3'
import type { LlmsSection, PageMeta, SitemapPage } from '#shared/llms-txt'
import { assertMethod } from 'h3'
import {
  isPagesSitemap,
  LLMS_INDEX_PATH,
  LLMS_SECTIONS,
  llmsSectionFor,
  parseSitemapLocs,
  readableSitemap,
  renderLlmsIndex,
  renderLlmsSection,
  SITE_ORIGIN,
  sitemapName,
  sitemapPages,
} from '#shared/llms-txt'
import { cached } from '#shared/server/cache'

// The root llms.txt and its nested files. A middleware, not a route:
// nuxt-ai-ready registers its own `/llms.txt` route, and a project middleware
// runs before it (see agent-md.ts). `shared/llms-txt.ts` says why this site
// replaces the module's file.

const CACHE_SECONDS = 600
const STALE_SECONDS = 3600
/** D1 allows 100 bound parameters per statement. */
const META_BATCH = 100

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  const section = llmsSectionFor(path)
  if (path !== LLMS_INDEX_PATH && !section)
    return
  assertMethod(event, 'GET', true)

  const body = await cached({
    storage: useStorage('cache'),
    key: `llms-txt:v1:${path}`,
    ttlSeconds: CACHE_SECONDS,
    staleSeconds: STALE_SECONDS,
    compute: () => buildLlmsFile(event, section),
    schedule: promise => event.waitUntil(promise),
  })
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`)
  return body
})

async function buildLlmsFile(event: H3Event, section: LlmsSection | null): Promise<string> {
  const sitemaps = await readSitemaps(event)
  const site = getSiteConfig(event)
  const llmsSite = { name: site.name || 'skilld', description: site.description || '' }
  if (section) {
    const pages = sitemaps.get(section.sitemap) ?? []
    return renderLlmsSection({ site: llmsSite, section, pages, meta: await readPageMeta(event, pages) })
  }
  const pages = [...sitemaps.entries()].filter(([name]) => isPagesSitemap(name)).flatMap(([, list]) => list)
  return renderLlmsIndex({
    site: llmsSite,
    pages,
    sections: LLMS_SECTIONS.filter(entry => (sitemaps.get(entry.sitemap)?.length ?? 0) > 0),
    meta: await readPageMeta(event, pages),
  })
}

/** Pages by sitemap name, read from the sitemap index the site serves. */
async function readSitemaps(event: H3Event): Promise<Map<string, SitemapPage[]>> {
  const index = await event.$fetch<string>('/sitemap_index.xml', { responseType: 'text' })
  const byName = new Map<string, string[]>()
  for (const loc of parseSitemapLocs(index)) {
    const name = sitemapName(loc)
    if (!name || !readableSitemap(name))
      continue
    const xml = await event.$fetch<string>(new URL(loc, SITE_ORIGIN).pathname, { responseType: 'text' })
    byName.set(name, [...byName.get(name) ?? [], ...parseSitemapLocs(xml)])
  }
  return new Map([...byName].map(([name, locs]) => [name, sitemapPages(locs)]))
}

/** Titles and descriptions that nuxt-ai-ready stored when it rendered each page. */
async function readPageMeta(event: H3Event, pages: readonly SitemapPage[]): Promise<Map<string, PageMeta>> {
  const db = event.context.platform.db
  const meta = new Map<string, PageMeta>()
  for (let i = 0; i < pages.length; i += META_BATCH) {
    const routes = pages.slice(i, i + META_BATCH).map(page => page.path)
    const { results } = await db
      .prepare(`SELECT route, title, description FROM ai_ready_pages WHERE is_error = 0 AND route IN (${routes.map(() => '?').join(', ')})`)
      .bind(...routes)
      .all<{ route: string, title: string, description: string }>()
    for (const row of results ?? [])
      meta.set(row.route, { title: row.title, description: row.description })
  }
  return meta
}
