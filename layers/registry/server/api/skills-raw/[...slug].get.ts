import { readCache, writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { normalizeSkillAssetFilePath } from '#shared/skill-asset-path'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { findSkill } from '../../utils/skills-registry'
import { fetchUpstreamText } from '../../utils/upstream-text'
import { fetchUpstreamTree } from '../../utils/upstream-tree'

const RAW_CACHE_TTL = 60 * 5
// The KV entry outlives the fresh window by this much, so a blip after
// expiry still has a last-good body to fall back to instead of a 503.
const RAW_STALE_TTL = 60 * 60
const RAW_MISSING_TTL = 60
const RAW_RETRY_AFTER = 30

interface RawCache {
  status: 'ok' | 'missing'
  body: string | null
  branch: string | null
  path: string | null
}

/**
 * The freshness envelope `readThroughCache` stores, read here by hand rather
 * than through the helper: 404 and 410 must propagate even in the stale
 * window, so only an upstream outage may fall back to the stale value.
 */
interface RawCacheEnvelope {
  storedAt: number
  value: RawCache
}

function parseLastGood(raw: unknown): { value: RawCache, ageSeconds: number } | null {
  if (typeof raw !== 'object' || raw === null || !('storedAt' in raw) || !('value' in raw))
    return null
  const { storedAt, value } = raw as Record<string, unknown>
  if (typeof storedAt !== 'number' || !Number.isFinite(storedAt))
    return null
  if (typeof value !== 'object' || value === null)
    return null
  const entry = value as RawCache
  if (entry.status !== 'ok' || typeof entry.body !== 'string')
    return null
  return { value: entry, ageSeconds: (Date.now() - storedAt) / 1000 }
}

interface SkillSourceRow {
  default_branch: string | null
  source_owner: string | null
  source_repo: string | null
  source_resolved: number | null
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

    const sourceRow = await platform.db
      .prepare(`
        SELECT r.default_branch, r.source_owner, r.source_repo, s.source_resolved
        FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
        WHERE s.owner = ? AND s.repo = ? AND s.name = ?
      `)
      .bind(skill.owner, skill.repo, skill.name)
      .first<SkillSourceRow>()

    // The sync's verdict that this SKILL.md is gone upstream. The page serves
    // a 410 tombstone on the same verdict, and this endpoint must agree. A
    // gone source is permanent, so it must not read as an outage. Answer
    // before any upstream call: the registry already knows (SKILLD-11).
    if (sourceRow?.source_resolved === 0)
      throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })

    const source = resolveRepoSourceIdentityFromRow(skill, sourceRow ?? undefined)
    const branch = sourceRow?.default_branch || 'main'
    const cacheKey = filePath
      ? `skills:raw:v3:${source.owner}/${source.repo}/${skill.name}:${filePath}`
      : `skills:raw:v3:${source.owner}/${source.repo}/${skill.name}`
    const lastGood = parseLastGood(await readCache<unknown>(useStorage('cache'), cacheKey))
    if (lastGood && lastGood.ageSeconds < RAW_CACHE_TTL) {
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      setHeader(event, 'cache-control', 'public, max-age=300')
      setHeader(event, 'x-skilld-source', `${source.owner}/${source.repo}@${lastGood.value.branch}/${lastGood.value.path}`)
      return lastGood.value.body
    }

    // An upstream outage must not reach the run surface while a last-good
    // copy is still readable. A gone or missing verdict still propagates:
    // those are facts about the source, not about its availability.
    const serveStale = (stage: string) => {
      if (!lastGood || lastGood.ageSeconds >= RAW_CACHE_TTL + RAW_STALE_TTL)
        return null
      emitOperationalEvent(createWideEvent({
        'operation': 'skill-raw-stale-fallback',
        'outcome': 'degraded',
        'cache.servedStale': true,
        'cache.ageSeconds': Math.round(lastGood.ageSeconds),
        'reason': stage,
      }))
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      setHeader(event, 'cache-control', 'public, max-age=30')
      setHeader(event, 'x-skilld-source', `${source.owner}/${source.repo}@${lastGood.value.branch}/${lastGood.value.path}`)
      return lastGood.value.body
    }

    const treeResult = await fetchUpstreamTree(source, branch, { operation: 'skill-raw-tree-fetch' })

    if (treeResult._tag === 'gone') {
      // The registry has not recorded this deletion yet. The next sync flips
      // `source_resolved` and short-circuits earlier. Until then, the missing
      // marker keeps repeat callers off the upstream 404.
      await writeCache(useStorage('cache'), cacheKey, { status: 'missing', body: null, branch, path: null } satisfies RawCache, { ttl: RAW_MISSING_TTL })
      throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })
    }

    if (treeResult._tag === 'unavailable') {
      const staleBody = serveStale('tree')
      if (staleBody !== null)
        return staleBody
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
      const staleBody = serveStale('content')
      if (staleBody !== null)
        return staleBody
      setHeader(event, 'retry-after', RAW_RETRY_AFTER)
      throw createError({ statusCode: 503, message: 'SKILL.md source is unavailable upstream' })
    }

    const body = raw.body
    await writeCache(
      useStorage('cache'),
      cacheKey,
      { storedAt: Date.now(), value: { status: 'ok', body, branch, path: targetPath } } satisfies RawCacheEnvelope,
      { ttl: RAW_CACHE_TTL + RAW_STALE_TTL },
    )

    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    setHeader(event, 'cache-control', 'public, max-age=300')
    setHeader(event, 'x-skilld-source', `${source.owner}/${source.repo}@${branch}/${targetPath}`)
    return body
  },
})
