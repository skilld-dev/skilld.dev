import type { ReadThroughCache } from '#shared/server/cache'
import { readThroughCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { normalizeSkillAssetFilePath } from '#shared/skill-asset-path'
import { loadStoredSkillRow, readReferencedFile, readStoredSkillMd, resolveReferencedFileTarget } from '../../utils/skill-stored-source'
import { findSkill } from '../../utils/skills-registry'
import { fetchUpstreamText } from '../../utils/upstream-text'

// SKILL.md comes from D1, so this only bounds browser and edge copies. The
// referenced-file path reads GitHub once per cache miss and keeps a last good
// body for an hour, so a blip after expiry does not surface as a 503.
const REFERENCED_FILE_TTL = 60 * 5
const REFERENCED_FILE_STALE_TTL = 60 * 60
const RAW_RETRY_AFTER = 30

interface ReferencedFile {
  body: string
  source: string
}

function isReferencedFile(value: unknown): value is ReferencedFile {
  return typeof value === 'object' && value !== null
    && typeof (value as ReferencedFile).body === 'string'
    && typeof (value as ReferencedFile).source === 'string'
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

    const row = await loadStoredSkillRow(platform.db, skill)
    if (!row)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    // The sync's verdict that this SKILL.md is gone upstream. The page serves
    // a 410 tombstone on the same verdict, and this endpoint must agree.
    if (row.source_resolved === 0)
      throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })

    if (!filePath) {
      const stored = readStoredSkillMd(skill, row)
      if (stored._tag === 'gone')
        throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })
      if (stored._tag === 'missing')
        throw createError({ statusCode: 404, message: 'SKILL.md not found in repository' })
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      setHeader(event, 'cache-control', 'public, max-age=300')
      setHeader(event, 'x-skilld-source', stored.source)
      return stored.body
    }

    // A file beside SKILL.md (e.g. `references/foo.md`) is not stored, so it
    // is the one read that still reaches GitHub. Its directory comes from D1.
    const target = resolveReferencedFileTarget(skill, row, filePath)
    if (target._tag === 'missing')
      throw createError({ statusCode: 404, message: 'Referenced file not found in repository' })

    const cacheKey = `skills:raw:v4:${target.url}`
    try {
      const file = await readThroughCache<ReferencedFile>(
        useStorage('edge-cache') as ReadThroughCache,
        cacheKey,
        async () => {
          const raw = await readReferencedFile(target, fetchUpstreamText)
          if (raw._tag === 'missing')
            throw createError({ statusCode: 404, message: 'Referenced file not found in repository' })
          if (raw._tag === 'unavailable') {
            emitOperationalEvent(createWideEvent({ 'operation': 'skill-raw-content-fetch', 'outcome': 'failed', 'upstream.status': raw.status ?? 0, 'attempt': raw.attempts }))
            throw createError({ statusCode: 503, message: 'Referenced file source is unavailable upstream' })
          }
          return { body: raw.body, source: target.source } satisfies ReferencedFile
        },
        { ttl: REFERENCED_FILE_TTL, staleTtl: REFERENCED_FILE_STALE_TTL, validate: isReferencedFile },
      )
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      setHeader(event, 'cache-control', 'public, max-age=300')
      setHeader(event, 'x-skilld-source', file.source)
      return file.body
    }
    catch (error) {
      if ((error as { statusCode?: number } | null)?.statusCode === 503)
        setHeader(event, 'retry-after', RAW_RETRY_AFTER)
      throw error
    }
  },
})
