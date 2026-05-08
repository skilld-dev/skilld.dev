// Per-user "should we send and what's in the email" selection. Pure DB
// queries; no side effects. Returns null when no eligible work.

export interface DigestUser {
  id: number
  login: string
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
  skillName: string
  description: string | null
  commitCount: number
  commitMessages: string[]
}

export interface DigestSelection {
  user: DigestUser
  windowStart: number
  windowEnd: number
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
  const target = (user.digest_email || user.email || '').trim()
  if (!target)
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
): Promise<DigestSelection | null> {
  // Window: from MAX(last digest_runs.window_end, onboarded_at) to now.
  const last = await db.prepare(
    `SELECT MAX(window_end) AS we FROM digest_runs WHERE user_id = ?1`,
  ).bind(user.id).first<{ we: number | null }>()
  const windowStart = Math.max(last?.we ?? 0, user.onboarded_at ?? 0)
  const windowEnd = nowSec

  // Aggregate activity rows joined to skill_subscriptions for this user.
  // Group by (owner, repo). One repo with many skills folds into one entry —
  // pick the lowest skill name alphabetically for the displayed link.
  const rows = await db.prepare(
    `SELECT s.owner, s.repo, s.name AS skill_name, s.description AS description,
            COUNT(*) AS commit_count
     FROM activity a
     JOIN skills s ON s.owner = a.owner AND s.name = a.name
     JOIN skill_subscriptions sub ON sub.user_id = ?1 AND sub.owner = s.owner AND sub.repo = s.repo
     WHERE a.occurred_at > ?2 AND a.occurred_at <= ?3
       AND (sub.muted_until IS NULL OR sub.muted_until <= ?3)
     GROUP BY s.owner, s.repo
     ORDER BY commit_count DESC, s.owner ASC, s.repo ASC
     LIMIT 30`,
  ).bind(user.id, windowStart, windowEnd).all<{
    owner: string
    repo: string
    skill_name: string
    description: string | null
    commit_count: number
  }>()

  const groups = rows.results ?? []
  if (!groups.length) {
    return { user, windowStart, windowEnd, entries: [] }
  }

  // Pull recent commit messages per group via a follow-up batch.
  const messageStmts = groups.map(g => db.prepare(
    `SELECT message FROM skill_revisions
     WHERE owner = ?1 AND name = ?2 AND modified_at > ?3 AND modified_at <= ?4
     ORDER BY modified_at DESC LIMIT 20`,
  ).bind(g.owner, g.skill_name, windowStart, windowEnd))
  const batch = messageStmts.length ? await db.batch<{ message: string | null }>(messageStmts) : []

  const entries: DigestEntry[] = groups.map((g, i) => ({
    owner: g.owner,
    repo: g.repo,
    skillName: g.skill_name,
    description: g.description,
    commitCount: g.commit_count,
    commitMessages: ((batch[i]?.results ?? []) as Array<{ message: string | null }>)
      .map(r => r.message)
      .filter((m): m is string => !!m && m.trim().length > 0),
  }))

  return { user, windowStart, windowEnd, entries }
}

export async function loadDigestEligibleUsers(db: D1Database): Promise<DigestUser[]> {
  const res = await db.prepare(
    `SELECT id, login, digest_email, email, email_opt_in,
            digest_frequency, digest_dow, digest_hour, timezone, onboarded_at
     FROM users
     WHERE email_opt_in = 1
       AND digest_frequency != 'off'
       AND onboarded_at IS NOT NULL`,
  ).all<DigestUser>()
  return res.results ?? []
}
