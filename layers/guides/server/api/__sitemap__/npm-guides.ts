import { listGuidesForSitemap } from '../../utils/npm-guides'

export default defineSitemapEventHandler(async (event) => {
  const guides = await listGuidesForSitemap(event)
  return guides.map(g => ({
    loc: `/guides/npm/${g.slug}`,
    lastmod: g.generatedAt,
    changefreq: 'weekly' as const,
  }))
})
