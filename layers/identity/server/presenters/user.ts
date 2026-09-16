import type { UserRow } from '../utils/users'
import { weeklyDeliveryActive } from '../utils/weekly-select'

interface StarredRow {
  owner: string
  repo: string
  starred_at: number
  has_skill: number
  watching: number
  skill_name: string | null
  skill_display: string | null
  skill_slug: string | null
}

export interface StarredRepoEntry {
  owner: string
  repo: string
  starredAt: number
  hasSkill: boolean
  watching: boolean
  skills: Array<{ name: string, displayName: string, slug: string }>
}

export function starredReposPresenter(
  rows: StarredRow[],
  syncedAt: number | null,
): { items: StarredRepoEntry[], syncedAt: number | null } {
  const byRepo = new Map<string, StarredRepoEntry>()
  for (const r of rows) {
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
  return { items: [...byRepo.values()], syncedAt }
}

export function mePresenter(u: UserRow) {
  return {
    id: u.id,
    login: u.login,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    digest_email: u.digest_email,
    email_opt_in: !!u.email_opt_in,
    // Effective delivery, not the raw switch: the badge must not promise the
    // weekly to someone the consent gate excludes.
    weekly_opt_in: weeklyDeliveryActive(u),
    timezone: u.timezone,
    stars_synced_at: u.stars_synced_at,
    onboarded_at: u.onboarded_at,
    likes_public: !!u.likes_public,
  }
}
