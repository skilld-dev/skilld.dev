import { writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { findSkill } from '../../utils/skills-registry'

const FILES_CACHE_TTL = 60 * 60 * 6
const FILES_MISSING_TTL = 60 * 5

interface SkillFile {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

interface SkillFilesPayload {
  skillPath: string | null
  branch: string
  files: SkillFile[]
}

interface SkillFilesRow {
  default_branch: string | null
  rendered_skill_path: string | null
  source_owner: string | null
  source_repo: string | null
}

function classify(path: string): SkillFile['type'] {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'md' || ext === 'markdown')
    return 'markdown'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return 'image'
  if (['json', 'yaml', 'yml', 'toml', 'csv'].includes(ext))
    return 'data'
  if (ext)
    return 'code'
  return 'other'
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slugParam = getRouterParam(event, 'slug')
    if (!slugParam)
      throw createError({ statusCode: 400, message: 'Missing slug' })

    const segments = slugParam.split('/').filter(Boolean)
    if (segments.length !== 3)
      throw createError({ statusCode: 400, message: 'Expected /skill-files/:owner/:repo/:name' })

    const [owner, repo, name] = segments
    if (!owner || !repo || !name)
      throw createError({ statusCode: 400, message: 'Missing path components' })

    const skillSlug = `${owner}/${repo}/${name}`
    const skill = await findSkill(event, skillSlug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const row = await platform.db
      .prepare(`SELECT r.default_branch, r.source_owner, r.source_repo, s.rendered_skill_path
                FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
                WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
      .bind(skill.owner, skill.repo, skill.name)
      .first<SkillFilesRow>()
    if (!row)
      throw createError({ statusCode: 404, message: 'Skill metadata missing' })

    const source = resolveRepoSourceIdentityFromRow(skill, row)
    const branch = row.default_branch || 'main'
    const cacheKey = `skills:files:v2:${source.owner}/${source.repo}/${skill.name}:${branch}`
    const cached = await useStorage('cache').getItem<SkillFilesPayload>(cacheKey)
    if (cached)
      return cached

    const tree = await $fetch<{ files?: { path: string, size?: number }[] }>(
      `https://ungh.cc/repos/${source.owner}/${source.repo}/files/${branch}`,
    ).catch((error) => {
      console.warn(`[skill-files] ${error instanceof Error ? error.message : String(error)}`)
      return null
    })

    if (!tree?.files?.length) {
      const empty: SkillFilesPayload = { skillPath: row.rendered_skill_path, branch, files: [] }
      await writeCache(useStorage('cache'), cacheKey, empty, { ttl: FILES_MISSING_TTL })
      return empty
    }

    // Resolve the skill directory: prefer the rendered_skill_path stored at
    // sync time; fall back to a name-based heuristic the same way the asset
    // endpoint does.
    let skillDir = row.rendered_skill_path?.replace(/\/SKILL\.md$/, '') ?? null
    if (!skillDir) {
      const slugifiedName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const skillMd = tree.files.find(f =>
        f.path.toLowerCase().endsWith(`/${slugifiedName}/skill.md`)
        || f.path.toLowerCase() === `${slugifiedName}/skill.md`
        || f.path.toLowerCase().endsWith(`/${skill.name.toLowerCase()}/skill.md`),
      )?.path
      if (skillMd)
        skillDir = skillMd.replace(/\/SKILL\.md$/, '')
    }

    if (!skillDir) {
      const empty: SkillFilesPayload = { skillPath: row.rendered_skill_path, branch, files: [] }
      await writeCache(useStorage('cache'), cacheKey, empty, { ttl: FILES_MISSING_TTL })
      return empty
    }

    const prefix = `${skillDir}/`
    const files: SkillFile[] = tree.files
      .filter(f => f.path.startsWith(prefix) && !f.path.endsWith('/SKILL.md'))
      .map(f => ({
        path: f.path.slice(prefix.length),
        size: f.size ?? 0,
        type: classify(f.path),
      }))

    const result: SkillFilesPayload = { skillPath: row.rendered_skill_path, branch, files }
    await writeCache(useStorage('cache'), cacheKey, result, { ttl: FILES_CACHE_TTL })
    return result
  },
})
