import type { FaqPayload } from '../../jobs/generate-faqs'
import type { SummaryPayload } from '../../jobs/generate-summary'
import type { TagPayload } from '../../jobs/generate-tags'
import { Marked } from 'marked'
import { officialRepos } from '../../data/official-repos'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { listCollectionRecords } from '../../utils/atproto/collections'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { getGenerated } from '../../utils/skill-generated'
import { findSkill } from '../../utils/skills-registry'

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const HTML_ESCAPE_RE = /[&<>"']/g
function escapeHtml(s: string): string {
  return s.replace(HTML_ESCAPE_RE, c => HTML_ESCAPE[c]!)
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(?:javascript|vbscript|data|file):/i.test(trimmed)) {
    if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);/i.test(trimmed))
      return trimmed
    return '#'
  }
  return trimmed
}

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

interface UnghTreeFile {
  path: string
  mode: string
  sha: string
  size: number
}

const ENDORSEMENTS_CACHE_KEY = 'skills:endorsement-map'
const ENDORSEMENTS_CACHE_TTL = 60 * 5
const REPO_META_CACHE_TTL = 60 * 15
const REPO_MISSING_CACHE_TTL = 60 * 60 * 24
const REPO_TREE_CACHE_TTL = 60 * 60 * 6
const RENDERED_CACHE_TTL = 60 * 60 * 24 * 7
const RENDERED_MISSING_TTL = 60 * 60 * 24

const ONE_DAY_MS = 1000 * 60 * 60 * 24

const OFFICIAL_REPO_KEYS = new Set(officialRepos.map(r => `${r.owner}/${r.repo}`))
const OFFICIAL_REPO_KIND = new Map(officialRepos.map(r => [`${r.owner}/${r.repo}`, r.kind]))

export type SkillTier = 'official-org' | 'official-user' | 'community'

function resolveTier(owner: string, repo: string): SkillTier {
  const key = `${owner}/${repo}`
  if (!OFFICIAL_REPO_KEYS.has(key))
    return 'community'
  return OFFICIAL_REPO_KIND.get(key) === 'user' ? 'official-user' : 'official-org'
}

function computeMaturity(createdAt: string | null, pushedAt: string | null): { ageDays: number, sinceUpdateDays: number, cadence: 'active' | 'steady' | 'dormant' } | null {
  if (!createdAt || !pushedAt)
    return null
  const now = Date.now()
  const ageDays = Math.max(1, Math.floor((now - new Date(createdAt).getTime()) / ONE_DAY_MS))
  const sinceUpdateDays = Math.floor((now - new Date(pushedAt).getTime()) / ONE_DAY_MS)
  const cadence = sinceUpdateDays <= 30 ? 'active' : sinceUpdateDays <= 180 ? 'steady' : 'dormant'
  return { ageDays, sinceUpdateDays, cadence }
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, message: 'Missing skill slug' })

  const skill = await findSkill(event, slug)
  if (!skill)
    throw createError({ statusCode: 404, message: 'Skill not found' })

  const githubUrl = `https://github.com/${skill.owner}/${skill.repo}`

  const [curators, repoMeta] = await Promise.all([
    getEndorsementsForSkill(getDB(event), skill.name),
    getRepoMeta(skill.owner, skill.repo),
  ])

  if (repoMeta === 'not-found')
    throw createError({ statusCode: 404, message: 'Skill source repository no longer exists' })

  const branch = repoMeta?.defaultBranch || 'main'

  const rendered = await getRenderedSkill(skill.owner, skill.repo, skill.name, branch, repoMeta?.pushedAt ?? null)

  const db = getDB(event)
  const [faqRow, tagRow, summaryRow] = await Promise.all([
    getGenerated<FaqPayload>(db, { owner: skill.owner, name: skill.name, kind: 'faq' }),
    getGenerated<TagPayload>(db, { owner: skill.owner, name: skill.name, kind: 'tags' }),
    getGenerated<SummaryPayload>(db, { owner: skill.owner, name: skill.name, kind: 'summary' }),
  ])

  const tags = (tagRow?.payload.tags ?? [])
    .map(s => TAG_BY_SLUG.get(s))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))

  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    displayName: skill.displayName,
    installs: skill.installs,
    githubUrl,
    url: `https://skills.sh/${skill.slug}`,
    skillPath: rendered.skillPath,
    branch,
    resolutionStatus: rendered.status,
    content: rendered.body,
    contentHtml: rendered.html,
    frontmatter: rendered.frontmatter,
    raw: rendered.raw,
    curators,
    description: repoMeta?.description ?? (typeof rendered.frontmatter?.description === 'string' ? rendered.frontmatter.description : null),
    stars: repoMeta?.stars ?? 0,
    forks: repoMeta?.forks ?? 0,
    pushedAt: repoMeta?.pushedAt ?? null,
    createdAt: repoMeta?.createdAt ?? null,
    maturity: computeMaturity(repoMeta?.createdAt ?? null, repoMeta?.pushedAt ?? null),
    tier: resolveTier(skill.owner, skill.repo),
    tags,
    faqs: faqRow?.payload.items ?? [],
    summary: summaryRow?.payload
      ? {
          tagline: summaryRow.payload.tagline,
          blurb: summaryRow.payload.blurb,
          useCases: summaryRow.payload.useCases,
        }
      : null,
  }
})

interface RenderedCache {
  skillPath: string | null
  raw: string | null
  frontmatter: Record<string, unknown> | null
  body: string | null
  html: string | null
  status: 'ok' | 'path_missing' | 'fetch_failed'
}

async function getRenderedSkill(
  owner: string,
  repo: string,
  name: string,
  branch: string,
  pushedAt: string | null,
): Promise<RenderedCache> {
  const cacheKey = `skills:rendered:v1:${owner}/${repo}/${name}:${pushedAt ?? 'unknown'}`
  const cached = await useStorage('cache').getItem<RenderedCache>(cacheKey)
  if (cached)
    return cached

  const skillPath = await resolveSkillMdPath(owner, repo, name, branch)
  if (!skillPath) {
    const result: RenderedCache = { skillPath: null, raw: null, frontmatter: null, body: null, html: null, status: 'path_missing' }
    await useStorage('cache').setItem(cacheKey, result, { ttl: RENDERED_MISSING_TTL })
    return result
  }

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`
  const raw = await $fetch<string>(rawUrl, { responseType: 'text' }).catch((err) => {
    console.warn(`[skills] Failed to fetch SKILL.md from ${rawUrl}:`, err)
    return null
  })

  if (!raw) {
    const result: RenderedCache = { skillPath, raw: null, frontmatter: null, body: null, html: null, status: 'fetch_failed' }
    await useStorage('cache').setItem(cacheKey, result, { ttl: RENDERED_MISSING_TTL })
    return result
  }

  const parsed = parseSkillMd(raw)
  const result: RenderedCache = {
    skillPath,
    raw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    html: parsed.html,
    status: 'ok',
  }
  await useStorage('cache').setItem(cacheKey, result, { ttl: RENDERED_CACHE_TTL })
  return result
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

  const exact = skillMds.find(f => f.path.endsWith(`/${name}/SKILL.md`) || f.path === `${name}/SKILL.md`)
  if (exact) {
    await useStorage('cache').setItem(cacheKey, exact.path, { ttl: REPO_TREE_CACHE_TTL })
    return exact.path
  }

  if (skillMds.length === 1) {
    const path = skillMds[0]!.path
    await useStorage('cache').setItem(cacheKey, path, { ttl: REPO_TREE_CACHE_TTL })
    return path
  }

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
