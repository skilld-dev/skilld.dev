import { githubSkillChangeUrl, githubSkillSourceUrl } from './email-skill-links'

// Per-user "should we send and what's in the email" selection. Pure DB
// queries; no side effects. Returns null when no eligible work.

export interface DigestUser {
  id: number
  login: string
  name?: string | null
  digest_email: string | null
  email: string | null
  email_opt_in: number
  onboarded_at: number | null
}

export interface DigestEntry {
  owner: string
  repo: string
  skillNames: string[]
  skills: Array<{
    name: string
    description: string | null
    changeCount: number
    commitMessages: string[]
    changedAt: number
    sourceUrl: string
    changeUrl: string
  }>
  changeCount: number
}

export interface DigestSelection {
  user: DigestUser
  windowStart: number
  windowEnd: number
  cursorStart: number
  cursorEnd: number
  entries: DigestEntry[]
}

export async function selectDigestForUser(
  db: D1Database,
  user: DigestUser,
  nowSec: number,
  opts: {
    windowStart?: number
    cursorStart?: number
    cursorEnd?: number
  } = {},
): Promise<DigestSelection | null> {
  const windowStart = opts.windowStart ?? user.onboarded_at ?? 0
  const windowEnd = nowSec
  const cursorStart = opts.cursorStart ?? await activityCursorAt(db, windowStart)
  const cursorEnd = opts.cursorEnd ?? await activityCursorAt(db, windowEnd)

  // Subscriptions are repo-grained but likes are skill-grained, so a user who
  // liked one skill in a twenty-skill repo would otherwise be sent all twenty.
  // A like-sourced subscription is narrowed to the skills actually liked; every
  // other source ('manual', 'star-import', 'collection:*') keeps whole-repo
  // scope, because those were deliberate repo-level choices.
  //
  // The same predicate has to appear in the detail query below: the two counts
  // are cross-checked, and a mismatch aborts the send.
  const LIKE_SCOPE_SQL = `EXISTS (
    SELECT 1 FROM skill_likes l
    WHERE l.user_id = ?1 AND l.owner = a.owner AND l.repo = a.repo AND l.name = a.name
  )`

  const rows = await db.prepare(
    `SELECT s.owner, s.repo, r.default_branch, sub.source AS source, COUNT(*) AS change_count
     FROM activity a
     JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
     JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
     JOIN skill_subscriptions sub ON sub.user_id = ?1 AND sub.owner = s.owner AND sub.repo = s.repo
     WHERE a.id > ?2 AND a.id <= ?3
       AND (sub.muted_until IS NULL OR sub.muted_until <= ?4)
       AND r.repo_kind != 'aggregator'
       AND s.current_sha IS NOT NULL
       AND TRIM(s.current_sha) != ''
       AND s.rendered_skill_path IS NOT NULL
       AND TRIM(s.rendered_skill_path) != ''
       AND (sub.source != 'like' OR ${LIKE_SCOPE_SQL})
     GROUP BY s.owner, s.repo, sub.source
     ORDER BY change_count DESC, s.owner ASC, s.repo ASC
     LIMIT 30`,
  ).bind(user.id, cursorStart, cursorEnd, windowEnd).all<{
    owner: string
    repo: string
    default_branch: string | null
    source: string
    change_count: number
  }>()

  const groups = rows.results ?? []
  if (!groups.length) {
    return { user, windowStart, windowEnd, cursorStart, cursorEnd, entries: [] }
  }

  const detailStatements = groups.map(group => group.source === 'like'
    ? db.prepare(
        `SELECT a.id, a.name AS skill_name, s.description, a.occurred_at, s.rendered_skill_path
     FROM activity a
     JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
     WHERE a.owner = ?2
       AND a.repo = ?3
       AND a.id > ?4
       AND a.id <= ?5
       AND s.current_sha IS NOT NULL
       AND TRIM(s.current_sha) != ''
       AND s.rendered_skill_path IS NOT NULL
       AND TRIM(s.rendered_skill_path) != ''
       AND ${LIKE_SCOPE_SQL}
     ORDER BY a.id DESC`,
      ).bind(user.id, group.owner, group.repo, cursorStart, cursorEnd)
    : db.prepare(
        `SELECT a.id, a.name AS skill_name, s.description, a.occurred_at, s.rendered_skill_path
     FROM activity a
     JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
     WHERE a.owner = ?1
       AND a.repo = ?2
       AND a.id > ?3
       AND a.id <= ?4
       AND s.current_sha IS NOT NULL
       AND TRIM(s.current_sha) != ''
       AND s.rendered_skill_path IS NOT NULL
       AND TRIM(s.rendered_skill_path) != ''
     ORDER BY a.id DESC`,
      ).bind(group.owner, group.repo, cursorStart, cursorEnd))
  const details = await db.batch<{
    id: number
    skill_name: string
    description: string | null
    occurred_at: number
    rendered_skill_path: string
  }>(detailStatements)

  const selectedSkills: Array<{
    entryIndex: number
    skillIndex: number
    owner: string
    repo: string
    name: string
    path: string
    branch: string | null
    sourceStart: number
    sourceEnd: number
  }> = []
  const entries: DigestEntry[] = groups.map((group, entryIndex) => {
    const rows = details[entryIndex]?.results ?? []
    const bySkill = new Map<string, {
      name: string
      description: string | null
      changeCount: number
      commitMessages: string[]
      sourceStart: number
      sourceEnd: number
      path: string
    }>()
    for (const row of rows) {
      const skill = bySkill.get(row.skill_name) ?? {
        name: row.skill_name,
        description: row.description,
        changeCount: 0,
        commitMessages: [],
        sourceStart: row.occurred_at,
        sourceEnd: row.occurred_at,
        path: row.rendered_skill_path,
      }
      skill.changeCount += 1
      skill.sourceStart = Math.min(skill.sourceStart, row.occurred_at)
      skill.sourceEnd = Math.max(skill.sourceEnd, row.occurred_at)
      bySkill.set(row.skill_name, skill)
    }
    if (rows.length !== group.change_count)
      throw new Error(`Digest activity count changed during selection for ${group.owner}/${group.repo}`)
    const selected = [...bySkill.values()].sort((a, b) => a.name.localeCompare(b.name))
    // `changeUrl` starts at the file history. The revision batch below points
    // it at the change commit, because `activity.sha` is a blob sha.
    const skills = selected.map((skill) => {
      const file = { owner: group.owner, repo: group.repo, path: skill.path, branch: group.default_branch }
      return {
        name: skill.name,
        description: skill.description,
        changeCount: skill.changeCount,
        commitMessages: skill.commitMessages,
        changedAt: skill.sourceEnd,
        sourceUrl: githubSkillSourceUrl(file),
        changeUrl: githubSkillChangeUrl({ ...file, commitSha: null }),
      }
    })
    selected.forEach((skill, skillIndex) => selectedSkills.push({
      entryIndex,
      skillIndex,
      owner: group.owner,
      repo: group.repo,
      name: skill.name,
      path: skill.path,
      branch: group.default_branch,
      sourceStart: skill.sourceStart,
      sourceEnd: skill.sourceEnd,
    }))
    return {
      owner: group.owner,
      repo: group.repo,
      skillNames: skills.map(skill => skill.name),
      skills,
      changeCount: rows.length,
    }
  })

  const revisionStatements = selectedSkills.map(skill => db.prepare(
    `SELECT sha, message
     FROM skill_revisions
     WHERE owner = ?1
       AND repo = ?2
       AND name = ?3
       AND modified_at >= ?4
       AND modified_at <= ?5
     ORDER BY modified_at DESC
     LIMIT 20`,
  ).bind(
    skill.owner,
    skill.repo,
    skill.name,
    skill.sourceStart,
    skill.sourceEnd,
  ))
  const revisions = revisionStatements.length
    ? await db.batch<{ sha: string, message: string | null }>(revisionStatements)
    : []
  selectedSkills.forEach((selected, index) => {
    const rows = revisions[index]?.results ?? []
    const skill = entries[selected.entryIndex]!.skills[selected.skillIndex]!
    skill.commitMessages = rows.flatMap(row => row.message?.trim() ? [row.message] : [])
    const latest = rows[0]
    if (latest) {
      skill.changeUrl = githubSkillChangeUrl({
        owner: selected.owner,
        repo: selected.repo,
        path: selected.path,
        branch: selected.branch,
        commitSha: latest.sha,
      })
    }
  })

  return { user, windowStart, windowEnd, cursorStart, cursorEnd, entries }
}

async function activityCursorAt(db: D1Database, ingestedAt: number): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(id), 0) AS cursor
     FROM activity
     WHERE ingested_at <= ?1`,
  ).bind(ingestedAt).first<{ cursor: number }>()
  return row?.cursor ?? 0
}

export async function loadDigestEligibleUsers(db: D1Database): Promise<DigestUser[]> {
  const res = await db.prepare(
    `SELECT id, login, name, digest_email, email, email_opt_in, onboarded_at
     FROM users
     WHERE email_opt_in = 1
       AND onboarded_at IS NOT NULL`,
  ).all<DigestUser>()
  return res.results ?? []
}
