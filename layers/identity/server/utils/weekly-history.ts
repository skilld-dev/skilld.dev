/// <reference types="@cloudflare/workers-types" />

/** A sent Skill can return after roughly two calendar months. */
export const WEEKLY_RESURFACE_SECONDS = 60 * 24 * 60 * 60

export interface WeeklySkillIdentity {
  owner: string
  repo: string
  slug: string
}

export function weeklySkillKey(skill: WeeklySkillIdentity): string {
  return `${skill.owner}/${skill.repo}/${skill.slug}`
}

export async function loadRecentWeeklySkillKeys(
  db: D1Database,
  now: number,
): Promise<ReadonlySet<string>> {
  const rows = await db.prepare(
    `SELECT owner, repo, name
     FROM weekly_skill_sends
     WHERE sent_at > ?1
     GROUP BY owner, repo, name`,
  ).bind(now - WEEKLY_RESURFACE_SECONDS).all<{
    owner: string
    repo: string
    name: string
  }>()

  return new Set((rows.results ?? []).map(row => weeklySkillKey({ ...row, slug: row.name })))
}

export function excludeRecentlySentWeeklySkills<T extends WeeklySkillIdentity>(
  skills: readonly T[],
  recentKeys: ReadonlySet<string>,
  limit: number,
): T[] {
  return skills.filter(skill => !recentKeys.has(weeklySkillKey(skill))).slice(0, limit)
}

export async function recordWeeklySkillsSent(
  db: D1Database,
  input: {
    windowEnd: number
    sentAt: number
    skills: readonly WeeklySkillIdentity[]
  },
): Promise<void> {
  if (!input.skills.length)
    return

  await db.batch(input.skills.map(skill => db.prepare(
    `INSERT INTO weekly_skill_sends (window_end, owner, repo, name, sent_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (window_end, owner, repo, name) DO NOTHING`,
  ).bind(input.windowEnd, skill.owner, skill.repo, skill.slug, input.sentAt)))
}
