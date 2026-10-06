import { findRepositoryAlias } from './repository-aliases'

export interface SkillRunIdentityQuery {
  owner: string
  repository: string
  /** The registry Skill name: the folder name, or the Repository name at the root. */
  name: string
}

export interface SkillRunIdentity {
  /** The admitted Skill folder inside the Repository, or `.` for the root. */
  skillPath: string
  /** The commit the Skill page names as its source, or null before the first revision. */
  commitSha: string | null
}

interface IdentityRow {
  rendered_skill_path: string
  commit_sha: string | null
}

/**
 * The admitted identity that `skilld run OWNER/REPOSITORY/NAME` resolves.
 *
 * The registry admits one folder per name and renders the SKILL.md the Skill
 * page shows. Delivery used to search the Repository tree for the name
 * instead, so it could disagree with the registry: copies in Agent folders
 * failed as ambiguous, and Repositories over 2,000 entries failed outright.
 * The commit is the source commit the Skill page names, so a run delivers the
 * SKILL.md bytes the page shows.
 *
 * Owner and Repository match without case, like `findSkillPagePath`, because
 * the registry keeps the case it first admitted. A row whose case matches
 * exactly wins. A row with no rendered path, or whose source is gone, has no
 * identity to run.
 *
 * A Repository that moved keeps answering under its old name, so a run
 * command printed before the move resolves the identity the page shows now.
 */
export async function findSkillRunIdentity(
  db: D1Database,
  query: SkillRunIdentityQuery,
): Promise<SkillRunIdentity | null> {
  const identity = await findAdmittedIdentity(db, query)
  if (identity)
    return identity
  const alias = await findRepositoryAlias(db, { owner: query.owner, repo: query.repository })
  if (!alias)
    return null
  return await findAdmittedIdentity(db, {
    owner: alias.targetOwner,
    repository: alias.targetRepo,
    name: alias.rootSkill === query.name.toLowerCase() && alias.targetRootSkill ? alias.targetRootSkill : query.name,
  })
}

async function findAdmittedIdentity(
  db: D1Database,
  query: SkillRunIdentityQuery,
): Promise<SkillRunIdentity | null> {
  const row = await db
    .prepare(`
      SELECT s.rendered_skill_path,
        (SELECT sr.sha FROM skill_revisions sr
          WHERE sr.owner = s.owner AND sr.repo = s.repo AND sr.name = s.name
          ORDER BY sr.modified_at DESC LIMIT 1) AS commit_sha
      FROM skills s
      WHERE s.owner = ?1 COLLATE NOCASE AND s.repo = ?2 COLLATE NOCASE AND s.name = ?3
        AND s.source_resolved = 1 AND s.rendered_skill_path IS NOT NULL
      ORDER BY (s.owner = ?1 AND s.repo = ?2) DESC
      LIMIT 1`)
    .bind(query.owner, query.repository, query.name)
    .first<IdentityRow>()
  if (!row)
    return null
  return {
    skillPath: skillFolder(row.rendered_skill_path),
    commitSha: row.commit_sha,
  }
}

function skillFolder(renderedPath: string): string {
  return renderedPath === 'SKILL.md' ? '.' : renderedPath.replace(/\/SKILL\.md$/, '')
}
