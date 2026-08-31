import { defineApiHandler } from '#shared/server/handler'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { notAggregatorSql, notBrokenSql } from '../../utils/broken'

const NOT_BROKEN_SQL = notBrokenSql('r')
const NOT_AGGREGATOR_SQL = notAggregatorSql('r')

/**
 * One skill as `[name, owner, repo, stars, registryPath]`.
 *
 * Tuples rather than objects: at registry scale the repeated JSON keys cost
 * more than the data. The client rehydrates these in `useSkillSearch`.
 *
 * Stars, not installs: canonical GitHub stars are the ranking evidence, and
 * install counts are deliberately not a ranking signal.
 */
export type TypeaheadTuple = [string, string, string, number, string]

export interface TypeaheadIndex {
  skills: TypeaheadTuple[]
  generatedAt: number
}

interface Row {
  name: string
  owner: string
  repo: string
  stars: number | null
  repo_skill_count: number
}

/**
 * A prefix-matchable index of every discoverable skill, small enough to ship
 * to the browser once and query locally.
 *
 * This exists to make the first keystroke free. A hybrid search round trip is
 * fast but never instant, and the registry is small enough (~5.6k skills) that
 * exact name and owner prefixes can be answered on the client with no network
 * at all. Semantic results stream in behind these, so the panel is never empty
 * while it waits.
 *
 * Identifiers only. This index cannot answer "debug a flaky test"; that is the
 * server's job.
 */
export default defineApiHandler<never, TypeaheadIndex>({
  handler: async ({ platform }): Promise<TypeaheadIndex> => {
    const res = await platform.db
      .prepare(
        `SELECT s.name, s.owner, s.repo, r.stars,
                (SELECT COUNT(*) FROM skills repo_skills
                 WHERE repo_skills.owner = s.owner
                   AND repo_skills.repo = s.repo
                   AND repo_skills.source_resolved = 1) AS repo_skill_count
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE ${NOT_BROKEN_SQL}
           AND ${NOT_AGGREGATOR_SQL}
           AND s.seo_indexable = 1
         ORDER BY r.stars DESC, s.owner ASC, s.name ASC`,
      )
      .all<Row>()

    return {
      skills: (res.results ?? []).map(r => [
        r.name,
        r.owner,
        r.repo,
        r.stars ?? 0,
        canonicalRepoSkillPath({
          owner: r.owner,
          repo: r.repo,
          name: r.name,
          repoSkillCount: r.repo_skill_count,
        }),
      ] as TypeaheadTuple),
      generatedAt: Math.floor(Date.now() / 1000),
    }
  },
})
