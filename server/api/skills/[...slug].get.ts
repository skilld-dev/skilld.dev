import { Marked } from 'marked'
import { listCollectionRecords } from '../../utils/atproto/collections'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { findSkill } from '../../utils/skills-registry'

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const HTML_ESCAPE_RE = /[&<>"']/g
function escapeHtml(s: string): string {
  return s.replace(HTML_ESCAPE_RE, c => HTML_ESCAPE[c]!)
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(?:javascript|vbscript|data|file):/i.test(trimmed)) {
    // Allow safe inline image data URLs only
    if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);/i.test(trimmed))
      return trimmed
    return '#'
  }
  return trimmed
}

// Escape raw HTML so SKILL.md content can't inject script/iframe/event handlers
const skillMd = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html({ text }: { text: string }) { return escapeHtml(text) },
    link({ href, title, tokens }: { href: string, title?: string | null, tokens: unknown[] }) {
      const safe = sanitizeUrl(href)
      const text = (this as { parser: { parseInline: (t: unknown[]) => string } }).parser.parseInline(tokens)
      const t = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(safe)}"${t}>${text}</a>`
    },
    image({ href, title, text }: { href: string, title?: string | null, text: string }) {
      const safe = sanitizeUrl(href)
      const t = title ? ` title="${escapeHtml(title)}"` : ''
      return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${t}>`
    },
  },
})

interface CuratorEndorsement {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  collectionName: string
  collectionSlug: string
  reason?: string
}

interface UnghRepo {
  id: number
  name: string
  repo: string
  description: string | null
  createdAt: string
  updatedAt: string
  pushedAt: string
  stars: number
  watchers: number
  forks: number
  defaultBranch: string
}

const ENDORSEMENTS_CACHE_KEY = 'skills:endorsement-map'
const ENDORSEMENTS_CACHE_TTL = 60 * 5 // 5 minutes
const REPO_META_CACHE_TTL = 60 * 15 // 15 minutes
const REPO_MISSING_CACHE_TTL = 60 * 60 * 24 // 24 hours — deleted repos
const REPO_TREE_CACHE_TTL = 60 * 60 * 6 // 6 hours

interface UnghTreeFile {
  path: string
  mode: string
  sha: string
  size: number
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, message: 'Missing skill slug' })

  const skill = await findSkill(event, slug)

  if (!skill)
    throw createError({ statusCode: 404, message: 'Skill not found' })

  const githubUrl = `https://github.com/${skill.owner}/${skill.repo}`

  // Fetch curator endorsements and repo metadata in parallel (need defaultBranch before SKILL.md)
  const [curators, repoMeta] = await Promise.all([
    getEndorsementsForSkill(getDB(event), skill.name),
    getRepoMeta(skill.owner, skill.repo),
  ])

  if (repoMeta === 'not-found')
    throw createError({ statusCode: 404, message: 'Skill source repository no longer exists' })

  const branch = repoMeta?.defaultBranch || 'main'
  const skillPath = await resolveSkillMdPath(skill.owner, skill.repo, skill.name, branch)
  const rawUrl = skillPath
    ? `https://raw.githubusercontent.com/${skill.owner}/${skill.repo}/${branch}/${skillPath}`
    : null

  const raw = rawUrl
    ? await $fetch<string>(rawUrl, { responseType: 'text' }).catch((err) => {
        console.warn(`[skills] Failed to fetch SKILL.md from ${rawUrl}:`, err)
        return null
      })
    : null

  const parsed = raw ? parseSkillMd(raw) : null

  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    displayName: skill.displayName,
    installs: skill.installs,
    githubUrl,
    url: `https://skills.sh/${skill.slug}`,
    skillPath,
    branch,
    content: parsed?.body ?? null,
    contentHtml: parsed?.html ?? null,
    frontmatter: parsed?.frontmatter ?? null,
    curators,
    description: repoMeta?.description ?? parsed?.frontmatter.description ?? null,
    stars: repoMeta?.stars ?? 0,
    forks: repoMeta?.forks ?? 0,
    pushedAt: repoMeta?.pushedAt ?? null,
  }
})

async function resolveSkillMdPath(owner: string, repo: string, name: string, branch: string): Promise<string | null> {
  const cacheKey = `skills:skill-path:v2:${owner}/${repo}/${name}`
  const cached = await useStorage('cache').getItem<string | null>(cacheKey)
  if (cached !== null && cached !== undefined)
    return cached || null

  const files = await getRepoTree(owner, repo, branch)
  if (!files)
    return null

  const skillMds = files.filter(f => f.path.endsWith('SKILL.md'))
  if (!skillMds.length)
    return null

  // Exact directory match: path ends with `/<name>/SKILL.md`
  const exact = skillMds.find(f => f.path.endsWith(`/${name}/SKILL.md`) || f.path === `${name}/SKILL.md`)
  if (exact) {
    await useStorage('cache').setItem(cacheKey, exact.path, { ttl: REPO_TREE_CACHE_TTL })
    return exact.path
  }

  // Single-skill repo: only one SKILL.md anywhere (npm package name may differ from dir name)
  if (skillMds.length === 1) {
    const path = skillMds[0]!.path
    await useStorage('cache').setItem(cacheKey, path, { ttl: REPO_TREE_CACHE_TTL })
    return path
  }

  // Fuzzy: path segment matches (handles slugified display names, etc.)
  const fuzzy = skillMds.find(f => f.path.split('/').includes(name))
  if (fuzzy) {
    await useStorage('cache').setItem(cacheKey, fuzzy.path, { ttl: REPO_TREE_CACHE_TTL })
    return fuzzy.path
  }

  await useStorage('cache').setItem(cacheKey, '', { ttl: REPO_TREE_CACHE_TTL })
  return null
}

