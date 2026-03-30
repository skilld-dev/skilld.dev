import { getPublicAgent } from '../../utils/atproto/agent'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { COLLECTION_NSID, parseCollectionRecord } from '../../utils/atproto/lexicons/collection'

export default defineSitemapEventHandler(async () => {
  const curators = await getAllCurators()
  const agent = getPublicAgent()

  const entries: { loc: string, changefreq: 'daily' | 'weekly' }[] = []

  await Promise.all(curators.map(async (curator) => {
    entries.push({ loc: `/people/${curator.handle}`, changefreq: 'daily' })

    const res = await agent.com.atproto.repo.listRecords({
      repo: curator.did,
      collection: COLLECTION_NSID,
      limit: 100,
    }).catch(() => null)

    if (!res?.data.records)
      return

    for (const r of res.data.records) {
      const record = parseCollectionRecord(r.value)
      if (!record)
        continue
      const rkey = r.uri.split('/').pop()!
      entries.push({ loc: `/people/${curator.handle}/${rkey}`, changefreq: 'weekly' })
    }
  }))

  return entries
})
