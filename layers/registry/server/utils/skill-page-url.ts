import { canonicalRepoSkillPath } from './skill-routes'

export interface SkillPageSource {
  owner: string
  repository: string
  /** Directory of the Skill inside the repository, or `.` for the root. */
  skillPath: string
}

interface PageRow {
  owner: string
  repo: string
  name: string
  repo_skill_count: number
}

/**
 * The canonical site path of the Skill at one repository path, or null when
 * the registry does not hold it.
 *
 * A non-null answer means the Skill page returns 200: the row exists, and the
 * detail route reads the same `skills` primary key. A row whose source is gone
 * answers null, because its page answers 410. The path comes from
 * `canonicalRepoSkillPath`, so a single-Skill repository answers with its hub
 * instead of the route that 301s there.
 *
 * Owner and repository match without case, because delivery reports GitHub's
 * canonical case while the registry keeps the case it first admitted. A row
 * whose case matches exactly wins, and the path keeps the registry case.
 *
 * One indexed read: `idx_skills_owner_nocase` bounds it to one owner's rows.
 * `rendered_skill_path` is null on rows that never rendered, so the directory
 * name stands in for those.
 */
export async function findSkillPagePath(
  db: D1Database,
  source: SkillPageSource,
): Promise<string | null> {
  const isRoot = source.skillPath === '.'
  const renderedPath = isRoot ? 'SKILL.md' : `${source.skillPath}/SKILL.md`
  const directoryName = isRoot ? null : source.skillPath.split('/').at(-1) ?? null
  const row = await db
    .prepare(`
      SELECT s.owner, s.repo, s.name,
        (SELECT COUNT(*) FROM skills c
          WHERE c.owner = s.owner AND c.repo = s.repo AND c.source_resolved = 1) AS repo_skill_count
      FROM skills s
      WHERE s.owner = ?1 COLLATE NOCASE AND s.repo = ?2 COLLATE NOCASE AND s.source_resolved = 1
        AND (s.rendered_skill_path = ?3 OR (s.rendered_skill_path IS NULL AND s.name = ?4))
      ORDER BY s.rendered_skill_path IS NULL, (s.owner = ?1 AND s.repo = ?2) DESC
      LIMIT 1`)
    .bind(source.owner, source.repository, renderedPath, directoryName)
    .first<PageRow>()
  if (!row)
    return null
  return canonicalRepoSkillPath({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    repoSkillCount: row.repo_skill_count,
  })
}
