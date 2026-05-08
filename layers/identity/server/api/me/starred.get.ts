import { requireUserRow } from '../../utils/users'

interface Row {
  owner: string
  repo: string
  starred_at: number
  has_skill: number
  watching: number
  skill_name: string | null
  skill_display: string | null
  skill_slug: string | null
}

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const db = event.context.cloudflare.env.DB as D1Database
  const res = await db.prepare(
    `SELECT s.owner, s.repo, s.starred_at, s.has_skill,
            CASE WHEN sub.user_id IS NULL THEN 0 ELSE 1 END as watching,
            sk.name as skill_name, sk.display_name as skill_display, sk.slug as skill_slug
     FROM user_starred_repos s
     LEFT JOIN skills sk ON sk.owner = s.owner AND sk.repo = s.repo
     LEFT JOIN skill_subscriptions sub ON sub.user_id = s.user_id AND sub.owner = s.owner AND sub.repo = s.repo
     WHERE s.user_id = ?1
     ORDER BY s.has_skill DESC, s.starred_at DESC, sk.name
     LIMIT 1000`,
  ).bind(u.id).all<Row>()

  const byRepo = new Map<string, {
    owner: string
    repo: string
    starredAt: number
    hasSkill: boolean
    watching: boolean
    skills: Array<{ name: string, displayName: string, slug: string }>
  }>()
  for (const r of res.results ?? []) {
    const key = `${r.owner}/${r.repo}`
    let entry = byRepo.get(key)
    if (!entry) {
      entry = {
        owner: r.owner,
        repo: r.repo,
        starredAt: r.starred_at,
        hasSkill: !!r.has_skill,
        watching: !!r.watching,
        skills: [],
      }
      byRepo.set(key, entry)
    }
    if (r.skill_name && r.skill_slug) {
      entry.skills.push({
        name: r.skill_name,
        displayName: r.skill_display ?? r.skill_name,
        slug: r.skill_slug,
      })
    }
  }

  return {
    items: [...byRepo.values()],
    syncedAt: u.stars_synced_at,
  }
})
