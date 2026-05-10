import { findSkill } from '~~/layers/registry/server/utils/skills-registry'
import { defineApiHandler } from '#shared/server/handler'

const RAW_CACHE_TTL = 60 * 5
const RAW_MISSING_TTL = 60

interface RawCache {
  status: 'ok' | 'missing'
  body: string | null
  branch: string | null
  path: string | null
}

export default defineApiHandler({
  handler: async ({ event }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    const skill = await findSkill(event, slug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const cacheKey = `skills:raw:v1:${skill.owner}/${skill.repo}/${skill.name}`
    const cached = await useStorage('cache').getItem<RawCache>(cacheKey)
    if (cached?.status === 'ok' && cached.body) {
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      setHeader(event, 'cache-control', 'public, max-age=300')
      setHeader(event, 'x-skilld-source', `${skill.owner}/${skill.repo}@${cached.branch}/${cached.path}`)
      return cached.body
    }

    const repoMeta = await $fetch<{ defaultBranch?: string }>(
      `https://ungh.cc/repos/${skill.owner}/${skill.repo}`,
    ).catch(() => null)
    const branch = repoMeta?.defaultBranch || 'main'

    const treeRes = await $fetch<{ files?: { path: string }[] }>(
      `https://ungh.cc/repos/${skill.owner}/${skill.repo}/files/${branch}`,
    ).catch(() => null)

    const files = treeRes?.files ?? []
    const slugifiedName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const skillPath = files.find(f =>
      f.path.toLowerCase().endsWith(`/${slugifiedName}/skill.md`)
      || f.path.toLowerCase() === `${slugifiedName}/skill.md`
      || f.path.toLowerCase().endsWith(`/${skill.name.toLowerCase()}/skill.md`),
    )?.path

    if (!skillPath) {
      await useStorage('cache').setItem(
        cacheKey,
      { status: 'missing', body: null, branch, path: null } satisfies RawCache,
      { ttl: RAW_MISSING_TTL },
      )
      throw createError({ statusCode: 404, message: 'SKILL.md not found in repository' })
    }

    const rawUrl = `https://raw.githubusercontent.com/${skill.owner}/${skill.repo}/${branch}/${skillPath}`
    const body = await $fetch<string>(rawUrl, { responseType: 'text' }).catch(() => null)

    if (!body) {
      await useStorage('cache').setItem(
        cacheKey,
      { status: 'missing', body: null, branch, path: skillPath } satisfies RawCache,
      { ttl: RAW_MISSING_TTL },
      )
      throw createError({ statusCode: 502, message: 'Could not fetch SKILL.md' })
    }

    await useStorage('cache').setItem(
      cacheKey,
    { status: 'ok', body, branch, path: skillPath } satisfies RawCache,
    { ttl: RAW_CACHE_TTL },
    )

    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    setHeader(event, 'cache-control', 'public, max-age=300')
    setHeader(event, 'x-skilld-source', `${skill.owner}/${skill.repo}@${branch}/${skillPath}`)
    return body
  },
})
