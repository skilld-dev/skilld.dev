import { listCollectionRecords } from '../../utils/atproto/collections'
import { getAllCurators } from '../../utils/atproto/curator-index'

export default defineSitemapEventHandler(async (event) => {
  const curators = await getAllCurators(getDB(event))

  const entries: { loc: string, changefreq: 'daily' | 'weekly' }[] = []

  await Promise.all(curators.map(async (curator) => {
    entries.push({ loc: `/people/${curator.handle}`, changefreq: 'daily' })

    const records = await listCollectionRecords(curator.did)
    for (const { rkey } of records) {
      entries.push({ loc: `/people/${curator.handle}/${rkey}`, changefreq: 'weekly' })
    }
  }))

  return entries
})
