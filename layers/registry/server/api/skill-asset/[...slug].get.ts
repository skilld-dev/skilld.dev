import { defineApiHandler } from '#shared/server/handler'
import { parseSkillMd } from '../../utils/skill-md-render'
import { findSkill } from '../../utils/skills-registry'

const ASSET_CACHE_TTL = 60 * 60 * 24 * 7
const ASSET_MISSING_TTL = 60 * 60

interface AssetCache {
  status: 'ok' | 'missing'
  raw: string | null
  html: string | null
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
  branch: string
  skillPath: string | null
}

interface SkillAssetRow {
  default_branch: string | null
  assets: string | null
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
    const filePath = fileParts.join('/')
    if (!owner || !repo || !name || !filePath)
      throw createError({ statusCode: 400, message: 'Missing path components' })
    if (filePath.includes('..'))
      throw createError({ statusCode: 400, message: 'Invalid path' })

    const skillSlug = `${owner}/${repo}/${name}`
    const skill = await findSkill(event, skillSlug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const row = await platform.db
      .prepare(`SELECT r.default_branch, s.assets
                FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
                WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
      .bind(skill.owner, skill.repo, skill.name)
      .first<SkillAssetRow>()

    if (!row)
      throw createError({ statusCode: 404, message: 'Skill metadata missing' })

    let registered: RegisteredAsset[] = []
    if (row.assets) {
      try {
        const parsed = JSON.parse(row.assets) as unknown
        if (Array.isArray(parsed)) {
          registered = parsed.filter((a): a is RegisteredAsset =>
            Boolean(a) && typeof a === 'object' && typeof (a as { path: unknown }).path === 'string',
          )
        }
      }
      catch {
      // Treat as empty list.
      }
    }

    // Any file inside the resolved skillDir is fair game — the path is
    // already constrained below so this stays scoped to the skill folder.
    // Registration is used only to pick up the recorded size/type when
    // available; otherwise we classify from the extension.
    const registeredAsset = registered.find(a => a.path === filePath)
    const asset: RegisteredAsset = registeredAsset
      ?? { path: filePath, size: 0, type: classifyAsset(filePath) }

    const branch = row.default_branch || 'main'
    const cacheKey = `skills:asset:v1:${skill.owner}/${skill.repo}/${skill.name}:${filePath}:${branch}`
    const cached = await useStorage('cache').getItem<AssetCache>(cacheKey)
    if (cached) {
      if (cached.status === 'missing')
        throw createError({ statusCode: 404, message: 'Asset content unavailable' })
      return cached
    }

    // Resolve the skill directory by re-finding the SKILL.md path.
    const treeRes = await $fetch<{ files?: { path: string }[] }>(
      `https://ungh.cc/repos/${skill.owner}/${skill.repo}/files/${branch}`,
    ).catch(() => null)
    const slugifiedName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const skillMdPath = (treeRes?.files ?? []).find(f =>
      f.path.toLowerCase().endsWith(`/${slugifiedName}/skill.md`)
      || f.path.toLowerCase() === `${slugifiedName}/skill.md`
      || f.path.toLowerCase().endsWith(`/${skill.name.toLowerCase()}/skill.md`),
    )?.path

    if (!skillMdPath) {
      await useStorage('cache').setItem(cacheKey, {
        status: 'missing',
        raw: null,
        html: null,
        size: asset.size,
        type: asset.type,
        branch,
        skillPath: null,
      } satisfies AssetCache, { ttl: ASSET_MISSING_TTL })
      throw createError({ statusCode: 404, message: 'Skill source not found' })
    }

    const skillDir = skillMdPath.replace(/\/SKILL\.md$/, '')
    const fullPath = `${skillDir}/${filePath}`
    const rawUrl = `https://raw.githubusercontent.com/${skill.owner}/${skill.repo}/${branch}/${fullPath}`
    const raw = await $fetch<string>(rawUrl, { responseType: 'text' }).catch(() => null)

    if (raw === null) {
      await useStorage('cache').setItem(cacheKey, {
        status: 'missing',
        raw: null,
        html: null,
        size: asset.size,
        type: asset.type,
        branch,
        skillPath: skillMdPath,
      } satisfies AssetCache, { ttl: ASSET_MISSING_TTL })
      throw createError({ statusCode: 502, message: 'Could not fetch asset' })
    }

    const type = asset.type ?? classifyAsset(filePath)
    let html: string | null = null
    if (type === 'markdown') {
      const parsed = await parseSkillMd(raw, {
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        branch,
        skillDir,
        filePath,
      })
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
    await useStorage('cache').setItem(cacheKey, result, { ttl: ASSET_CACHE_TTL })
    return result
  },
})
