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
  digest_frequency: 'weekly' | 'daily' | 'off'
  digest_dow: number | null
  digest_hour: number
  timezone: string
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

// Match the configured (dow, hour, tz) against the current UTC slot.
// Cron fires hourly; we check whether the user's local time right now
// is at their configured hour and (for weekly) day-of-week.
export function shouldFireForUser(user: DigestUser, nowSec: number): boolean {
  if (!user.email_opt_in)
    return false
  if (user.digest_frequency === 'off')
    return false
  if (!user.onboarded_at)
    return false
  // Project nowSec into the user's timezone using Intl. We get hour + dow.
  let hour: number
  let dow: number
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: user.timezone,
      hour: '2-digit',
      hour12: false,
      weekday: 'short',
    })
    const parts = fmt.formatToParts(new Date(nowSec * 1000))
    const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0'
    hour = Number.parseInt(hourStr, 10)
    if (hour === 24)
      hour = 0
    const wk = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
    dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wk)
  }
  catch {
    return false
  }
  if (hour !== user.digest_hour)
    return false
  if (user.digest_frequency === 'weekly' && dow !== (user.digest_dow ?? 1))
    return false
  return true
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
    `SELECT s.owner, s.repo, sub.source AS source, COUNT(*) AS change_count
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
    source: string
    change_count: number
  }>()

  const groups = rows.results ?? []
  if (!groups.length) {
    return { user, windowStart, windowEnd, cursorStart, cursorEnd, entries: [] }
  }

  const detailStatements = groups.map(group => group.source === 'like'
    ? db.prepare(
        `SELECT a.id, a.name AS skill_name, s.description, a.occurred_at, a.sha,
                s.current_sha, s.rendered_skill_path
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
        `SELECT a.id, a.name AS skill_name, s.description, a.occurred_at, a.sha,
                s.current_sha, s.rendered_skill_path
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
    sha: string
    current_sha: string
    rendered_skill_path: string
  }>(detailStatements)

  const selectedSkills: Array<{
    entryIndex: number
    skillIndex: number
    owner: string
    repo: string
    name: string
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
      latestSha: string
      currentSha: string
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
        latestSha: row.sha,
        currentSha: row.current_sha,
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
    const skills = selected.map(skill => ({
      name: skill.name,
      description: skill.description,
      changeCount: skill.changeCount,
      commitMessages: skill.commitMessages,
      changedAt: skill.sourceEnd,
      sourceUrl: githubSkillSourceUrl({
        owner: group.owner,
        repo: group.repo,
        name: skill.name,
        currentSha: skill.currentSha,
        path: skill.path,
      }),
      changeUrl: githubSkillChangeUrl({ owner: group.owner, repo: group.repo, sha: skill.latestSha }),
    }))
    selected.forEach((skill, skillIndex) => selectedSkills.push({
      entryIndex,
      skillIndex,
      owner: group.owner,
      repo: group.repo,
      name: skill.name,
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

  const messageStatements = selectedSkills.map(skill => db.prepare(
    `SELECT message
     FROM skill_revisions
     WHERE owner = ?1
       AND repo = ?2
       AND name = ?3
       AND modified_at >= ?4
       AND modified_at <= ?5
       AND message IS NOT NULL
       AND trim(message) != ''
     ORDER BY modified_at DESC
     LIMIT 20`,
  ).bind(
    skill.owner,
    skill.repo,
    skill.name,
    skill.sourceStart,
    skill.sourceEnd,
  ))
  const messages = messageStatements.length
    ? await db.batch<{ message: string }>(messageStatements)
    : []
  selectedSkills.forEach((selected, index) => {
    entries[selected.entryIndex]!.skills[selected.skillIndex]!.commitMessages
      = (messages[index]?.results ?? []).map(row => row.message)
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
    `SELECT id, login, name, digest_email, email, email_opt_in,
            digest_frequency, digest_dow, digest_hour, timezone, onboarded_at
     FROM users
     WHERE email_opt_in = 1
       AND digest_frequency != 'off'
       AND onboarded_at IS NOT NULL`,
  ).all<DigestUser>()
  return res.results ?? []
}
