import type { TrustedAuthorSourceRow } from '../../utils/trusted-author-sources'
import { getDB } from '#server/utils/db'
import { notBrokenSql } from '../../utils/broken'
import { buildTrustedAuthorSitemapEntries, trustedAuthorRepoKeys } from '../../utils/trusted-author-sources'

export default defineSitemapEventHandler(async (event) => {
  const db = getDB(event)
  const rows = await db
    .prepare(`
      SELECT
        lower(s.owner) AS owner,
        lower(s.repo) AS repo,
        COUNT(*) AS skillCount,
        MAX(COALESCE(s.modified_at, s.first_seen_at, r.pushed_at)) AS updatedAt
      FROM skills s
      JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
      WHERE ${notBrokenSql('r')}
        AND lower(s.owner || '/' || s.repo) IN (SELECT value FROM json_each(?))
      GROUP BY lower(s.owner), lower(s.repo)
      ORDER BY lower(s.owner), lower(s.repo)
    `)
    .bind(JSON.stringify(trustedAuthorRepoKeys))
    .all<TrustedAuthorSourceRow>()

  return buildTrustedAuthorSitemapEntries(rows.results ?? [])
})
