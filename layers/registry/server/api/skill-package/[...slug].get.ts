import { cached } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { presentPnpmPackage } from '../../presenters/pnpm-package'
import { pnpmPackageQuery, pnpmPackageSlug } from '../../schemas/pnpm-package'
import { detectPnpmPackage } from '../../utils/pnpm-package'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { findSkillWithRow } from '../../utils/skills-registry'

interface PackageSourceRow {
  owner: string
  repo: string
  source_owner: string | null
  source_repo: string | null
  default_branch: string | null
  rendered_skill_path: string | null
  rendered_commit_sha: string | null
  source_resolved: number | null
}

export default defineApiHandler({
  schema: pnpmPackageQuery,
  policy: [],
  handler: async ({ event }) => {
    const slug = pnpmPackageSlug.safeParse(getRouterParam(event, 'slug'))
    if (!slug.success)
      throw createError({ statusCode: 400, message: 'Use owner/repository/skill.' })
    return cached({
      storage: useStorage('edge-cache'),
      // Cache the registry lookup too, so repeated views do not repeat D1 reads.
      key: `skills:pnpm:v2:${slug.data}`,
      ttlSeconds: 3600,
      compute: async () => {
        const found = await findSkillWithRow<PackageSourceRow>(event, slug.data, 's.rendered_commit_sha, s.source_resolved')
        if (!found)
          throw createError({ statusCode: 404, message: 'Skill not found.' })
        const { row } = found
        if (!row.rendered_skill_path || row.source_resolved === 0)
          return { _tag: 'Absent' } as const
        const source = resolveRepoSourceIdentityFromRow({ owner: row.owner, repo: row.repo }, row)
        const result = await detectPnpmPackage({ ...source, ref: row.rendered_commit_sha ?? row.default_branch ?? 'HEAD', skillPath: row.rendered_skill_path! }, fetch)
        if (result._tag === 'Unavailable')
          throw createError({ statusCode: 503, message: 'Package details are unavailable. Try again later.' })
        return result
      },
    })
  },
  presenter: presentPnpmPackage,
})
