import type { SkillValidationIssue } from '#shared/skill-validation'
import { validateSkillFrontmatter } from '#shared/skill-validation'

export interface RepositorySkillValidation {
  checked: number
  pending: number
  items: Array<{
    repository: string
    name: string
    sourceUrl: string
    issues: SkillValidationIssue[]
  }>
}

interface SourceRow {
  repo: string
  name: string
  rendered_raw: string | null
  rendered_skill_path: string | null
  rendered_commit_sha: string | null
  source_owner: string | null
  source_repo: string | null
  is_fork: number | null
}

/** Select sources explicitly. Callers own authorization and presentation. */
export type RepositoryValidationSelection
  = { _tag: 'owner', owner: string }
    | { _tag: 'repository', owner: string, repo: string }

export async function loadRepositorySkillValidation(db: D1Database, selection: RepositoryValidationSelection): Promise<RepositorySkillValidation> {
  const result: RepositorySkillValidation = { checked: 0, pending: 0, items: [] }
  let after = ''
  // Page source bytes so each read stays below D1's response size limit.
  for (;;) {
    const page = await db.prepare(`
      SELECT s.repo, s.name, s.rendered_raw, s.rendered_skill_path,
             s.rendered_commit_sha, r.source_owner, r.source_repo, r.is_fork
      FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
      WHERE s.owner = ?1 COLLATE NOCASE AND s.source_resolved = 1
        AND (?3 IS NULL OR s.repo = ?3 COLLATE NOCASE)
        AND (r.is_fork IS NULL OR r.is_fork = 0)
        AND (s.repo || char(0) || s.name) > ?2
      ORDER BY s.repo, s.name LIMIT 25
    `).bind(selection.owner, after, selection._tag === 'repository' ? selection.repo : null).all<SourceRow>()
    const rows = page.results ?? []
    for (const row of rows) {
      if (row.is_fork === null || !row.rendered_raw || !row.rendered_skill_path || !row.rendered_commit_sha) {
        result.pending++
        continue
      }
      result.checked++
      const issues = validateSkillFrontmatter(row.rendered_raw, row.rendered_skill_path, row.source_repo ?? row.repo)
      if (issues.length) {
        const owner = row.source_owner ?? selection.owner
        const repo = row.source_repo ?? row.repo
        const sourceUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(row.rendered_commit_sha)}/${row.rendered_skill_path.split('/').map(encodeURIComponent).join('/')}`
        result.items.push({ repository: `${selection.owner}/${row.repo}`, name: row.name, sourceUrl, issues })
      }
    }
    if (rows.length < 25)
      return result
    const last = rows.at(-1)!
    after = `${last.repo}\0${last.name}`
  }
}
