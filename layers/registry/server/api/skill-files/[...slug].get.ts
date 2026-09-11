import type { ReadThroughWindows } from '#shared/server/cache'
import { readThroughCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { selectSkillFiles } from '#shared/skill-files'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { findSkill } from '../../utils/skills-registry'
import { fetchUpstreamTree } from '../../utils/upstream-tree'

const FILES_CACHE_TTL = 60 * 60 * 6
// How long past its fresh window a files payload stays servable when its live
// recompute fails. The file list only changes when the repo does, so during a
// cold-key crawler sweep (SKILLD-1F) serving a day-old list beats another
// upstream tree fetch per request.
const FILES_CACHE_STALE_TTL = 60 * 60 * 24
// An empty file list is only transient when the skill directory was never
// resolved: both fallbacks return `row.rendered_skill_path` as `skillPath`,
// which is null exactly when the no-skillDir fallback fires. A resolved skill
// holding only SKILL.md also produces files: [] (the filter excludes
// SKILL.md itself), so bare emptiness would drop that permanent payload onto
// the short missing window and strip its stale protection. Keep the base
// code's short missing window for the unresolved cases, which
// reconcile-rendered re-renders, and let resolved payloads ride the 6-hour
// fresh window with the day-long stale serve.
const FILES_MISSING_TTL = 60 * 5
// v4: entries carry a freshness envelope for readThroughCache, so v3 values
// (raw payloads) must never be read as envelopes.
const FILES_CACHE_VERSION = 'v4'
const FILES_RETRY_AFTER = 30

interface SkillFile {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

interface SkillFilesPayload {
  skillPath: string | null
  branch: string
  files: SkillFile[]
  total: number
}

interface SkillFilesRow {
  default_branch: string | null
  rendered_skill_path: string | null
  source_owner: string | null
  source_repo: string | null
  source_resolved: number | null
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

function emptyFilesWindows(payload: SkillFilesPayload): ReadThroughWindows | undefined {
  return payload.files.length === 0 && payload.skillPath === null
    ? { ttl: FILES_MISSING_TTL, staleTtl: 0 }
    : undefined
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
      .prepare(`SELECT r.default_branch, r.source_owner, r.source_repo, s.rendered_skill_path, s.source_resolved
                FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
                WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
      .bind(skill.owner, skill.repo, skill.name)
      .first<SkillFilesRow>()
    if (!row)
      throw createError({ statusCode: 404, message: 'Skill metadata missing' })

    // The sync's verdict that this SKILL.md is gone upstream. The page serves
    // a 410 tombstone on the same verdict, and this endpoint must agree.
    // Answer before any upstream call: the registry already knows (SKILLD-11).
    if (row.source_resolved === 0)
      throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })

    const source = resolveRepoSourceIdentityFromRow(skill, row)
    const branch = row.default_branch || 'main'
    const cacheKey = `skills:files:${FILES_CACHE_VERSION}:${source.owner}/${source.repo}/${skill.name}:${branch}`

    return readThroughCache<SkillFilesPayload>(
      useStorage('cache'),
      cacheKey,
      async () => {
        const treeResult = await fetchUpstreamTree(source, branch, { operation: 'skill-files-tree-fetch' })

        if (treeResult._tag === 'gone') {
          // The registry has not recorded this deletion yet. The next sync flips
          // `source_resolved` and short-circuits earlier.
          throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })
        }

        if (treeResult._tag === 'unavailable') {
          setHeader(event, 'retry-after', FILES_RETRY_AFTER)
          throw createError({ statusCode: 503, message: 'Skill source is unavailable upstream' })
        }

        const tree = treeResult.files

        if (!tree.length) {
          return { skillPath: row.rendered_skill_path, branch, files: [], total: 0 } satisfies SkillFilesPayload
        }

        // Resolve the skill directory: prefer the rendered_skill_path stored at
        // sync time; fall back to a name-based heuristic the same way the asset
        // endpoint does.
        let skillDir = row.rendered_skill_path?.replace(/\/SKILL\.md$/, '') ?? null
        if (!skillDir) {
          const slugifiedName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          const skillMd = tree.find(f =>
            f.path.toLowerCase().endsWith(`/${slugifiedName}/skill.md`)
            || f.path.toLowerCase() === `${slugifiedName}/skill.md`
            || f.path.toLowerCase().endsWith(`/${skill.name.toLowerCase()}/skill.md`),
          )?.path
          if (skillMd)
            skillDir = skillMd.replace(/\/SKILL\.md$/, '')
        }

        if (!skillDir) {
          return { skillPath: row.rendered_skill_path, branch, files: [], total: 0 } satisfies SkillFilesPayload
        }

        const prefix = `${skillDir}/`
        const files: SkillFile[] = tree
          .filter(f => f.path.startsWith(prefix) && !f.path.endsWith('/SKILL.md'))
          .map(f => ({
            path: f.path.slice(prefix.length),
            size: f.size ?? 0,
            type: classify(f.path),
          }))

        const selected = selectSkillFiles(files)
        return {
          skillPath: row.rendered_skill_path,
          branch,
          files: selected.files,
          total: selected.total,
        } satisfies SkillFilesPayload
      },
      { ttl: FILES_CACHE_TTL, staleTtl: FILES_CACHE_STALE_TTL, windowsFor: emptyFilesWindows },
    )
  },
})
