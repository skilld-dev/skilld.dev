import { getCollectionsIndex } from '../../utils/atproto/collections'
import { getDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { did, slug } = getQuery(event) as { did?: string, slug?: string }
  if (!did || !slug)
    throw createError({ statusCode: 400, message: 'did and slug query params are required' })

  const index = await getCollectionsIndex(getDB(event))
  const all = [...index.featured, ...index.recent]
  const current = all.find(c => c.curator.did === did && c.slug === slug)

  const byCurator = all
    .filter(c => c.curator.did === did && c.slug !== slug)
    .slice(0, 3)

  const stackSet = new Set((current?.stacks ?? []).map(s => s.toLowerCase()))
  const byStack = stackSet.size === 0
    ? []
    : all
        .filter(c => c.curator.did !== did)
        .map(c => ({
          coll: c,
          shared: c.stacks.filter(s => stackSet.has(s.toLowerCase())).length,
        }))
        .filter(x => x.shared >= 2)
        .sort((a, b) => b.shared - a.shared || b.coll.updatedAt.localeCompare(a.coll.updatedAt))
        .slice(0, 3)
        .map(x => x.coll)

  return { byCurator, byStack }
})