async function getRepoTree(owner: string, repo: string, branch: string): Promise<UnghTreeFile[] | null> {
  const cacheKey = `skills:repo-tree:${owner}/${repo}/${branch}`
  const cached = await useStorage('cache').getItem<UnghTreeFile[]>(cacheKey)
  if (cached)
    return cached

  const data = await $fetch<{ files: UnghTreeFile[] }>(`https://ungh.cc/repos/${owner}/${repo}/files/${branch}`).catch((err) => {
    console.warn(`[skills] Failed to fetch repo tree from ungh.cc for ${owner}/${repo}@${branch}:`, err)
    return null
  })

  if (!data?.files)
    return null

  // Only cache SKILL.md paths to keep cache entries small
  const skillFiles = data.files.filter(f => f.path.endsWith('SKILL.md'))
  await useStorage('cache').setItem(cacheKey, skillFiles, { ttl: REPO_TREE_CACHE_TTL })
  return skillFiles
}

function parseSkillMd(raw: string): { frontmatter: Record<string, string>, body: string, html: string } {
  const frontmatter: Record<string, string> = {}
  let body = raw

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (fmMatch) {
    for (const line of fmMatch[1]!.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':')
      if (colonIdx <= 0)
        continue
      const key = line.slice(0, colonIdx)
      if (!/^[A-Z_][\w-]*$/i.test(key))
        continue
      frontmatter[key] = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
    }
    body = fmMatch[2]!
  }

  const html = skillMd.parse(body) as string
  return { frontmatter, body, html }
}

type RepoMetaResult = UnghRepo | 'not-found' | null

async function getRepoMeta(owner: string, repo: string): Promise<RepoMetaResult> {
  const cacheKey = `skills:repo-meta:${owner}/${repo}`
  const cached = await useStorage('cache').getItem<UnghRepo | { notFound: true }>(cacheKey)
  if (cached) {
    if ('notFound' in cached)
      return 'not-found'
    return cached
  }

  const data = await $fetch<{ repo?: UnghRepo, error?: boolean, status?: number }>(`https://ungh.cc/repos/${owner}/${repo}`).catch((err) => {
    console.warn(`[skills] Failed to fetch repo meta from ungh.cc:`, err)
    return null
  })

  if (data?.repo) {
    await useStorage('cache').setItem(cacheKey, data.repo, { ttl: REPO_META_CACHE_TTL })
    return data.repo
  }

  if (data?.error && data.status === 404) {
    await useStorage('cache').setItem(cacheKey, { notFound: true }, { ttl: REPO_MISSING_CACHE_TTL })
    return 'not-found'
  }

  return null
}

async function getEndorsementsForSkill(db: D1Database, skillName: string): Promise<CuratorEndorsement[]> {
  // Check for cached endorsement map
  let endorsementMap = await useStorage('cache').getItem<Record<string, CuratorEndorsement[]>>(ENDORSEMENTS_CACHE_KEY)

  if (!endorsementMap) {
    endorsementMap = await buildEndorsementMap(db)
    await useStorage('cache').setItem(ENDORSEMENTS_CACHE_KEY, endorsementMap, { ttl: ENDORSEMENTS_CACHE_TTL })
  }

  return endorsementMap[skillName] ?? []
}

async function buildEndorsementMap(db: D1Database): Promise<Record<string, CuratorEndorsement[]>> {
  const curators = await getAllCurators(db)
  const map: Record<string, CuratorEndorsement[]> = {}

  const results = await Promise.allSettled(curators.map(async (curator) => {
    const records = await listCollectionRecords(curator.did)

    for (const { record } of records) {
      for (const skill of record.skills) {
        const endorsement: CuratorEndorsement = {
          did: curator.did,
          handle: curator.handle,
          displayName: curator.displayName,
          avatar: curator.avatar,
          collectionName: record.name,
          collectionSlug: record.slug,
          reason: skill.reason,
        }
        if (!map[skill.packageName])
          map[skill.packageName] = []
        map[skill.packageName]!.push(endorsement)
      }
    }
  }))

  for (const result of results) {
    if (result.status === 'rejected')
      console.warn('[endorsement-map] Failed to fetch curator collections:', result.reason)
  }

  return map
}
