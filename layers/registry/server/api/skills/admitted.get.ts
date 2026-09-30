import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { listAllSkillsForSitemap } from '../../utils/skills-registry'
import { ADMITTED_PAGE_SIZE, listAdmittedSkills } from '../../utils/trending-admission'

const query = z.object({
  board: z.enum(['week', 'month', 'all']),
  page: z.coerce.number().int().min(1).default(1),
})

export interface AdmittedSkillItem {
  owner: string
  repo: string
  name: string
  /** Final public route. Clients must use this value directly. */
  registryPath: string
  description: string | null
  stars: number | null
}

export interface AdmittedSkillsResponse {
  items: AdmittedSkillItem[]
  page: number
  pageCount: number
  total: number
}

/**
 * Skills the SEO experiment admitted, by the board that first named them.
 * The trending pages render this list as plain links. Rule: `trending-admission.ts`.
 */
export default defineApiHandler({
  schema: query,
  handler: async ({ event, body, platform }) => {
    const indexable = await listAllSkillsForSitemap(event)
    return { ...await listAdmittedSkills(platform.db, { ...body, indexable }), page: body.page }
  },
  presenter: ({ rows, total, page }): AdmittedSkillsResponse => ({
    items: rows.map(row => ({
      owner: row.owner,
      repo: row.repo,
      name: row.name,
      registryPath: canonicalRepoSkillPath({
        owner: row.owner,
        repo: row.repo,
        name: row.name,
        repoSkillCount: row.repo_skill_count,
      }),
      description: row.description,
      stars: row.stars,
    })),
    page,
    pageCount: Math.max(1, Math.ceil(total / ADMITTED_PAGE_SIZE)),
    total,
  }),
})
