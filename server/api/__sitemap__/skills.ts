import { querySkills } from '../../utils/skills-registry'

export default defineSitemapEventHandler(async (event) => {
  // Fetch all skills for sitemap (paginate in large batches)
  const batchSize = 10000
  const urls: { loc: string, changefreq: 'weekly' }[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const result = await querySkills(event, { sort: 'name', page, limit: batchSize })
    for (const skill of result.items) {
      urls.push({
        loc: `/skills/${skill.owner}/${skill.repo}/${skill.name}`,
        changefreq: 'weekly',
      })
    }
    hasMore = page < result.pages
    page++
  }

  return urls
})
