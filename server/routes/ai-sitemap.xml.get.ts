/// <reference types="@cloudflare/workers-types" />

// 2026-08-22 agent lane (GOOGLE_RECOVERY.md): an agent-only sitemap listing
// every AI-ready page, including pages that are noindex for Google. Referenced
// from llms.txt only, never robots.txt, so it cannot couple agent discovery to
// the Google recovery surface. Google officially ignores llms.txt, and even if
// it found this file the worst case is minor crawl waste on URLs that answer
// noindex.
export default defineEventHandler(async (event) => {
  const db = event.context.platform?.db
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'AI sitemap unavailable' })
  }

  const origin = 'https://skilld.dev'
  const res = await db
    .prepare(
      `SELECT route, updated_at FROM ai_ready_pages
       WHERE indexed = 1 AND is_error = 0
       ORDER BY route ASC`,
    )
    .all<{ route: string, updated_at: string }>()

  const rows = res.results ?? []
  const urls = rows.map((row) => {
    const lastmod = new Date(row.updated_at)
    const lastmodTag = Number.isNaN(lastmod.getTime())
      ? ''
      : `<lastmod>${lastmod.toISOString()}</lastmod>`
    return `  <url>\n    <loc>${origin}${escapeXml(row.route)}</loc>\n${lastmodTag ? `    ${lastmodTag}\n` : ''}  </url>`
  })

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- AI agent sitemap: every AI-ready page including noindex-for-Google pages.
     Linked from llms.txt; not submitted to any search engine. -->
${urls.join('\n')}
</urlset>
`
})

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
