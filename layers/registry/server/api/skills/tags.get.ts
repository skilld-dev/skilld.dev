import { getDB } from '#server/utils/db'
import { TAXONOMY } from '../../jobs/taxonomy'
import { notBrokenSql } from '../../utils/broken'

const NOT_BROKEN_SQL = notBrokenSql('r')

export interface TagFacet {
  slug: string
  label: string
  description: string
  count: number
}

export interface TagFacetsResponse {
  tags: TagFacet[]
  total: number
}

export default defineCachedEventHandler(async (event): Promise<TagFacetsResponse> => {
  const db = getDB(event)

  const res = await db
    .prepare(
      `SELECT je.value AS slug, COUNT(DISTINCT sg.owner || '/' || sg.repo || '/' || sg.name) AS count
       FROM skill_generated sg, json_each(sg.payload, '$.tags') je
       JOIN skills s ON s.owner = sg.owner AND s.repo = sg.repo AND s.name = sg.name
       JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
       WHERE sg.kind = 'tags' AND ${NOT_BROKEN_SQL}
       GROUP BY je.value`,
    )
    .all<{ slug: string, count: number }>()

  const counts = new Map<string, number>()
  for (const r of res.results ?? [])
    counts.set(r.slug, r.count)

  const tags: TagFacet[] = TAXONOMY
    .map(t => ({
      slug: t.slug,
      label: t.label,
      description: t.description,
      count: counts.get(t.slug) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const total = tags.reduce((n, t) => n + t.count, 0)
  return { tags, total }
}, {
  maxAge: 60 * 5,
  swr: true,
  getKey: () => 'skills:tag-facets:v1',
})
