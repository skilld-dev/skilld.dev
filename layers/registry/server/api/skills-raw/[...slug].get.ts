import { writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { resolveRepoSourceIdentity } from '../../utils/repo-source-identity'
import { findSkill } from '../../utils/skills-registry'

const RAW_CACHE_TTL = 60 * 5
const RAW_MISSING_TTL = 60

interface RawCache {
  status: 'ok' | 'missing'
  body: string | null
  branch: string | null
  path: string | null
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    const skill = await findSkill(event, slug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const source = await resolveRepoSourceIdentity(platform.db, skill)
    const cacheKey = `skills:raw:v2:${source.owner}/${source.repo}/${skill.name}`
    const cached = await useStorage('cache').getItem<RawCache>(cacheKey)
    if (cached?.status === 'ok' && cached.body !== null) {
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      setHeader(event, 'cache-control', 'public, max-age=300')
      setHeader(event, 'x-skilld-source', `${source.owner}/${source.repo}@${cached.branch}/${cached.path}`)
      return cached.body
    }

    const repoMeta = await $fetch<{ defaultBranch?: string }>(
      `https://ungh.cc/repos/${source.owner}/${source.repo}`,
    ).catch(() => {
      emitOperationalEvent(createWideEvent({ operation: 'skill-raw-repo-fetch', outcome: 'failed' }))
      return null
    })
    const branch = repoMeta?.defaultBranch || 'main'

    const treeRes = await $fetch<{ files?: { path: string }[] }>(
      `https://ungh.cc/repos/${source.owner}/${source.repo}/files/${branch}`,
    ).catch(() => {
      emitOperationalEvent(createWideEvent({ operation: 'skill-raw-tree-fetch', outcome: 'failed' }))
      return null
    })

    const files = treeRes?.files ?? []
    const slugifiedName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const skillPath = files.find(f =>
      f.path.toLowerCase().endsWith(`/${slugifiedName}/skill.md`)
      || f.path.toLowerCase() === `${slugifiedName}/skill.md`
      || f.path.toLowerCase().endsWith(`/${skill.name.toLowerCase()}/skill.md`),
    )?.path

    if (!skillPath) {
      await writeCache(useStorage('cache'), cacheKey, { status: 'missing', body: null, branch, path: null } satisfies RawCache, { ttl: RAW_MISSING_TTL })
      throw createError({ statusCode: 404, message: 'SKILL.md not found in repository' })
    }

    const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${skillPath}`
    const body = await $fetch<string>(rawUrl, { responseType: 'text' }).catch(() => {
      emitOperationalEvent(createWideEvent({ operation: 'skill-raw-content-fetch', outcome: 'failed' }))
      return null
    })

    if (body === null) {
      await writeCache(useStorage('cache'), cacheKey, { status: 'missing', body: null, branch, path: skillPath } satisfies RawCache, { ttl: RAW_MISSING_TTL })
      throw createError({ statusCode: 502, message: 'Could not fetch SKILL.md' })
    }

    await writeCache(useStorage('cache'), cacheKey, { status: 'ok', body, branch, path: skillPath } satisfies RawCache, { ttl: RAW_CACHE_TTL })

    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    setHeader(event, 'cache-control', 'public, max-age=300')
    setHeader(event, 'x-skilld-source', `${source.owner}/${source.repo}@${branch}/${skillPath}`)
    return body
  },
})
