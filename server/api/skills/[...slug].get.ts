import type { H3Event } from 'h3'
import type { EmbeddingNeighbor } from '../../jobs/generate-embeddings'
import type { FaqPayload } from '../../jobs/generate-faqs'
import type { TagPayload } from '../../jobs/generate-tags'
import type { CoOccurrenceNeighbor } from '../../utils/skill-co-occurrence'
import { Marked } from 'marked'
import { getEmbeddingNeighbors } from '../../jobs/generate-embeddings'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { listCollectionRecords } from '../../utils/atproto/collections'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { getCoOccurrenceNeighbors } from '../../utils/skill-co-occurrence'
import { getGenerated } from '../../utils/skill-generated'
import { findRelatedSkills, findSkill, findSkillsByLookups } from '../../utils/skills-registry'

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
const REPO_MISSING_CACHE_TTL = 60 * 60 * 24 // 24 hours, deleted repos
const REPO_TREE_CACHE_TTL = 60 * 60 * 6 // 6 hours
const COMMITS_CACHE_TTL = 60 * 60 * 12 // 12 hours, GitHub anon rate limit is tight

interface SkillCommit {
  sha: string
  shortSha: string
  message: string
  authorName: string
  authorAvatar: string | null
  date: string
  url: string
}

const ONE_DAY_MS = 1000 * 60 * 60 * 24

function computeMaturity(createdAt: string | null, pushedAt: string | null): { ageDays: number, sinceUpdateDays: number, cadence: 'active' | 'steady' | 'dormant' } | null {
  if (!createdAt || !pushedAt)
    return null
  const now = Date.now()
  const ageDays = Math.max(1, Math.floor((now - new Date(createdAt).getTime()) / ONE_DAY_MS))
  const sinceUpdateDays = Math.floor((now - new Date(pushedAt).getTime()) / ONE_DAY_MS)
  const cadence = sinceUpdateDays <= 30 ? 'active' : sinceUpdateDays <= 180 ? 'steady' : 'dormant'
  return { ageDays, sinceUpdateDays, cadence }
}

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

  const db = getDB(event)
  const [commits, related, faqRow, tagRow, coOccurrenceNeighbors, embeddingNeighbors] = await Promise.all([
    skillPath ? getSkillCommits(skill.owner, skill.repo, skillPath) : Promise.resolve([]),
    findRelatedSkills(event, { owner: skill.owner, repo: skill.repo, excludeName: skill.name, limit: 6 }),
    getGenerated<FaqPayload>(db, { owner: skill.owner, name: skill.name, kind: 'faq' }),
    getGenerated<TagPayload>(db, { owner: skill.owner, name: skill.name, kind: 'tags' }),
    getCoOccurrenceNeighbors(db, skill.name),
    getEmbeddingNeighbors(db, { owner: skill.owner, name: skill.name }),
  ])

  const [coOccurrenceSkills, embeddingSkills] = await resolveNeighborSkills(
    event,
    coOccurrenceNeighbors,
    embeddingNeighbors,
    skill.name,
  )

  const tags = (tagRow?.payload.tags ?? [])
    .map(slug => TAG_BY_SLUG.get(slug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))

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
    raw: raw ?? null,
    curators,
    description: repoMeta?.description ?? (typeof parsed?.frontmatter.description === 'string' ? parsed.frontmatter.description : null),
    stars: repoMeta?.stars ?? 0,
    forks: repoMeta?.forks ?? 0,
    pushedAt: repoMeta?.pushedAt ?? null,
    createdAt: repoMeta?.createdAt ?? null,
    maturity: computeMaturity(repoMeta?.createdAt ?? null, repoMeta?.pushedAt ?? null),
    commits,
    relatedRepoSkills: related.sameRepo,
    relatedOwnerSkills: related.sameOwner,
    tags,
    faqs: faqRow?.payload.items ?? [],
    coOccurrenceSkills,
    semanticSiblings: embeddingSkills,
  }
})

interface NeighborSkill {
  name: string
  owner: string
  repo: string
  slug: string
  displayName: string
  installs: number
  score: number
}

async function resolveNeighborSkills(
  event: H3Event,
  coOccurrence: CoOccurrenceNeighbor[],
  embedding: EmbeddingNeighbor[],
  excludeName: string,
): Promise<[NeighborSkill[], NeighborSkill[]]> {
  const coNames = coOccurrence.filter(n => n.name !== excludeName).slice(0, 8)
  const embedNames = embedding.filter(n => n.name !== excludeName).slice(0, 8)
  const lookups = [
    ...coNames.map(n => ({ packageName: n.name })),
    ...embedNames.map(n => ({ packageName: n.name, owner: n.owner })),
  ]
  if (!lookups.length)
    return [[], []]

  const map = await findSkillsByLookups(event, lookups)

  function hydrate<N extends { name: string }>(
    neighbors: N[],
    scoreKey: keyof N,
  ): NeighborSkill[] {
    return neighbors
      .map((n) => {
        const row = map.get(n.name)
        if (!row)
          return null
        return {
          name: row.name,
          owner: row.owner,
          repo: row.repo,
          slug: row.slug,
          displayName: row.displayName,
          installs: row.installs,
          score: Number(n[scoreKey]) || 0,
        }
      })
      .filter((s): s is NeighborSkill => s !== null)
      .slice(0, 6)
  }

  return [hydrate(coNames, 'score'), hydrate(embedNames, 'similarity')]
}

interface GhCommitResponse {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string, date: string } | null
  }
  author: { login: string, avatar_url: string } | null
}

async function getSkillCommits(owner: string, repo: string, path: string): Promise<SkillCommit[]> {
  const cacheKey = `skills:commits:${owner}/${repo}:${path}`
  const cached = await useStorage('cache').getItem<SkillCommit[]>(cacheKey)
  if (cached)
    return cached

  const data = await $fetch<GhCommitResponse[]>(`https://api.github.com/repos/${owner}/${repo}/commits`, {
    query: { path, per_page: 5 },
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'skilld.dev' },
  }).catch((err) => {
    console.warn(`[skills] Failed to fetch commits for ${owner}/${repo}:${path}:`, err?.statusCode || err)
    return null
  })

  if (!Array.isArray(data))
    return []

  const commits: SkillCommit[] = data.map(c => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: (c.commit?.message ?? '').split('\n')[0]!.slice(0, 140),
    authorName: c.author?.login ?? c.commit?.author?.name ?? 'unknown',
    authorAvatar: c.author?.avatar_url ?? null,
    date: c.commit?.author?.date ?? '',
    url: c.html_url,
  }))

  await useStorage('cache').setItem(cacheKey, commits, { ttl: COMMITS_CACHE_TTL })
  return commits
}

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

function parseFrontmatterValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed)
    return ''
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed)
    }
    catch {
      // Fall through to string handling
    }
  }
  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseSkillMd(raw: string): { frontmatter: Record<string, unknown>, body: string, html: string } {
  const frontmatter: Record<string, unknown> = {}
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
      frontmatter[key] = parseFrontmatterValue(line.slice(colonIdx + 1))
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
