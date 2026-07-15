import { getDB } from '#server/utils/db'

interface CollectionRow {
  author_login: string
  slug: string
  updated_at: number
}

export default defineSitemapEventHandler(async (event) => {
  const db = getDB(event)
  const res = await db
    .prepare(
      `SELECT u.login AS author_login, c.slug, c.updated_at
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE c.deleted_at IS NULL
       ORDER BY c.updated_at DESC`,
    )
    .all<CollectionRow>()

  const rows = res.results ?? []
  const authors = new Map<string, number>()
  const collectionUrls = rows.map((row) => {
    const prev = authors.get(row.author_login) ?? 0
    if (row.updated_at > prev)
      authors.set(row.author_login, row.updated_at)
    return {
      loc: `/@${row.author_login}/${row.slug}`,
      lastmod: new Date(row.updated_at * 1000).toISOString(),
    }
  })
  const authorUrls = Array.from(authors.entries()).map(([login, lastmod]) => ({
    loc: `/@${login}`,
    lastmod: new Date(lastmod * 1000).toISOString(),
  }))
  return [...authorUrls, ...collectionUrls]
})
