import { resolveRepoSourceIdentityFromRow } from './repo-source-identity'

interface SkillIdentity {
  owner: string
  repo: string
  name: string
}

interface SkillCommitSourceRow {
  rendered_skill_path: string | null
  source_owner: string | null
  source_repo: string | null
}

export interface SkillCommitSource {
  owner: string
  repo: string
  path: string
}

export async function findSkillCommitSource(
  db: D1Database,
  skill: SkillIdentity,
): Promise<SkillCommitSource | null> {
  const row = await db
    .prepare(`SELECT s.rendered_skill_path, r.source_owner, r.source_repo
              FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
              WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
    .bind(skill.owner, skill.repo, skill.name)
    .first<SkillCommitSourceRow>()

  if (!row?.rendered_skill_path)
    return null

  const source = resolveRepoSourceIdentityFromRow(skill, row)
  return {
    ...source,
    path: row.rendered_skill_path,
  }
}
