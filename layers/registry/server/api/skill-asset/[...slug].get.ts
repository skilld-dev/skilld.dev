import { readCache, writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { normalizeSkillAssetFilePath } from '#shared/skill-asset-path'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { skillImagePolicyForEvent } from '../../utils/skill-image-policy'
import { parseSkillMd } from '../../utils/skill-md-render'
import { loadStoredSkillRow, parseStoredAssets, resolveReferencedFileTarget } from '../../utils/skill-stored-source'
import { findSkill } from '../../utils/skills-registry'
import { fetchUpstreamText } from '../../utils/upstream-text'

const ASSET_CACHE_TTL = 60 * 60 * 24 * 7
const ASSET_MISSING_TTL = 60 * 60
const ASSET_RETRY_AFTER = 30

interface AssetCache {
  status: 'ok' | 'missing'
  raw: string | null
  html: string | null
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
  branch: string
  skillPath: string | null
}

interface RepoSkillNameRow {
  name: string
}

interface RegisteredAsset {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

function classifyAsset(path: string): RegisteredAsset['type'] {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'md' || ext === 'markdown')
    return 'markdown'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return 'image'
  if (['json', 'yaml', 'yml', 'toml', 'csv'].includes(ext))
    return 'data'
  return 'code'
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slugParam = getRouterParam(event, 'slug')
    if (!slugParam)
      throw createError({ statusCode: 400, message: 'Missing slug' })

    const segments = slugParam.split('/').filter(Boolean)
    if (segments.length < 4)
      throw createError({ statusCode: 400, message: 'Expected /skill-asset/:owner/:repo/:name/:file+' })

    const [owner, repo, name, ...fileParts] = segments
    const filePath = normalizeSkillAssetFilePath({
      owner: owner ?? '',
      repo: repo ?? '',
      name: name ?? '',
      filePath: fileParts.join('/'),
    })
    if (!owner || !repo || !name || !filePath)
      throw createError({ statusCode: 400, message: 'Missing path components' })
    if (filePath.includes('..'))
      throw createError({ statusCode: 400, message: 'Invalid path' })

    const skillSlug = `${owner}/${repo}/${name}`
    const skill = await findSkill(event, skillSlug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const [row, repoSkillRows] = await Promise.all([
      loadStoredSkillRow(platform.db, skill),
      platform.db
        .prepare(`SELECT name FROM skills WHERE owner = ? AND repo = ? ORDER BY name`)
        .bind(skill.owner, skill.repo)
        .all<RepoSkillNameRow>(),
    ])

    if (!row)
      throw createError({ statusCode: 404, message: 'Skill metadata missing' })

    // The sync's verdict that this SKILL.md is gone upstream. The page serves
    // a 410 tombstone on the same verdict, and this endpoint must agree.
    // Answer before any upstream call: the registry already knows (SKILLD-11).
    if (row.source_resolved === 0)
      throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })

    const source = resolveRepoSourceIdentityFromRow(skill, row)
    const registered = parseStoredAssets(row.assets)
    // Any file inside the resolved skillDir is fair game — the path is
    // already constrained below so this stays scoped to the skill folder.
    // Registration is used only to pick up the recorded size/type when
    // available; otherwise we classify from the extension.
    const registeredAsset = registered.find(a => a.path === filePath)
    const asset: RegisteredAsset = registeredAsset
      ?? { path: filePath, size: 0, type: classifyAsset(filePath) }

    const target = resolveReferencedFileTarget(skill, row, filePath)
    if (target._tag === 'missing')
      throw createError({ statusCode: 404, message: 'Skill source not found' })
    if (target._tag === 'unavailable') {
      setHeader(event, 'retry-after', ASSET_RETRY_AFTER)
      throw createError({ statusCode: 503, message: 'Skill source commit is unavailable. Try again after the next sync.' })
    }
    const branch = row.rendered_commit_sha!
    const skillMdPath = row.rendered_skill_path!
    const skillDir = skillMdPath.replace(/(?:^|\/)SKILL\.md$/i, '')
    const cacheKey = `skills:asset:v5:${source.owner}/${source.repo}/${skill.name}:${filePath}:${branch}`
    const cached = await readCache<AssetCache>(useStorage('edge-cache'), cacheKey)
    if (cached) {
      if (cached.status === 'missing')
        throw createError({ statusCode: 404, message: 'Asset content unavailable' })
      return cached
    }

    const upstream = await fetchUpstreamText(target.url)

    if (upstream._tag === 'missing') {
      emitOperationalEvent(createWideEvent({ 'operation': 'skill-asset-fetch', 'outcome': 'missing', 'upstream.status': upstream.status }))
      await writeCache(useStorage('edge-cache'), cacheKey, {
        status: 'missing',
        raw: null,
        html: null,
        size: asset.size,
        type: asset.type,
        branch,
        skillPath: skillMdPath,
      } satisfies AssetCache, { ttl: ASSET_MISSING_TTL })
      throw createError({ statusCode: 404, message: 'Asset not found in repository' })
    }

    if (upstream._tag === 'unavailable') {
      // A GitHub outage must not leave a "missing" marker behind, or the asset
      // reads as deleted for the rest of the cache window.
      emitOperationalEvent(createWideEvent({ 'operation': 'skill-asset-fetch', 'outcome': 'failed', 'upstream.status': upstream.status ?? 0, 'attempt': upstream.attempts }))
      setHeader(event, 'retry-after', ASSET_RETRY_AFTER)
      throw createError({ statusCode: 503, message: 'Asset source is unavailable upstream' })
    }

    const raw = upstream.body

    const type = asset.type ?? classifyAsset(filePath)
    let html: string | null = null
    if (type === 'markdown') {
      const parsed = await parseSkillMd(raw, {
        owner: source.owner,
        repo: source.repo,
        name: skill.name,
        branch,
        skillDir,
        filePath,
        skillNames: (repoSkillRows.results ?? []).map(candidate => candidate.name),
        registryOwner: skill.owner,
        registryRepo: skill.repo,
      }, await skillImagePolicyForEvent(event))
      html = parsed.html
    }

    const result: AssetCache = {
      status: 'ok',
      raw,
      html,
      size: raw.length,
      type,
      branch,
      skillPath: skillMdPath,
    }
    await writeCache(useStorage('edge-cache'), cacheKey, result, { ttl: ASSET_CACHE_TTL })
    return result
  },
})
