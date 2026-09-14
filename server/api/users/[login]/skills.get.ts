import type { H3Event } from 'h3'
import type { Platform } from '#shared/server/platform'

import { cached } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { canonicalRepoSkillPath } from '#shared/skill-routes'

const USER_SKILLS_CACHE_TTL = 60
const USER_SKILLS_CACHE_STALE_TTL = 60 * 5

interface SkillRow {
  name: string
  owner: string
  repo: string
  display_name: string | null
  slug: string
  description: string | null
  likeCount: number
  modified_at: number | null
  last_synced_at: number | null
  skill_path: string | null
  source_owner: string | null
  source_repo: string | null
  default_branch: string | null
  repo_skill_count: number
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    if (!login)
      throw createError({ statusCode: 400, message: 'login required' })

    return cached({
      storage: useStorage('cache'),
      key: `user-skills:${login.toLowerCase()}`,
      ttlSeconds: USER_SKILLS_CACHE_TTL,
      staleSeconds: USER_SKILLS_CACHE_STALE_TTL,
      compute: () => loadUserSkills(platform, login),
      schedule: promise => runAfterResponse(event, promise),
    })
  },
})

async function loadUserSkills(platform: Platform, login: string) {
  const res = await platform.db
    .prepare(
      `SELECT s.name, s.owner, s.repo, s.display_name, s.slug, s.description,
              s.like_count AS likeCount,
              s.modified_at, s.last_synced_at, s.rendered_skill_path AS skill_path,
              r.source_owner, r.source_repo, r.default_branch,
              (SELECT COUNT(*) FROM skills repo_skills
               WHERE repo_skills.owner = s.owner
                 AND repo_skills.repo = s.repo
                 AND repo_skills.source_resolved = 1) AS repo_skill_count
       FROM skills s
       JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
       WHERE s.owner = ?1 COLLATE NOCASE
       ORDER BY COALESCE(s.modified_at, s.last_synced_at, 0) DESC`,
    )
    .bind(login)
    .all<SkillRow>()

  return {
    ok: true as const,
    items: (res.results ?? []).map(skill => ({
      ...skill,
      registryPath: canonicalRepoSkillPath({
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        repoSkillCount: skill.repo_skill_count,
      }),
    })),
  }
}

function runAfterResponse(event: H3Event, promise: Promise<unknown>): void {
  const ctx = (event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise)
    return
  }
  // Local dev / non-Workers: don't block the response, but make sure the
  // promise isn't an unhandled rejection.
  void promise
}
