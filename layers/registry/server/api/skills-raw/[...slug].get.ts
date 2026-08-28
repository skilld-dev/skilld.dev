import { readCache, writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { normalizeSkillAssetFilePath } from '#shared/skill-asset-path'
import { resolveRepoSourceIdentity } from '../../utils/repo-source-identity'
import { findSkill } from '../../utils/skills-registry'
import { fetchUpstreamText } from '../../utils/upstream-text'

const RAW_CACHE_TTL = 60 * 5
const RAW_MISSING_TTL = 60
const RAW_RETRY_AFTER = 30

interface RawCache {
  status: 'ok' | 'missing'
  body: string | null
  branch: string | null
  path: string | null
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slugParam = getRouterParam(event, 'slug')
    if (!slugParam)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    // Skill names never contain a slash (they're slugified into the DB), so
    // the first three segments always identify the skill. Anything after
    // that is a relative path to a file inside the skill's folder — e.g. a
    // `references/foo.md` a SKILL.md links to. Those links resolve relative
    // to this very URL, so they must be servable here too, not just at the
    // three-segment root.
    const segments = slugParam.split('/').filter(Boolean)
    if (segments.length < 3)
      throw createError({ statusCode: 400, message: 'Expected /skills-raw/:owner/:repo/:name[/:file+]' })

    const [owner, repo, name, ...fileParts] = segments
    const skillSlug = `${owner}/${repo}/${name}`
    const filePath = fileParts.length
      ? normalizeSkillAssetFilePath({ owner: owner ?? '', repo: repo ?? '', name: name ?? '', filePath: fileParts.join('/') })
      : null
    if (filePath?.includes('..'))
      throw createError({ statusCode: 400, message: 'Invalid path' })

    const skill = await findSkill(event, skillSlug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const source = await resolveRepoSourceIdentity(platform.db, skill)
    const cacheKey = filePath
      ? `skills:raw:v2:${source.owner}/${source.repo}/${skill.name}:${filePath}`
      : `skills:raw:v2:${source.owner}/${source.repo}/${skill.name}`
    const cached = await readCache<RawCache>(useStorage('cache'), cacheKey)
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

    const treeResult = await $fetch<{ files?: { path: string }[] }>(
      `https://ungh.cc/repos/${source.owner}/${source.repo}/files/${branch}`,
    ).then(
      response => ({ _tag: 'available' as const, files: response.files ?? [] }),
      () => {
        emitOperationalEvent(createWideEvent({ operation: 'skill-raw-tree-fetch', outcome: 'failed' }))
        return { _tag: 'unavailable' as const }
      },
    )

    if (treeResult._tag === 'unavailable') {
      setHeader(event, 'retry-after', RAW_RETRY_AFTER)
      throw createError({ statusCode: 503, message: 'Skill source is unavailable upstream' })
    }

    const files = treeResult.files
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

    // A bare skill slug serves SKILL.md itself; a trailing path serves a file
    // beside it (e.g. `references/foo.md`), resolved relative to SKILL.md's
    // own directory rather than the repo root.
    const skillDir = skillPath.replace(/\/SKILL\.md$/, '')
    const targetPath = filePath ? `${skillDir}/${filePath}` : skillPath
    const notFoundMessage = filePath ? 'Referenced file not found in repository' : 'SKILL.md not found in repository'

    const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${branch}/${targetPath}`
    const raw = await fetchUpstreamText(rawUrl)

    if (raw._tag === 'missing') {
      emitOperationalEvent(createWideEvent({ 'operation': 'skill-raw-content-fetch', 'outcome': 'missing', 'upstream.status': raw.status }))
      await writeCache(useStorage('cache'), cacheKey, { status: 'missing', body: null, branch, path: targetPath } satisfies RawCache, { ttl: RAW_MISSING_TTL })
      throw createError({ statusCode: 404, message: notFoundMessage })
    }

    if (raw._tag === 'unavailable') {
      // A GitHub outage must not leave a "missing" marker behind, or the
      // document reads as deleted for the rest of the cache window.
      emitOperationalEvent(createWideEvent({ 'operation': 'skill-raw-content-fetch', 'outcome': 'failed', 'upstream.status': raw.status ?? 0, 'attempt': raw.attempts }))
      setHeader(event, 'retry-after', RAW_RETRY_AFTER)
      throw createError({ statusCode: 503, message: 'SKILL.md source is unavailable upstream' })
    }

    const body = raw.body
    await writeCache(useStorage('cache'), cacheKey, { status: 'ok', body, branch, path: targetPath } satisfies RawCache, { ttl: RAW_CACHE_TTL })

    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    setHeader(event, 'cache-control', 'public, max-age=300')
    setHeader(event, 'x-skilld-source', `${source.owner}/${source.repo}@${branch}/${targetPath}`)
    return body
  },
})
