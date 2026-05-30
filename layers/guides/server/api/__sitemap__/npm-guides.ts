import { listGuidesForSitemap } from '#layers/guides/server/utils/npm-guides'

export default defineSitemapEventHandler(async (event) => {
  const guides = await listGuidesForSitemap(event)
  return guides.map(g => ({
    loc: `/guides/${g.slug}`,
    lastmod: g.generatedAt,
    changefreq: 'weekly' as const,
  }))
})
