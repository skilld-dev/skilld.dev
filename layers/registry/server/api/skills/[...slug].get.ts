import type { FaqPayload } from '../../jobs/generate-faqs'
import type { SummaryPayload } from '../../jobs/generate-summary'
import type { TagPayload } from '../../jobs/generate-tags'
import { Marked } from 'marked'
import { getGenerated } from '~~/layers/registry/server/utils/skill-generated'
import { findSkill, findSupportedDuplicateGroupForSkill } from '~~/layers/registry/server/utils/skills-registry'
import { officialRepos } from '../../data/official-repos'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'

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

const SKILL_TAG_RE = /^<(\/?)([A-Z][A-Z0-9-]*)\s*>$/

const skillMd = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html({ text }: { text: string }) {
      const m = text.match(SKILL_TAG_RE)
      if (m)
        return `<code class="skill-tag">&lt;${m[1]}${m[2]}&gt;</code>`
      return escapeHtml(text)
    },
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
type CapabilityScope = 'read' | 'write' | 'exec' | 'net'

const TOOL_CATEGORIES: { match: RegExp, scope: CapabilityScope }[] = [
  { match: /^(Read|Glob|Grep|NotebookRead|LS)$/i, scope: 'read' },
  { match: /^(Edit|Write|MultiEdit|NotebookEdit)$/i, scope: 'write' },
  { match: /^(Bash|Task|KillBash|BashOutput)$/i, scope: 'exec' },
  { match: /^(WebFetch|WebSearch|mcp__.*fetch.*|mcp__.*http.*)$/i, scope: 'net' },
]

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

function parseAllowedTools(frontmatter: Record<string, unknown> | null): string[] {
  const raw = frontmatter?.['allowed-tools']
  if (Array.isArray(raw))
    return raw.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof raw !== 'string' || !raw)
    return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function classifyAllowedTools(allowedTools: string[]): { scopes: CapabilityScope[], mcpServers: string[] } {
  const scopes = new Set<CapabilityScope>()
  const mcpServers: string[] = []

  for (const raw of allowedTools) {
    const tool = raw.split('(')[0]!.trim()
    if (tool.startsWith('mcp__')) {
      const server = tool.split('__')[1]
      if (server && !mcpServers.includes(server))
        mcpServers.push(server)
    }
    for (const cat of TOOL_CATEGORIES) {
      if (cat.match.test(tool))
        scopes.add(cat.scope)
    }
  }

  return { scopes: [...scopes], mcpServers }
}

function frontmatterString(frontmatter: Record<string, unknown> | null, key: string): string | null {
  const value = frontmatter?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function secondsAgo(ts: number | null | undefined): number | null {
  if (!ts)
    return null
  return Math.max(0, Math.floor(Date.now() / 1000) - ts)
}

function daysFromSecondsAgo(value: number | null): number | null {
  return value === null ? null : Math.floor(value / (ONE_DAY_MS / 1000))
}

function isoToSecondsAgo(value: string | null | undefined): number | null {
  if (!value)
    return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time))
    return null
  return Math.max(0, Math.floor((Date.now() - time) / 1000))
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, message: 'Missing skill slug' })

  const skill = await findSkill(event, slug)
  if (!skill)
    throw createError({ statusCode: 404, message: 'Skill not found' })

  const githubUrl = `https://github.com/${skill.owner}/${skill.repo}`

  const [curators, repoMeta, revision, latestCommit, duplicateGroup] = await Promise.all([
    getEndorsementsForSkill(getDB(event), skill.name),
    getRepoMeta(skill.owner, skill.repo),
    getDB(event)
      .prepare(`SELECT current_sha, modified_at, references_count, last_synced_at, sync_status,
                       seo_index_score, seo_indexable, seo_index_reasons, seo_index_synced_at,
                       curator_count, curator_reason_count, approved_social_count, author_social_count,
                       trust_tier, trust_source, trust_score, trust_reasons, trust_synced_at
                FROM skills WHERE owner = ? AND name = ?`)
      .bind(skill.owner, skill.name)
      .first<{
      current_sha: string | null
      modified_at: number | null
      references_count: number | null
      last_synced_at: number | null
      sync_status: string | null
      seo_index_score: number | null
      seo_indexable: number | null
      seo_index_reasons: string | null
      seo_index_synced_at: number | null
      curator_count: number | null
      curator_reason_count: number | null
      approved_social_count: number | null
      author_social_count: number | null
      trust_tier: string | null
      trust_source: string | null
      trust_score: number | null
      trust_reasons: string | null
      trust_synced_at: number | null
    }>(),
    getDB(event)
      .prepare(`SELECT sha FROM skill_revisions WHERE owner = ? AND name = ? ORDER BY modified_at DESC LIMIT 1`)
      .bind(skill.owner, skill.name)
      .first<{ sha: string }>(),
    findSupportedDuplicateGroupForSkill(event, skill.slug),
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

  const description = repoMeta?.description ?? frontmatterString(rendered.frontmatter, 'description')
  const allowedTools = parseAllowedTools(rendered.frontmatter)
  const capability = classifyAllowedTools(allowedTools)
  const sourceResolved = Boolean(rendered.status === 'ok' && rendered.skillPath && rendered.raw)
  const sourceCommitSha = latestCommit?.sha ?? revision?.current_sha ?? null

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
    description,
    stars: repoMeta?.stars ?? 0,
    forks: repoMeta?.forks ?? 0,
    pushedAt: repoMeta?.pushedAt ?? null,
    createdAt: repoMeta?.createdAt ?? null,
    maturity: computeMaturity(repoMeta?.createdAt ?? null, repoMeta?.pushedAt ?? null),
    tier: resolveTier(skill.owner, skill.repo),
    sourceFacts: {
      description: {
        present: Boolean(description?.trim()),
        length: description?.trim().length ?? 0,
        source: repoMeta?.description ? 'repository' : frontmatterString(rendered.frontmatter, 'description') ? 'frontmatter' : null,
      },
      repository: {
        pushedAt: repoMeta?.pushedAt ?? null,
        pushedAgeDays: daysFromSecondsAgo(isoToSecondsAgo(repoMeta?.pushedAt ?? null)),
        createdAt: repoMeta?.createdAt ?? null,
        stars: repoMeta?.stars ?? 0,
        forks: repoMeta?.forks ?? 0,
        defaultBranch: branch,
      },
      source: {
        resolved: sourceResolved,
        resolutionStatus: rendered.status,
        skillPath: rendered.skillPath,
        currentSha: revision?.current_sha ?? null,
        hasCurrentSha: Boolean(revision?.current_sha),
        latestRevisionSha: latestCommit?.sha ?? null,
        modifiedAt: revision?.modified_at ?? null,
        modifiedAgeDays: daysFromSecondsAgo(secondsAgo(revision?.modified_at)),
        referencesCount: revision?.references_count ?? 0,
        lastSyncedAt: revision?.last_synced_at ?? null,
        lastSyncedAgeDays: daysFromSecondsAgo(secondsAgo(revision?.last_synced_at)),
        syncStatus: revision?.sync_status ?? null,
      },
      frontmatter: {
        present: Boolean(rendered.frontmatter && Object.keys(rendered.frontmatter).length),
        keys: rendered.frontmatter ? Object.keys(rendered.frontmatter).sort() : [],
        model: frontmatterString(rendered.frontmatter, 'model'),
        allowedTools,
        capabilityScopes: capability.scopes,
        mcpServers: capability.mcpServers,
      },
    },
    tags,
    faqs: faqRow?.payload.items ?? [],
    summary: summaryRow?.payload
      ? {
          tagline: summaryRow.payload.tagline,
          blurb: summaryRow.payload.blurb,
          useCases: summaryRow.payload.useCases,
        }
      : null,
    provenance: {
      owner: skill.owner,
      repo: skill.repo,
      branch,
      skillPath: rendered.skillPath,
      sourceCommitSha,
      sourceCommitUrl: sourceCommitSha
        ? `${githubUrl}/commit/${sourceCommitSha}`
        : null,
      skillFileUrl: rendered.skillPath
        ? `${githubUrl}/blob/${sourceCommitSha ?? branch}/${rendered.skillPath}`
        : null,
      historyUrl: rendered.skillPath
        ? `${githubUrl}/commits/${branch}/${rendered.skillPath}`
        : null,
      modifiedAt: revision?.modified_at ?? null,
      referencesCount: revision?.references_count ?? 0,
      lastSyncedAt: revision?.last_synced_at ?? null,
      syncStatus: revision?.sync_status ?? null,
    },
    seo: {
      indexScore: revision?.seo_index_score ?? 0,
      indexable: revision?.seo_indexable === 1,
      reasons: revision?.seo_index_reasons ? JSON.parse(revision.seo_index_reasons) as string[] : [],
      syncedAt: revision?.seo_index_synced_at ?? null,
      curatorCount: revision?.curator_count ?? 0,
      curatorReasonCount: revision?.curator_reason_count ?? 0,
      approvedSocialCount: revision?.approved_social_count ?? 0,
      authorSocialCount: revision?.author_social_count ?? 0,
    },
    trust: {
      tier: revision?.trust_tier ?? 'untrusted',
      source: revision?.trust_source ?? 'computed',
      score: revision?.trust_score ?? 0,
      reasons: revision?.trust_reasons ? JSON.parse(revision.trust_reasons) as string[] : [],
      syncedAt: revision?.trust_synced_at ?? null,
    },
    duplicateGroup,
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
  const cacheKey = `skills:rendered:v6:${owner}/${repo}/${name}:${pushedAt ?? 'unknown'}`
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

function slugifyName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

async function resolveSkillMdPath(owner: string, repo: string, name: string, branch: string): Promise<string | null> {
  const cacheKey = `skills:skill-path:v5:${owner}/${repo}/${name}`
  const cached = await useStorage('cache').getItem<string | null>(cacheKey)
  if (cached !== null && cached !== undefined)
    return cached || null

  const files = await getRepoTree(owner, repo, branch)
  if (!files)
    return null

  const skillMds = files.filter(f => f.path.endsWith('SKILL.md'))
  if (!skillMds.length)
    return null

  const slug = slugifyName(name)
  // Original first, then a slugified variant. Catches names with spaces or
  // colons (`agent browser` → `agent-browser`, `react:components` →
  // `react-components`) where the registry name doesn't match the dir name.
  const variants = name === slug ? [name] : [name, slug]

  const cache = (path: string) => useStorage('cache').setItem(cacheKey, path, { ttl: REPO_TREE_CACHE_TTL })

  for (const v of variants) {
    const exact = skillMds.find(f => f.path.endsWith(`/${v}/SKILL.md`) || f.path === `${v}/SKILL.md`)
    if (exact) {
      await cache(exact.path)
      return exact.path
    }
  }

  if (skillMds.length === 1) {
    await cache(skillMds[0]!.path)
    return skillMds[0]!.path
  }

  for (const v of variants) {
    const fuzzy = skillMds.find(f => f.path.split('/').includes(v))
    if (fuzzy) {
      await cache(fuzzy.path)
      return fuzzy.path
    }
  }

  // Multi-segment match: registry packs paths like `better-auth/best-practices`
  // into a single hyphenated name `better-auth-best-practices`. Try every
  // hyphen split; accept only when exactly one path matches (avoid ambiguity).
  if (slug.includes('-')) {
    const parts = slug.split('-')
    for (let i = 1; i < parts.length; i++) {
      const left = parts.slice(0, i).join('-')
      const right = parts.slice(i).join('-')
      const matches = skillMds.filter((f) => {
        const segs = f.path.split('/')
        const idx = segs.indexOf(left)
        return idx >= 0 && segs[idx + 1] === right
      })
      if (matches.length === 1) {
        await cache(matches[0]!.path)
        return matches[0]!.path
      }
    }
  }

  // Frontmatter-name match: registry uses the SKILL.md frontmatter `name:`
  // field, which often differs from the directory name (e.g. dir `postgresql`,
  // frontmatter `postgresql-table-design`). Build a slug → path index by
  // scanning the repo's SKILL.md files. Both keys and lookups are slugified
  // so `Frontend Responsive Design Standards` matches `frontend responsive
  // design standards` from the registry.
  const fmIndex = await getRepoFrontmatterIndex(owner, repo, branch, skillMds)
  if (fmIndex) {
    const path = fmIndex[slug] ?? fmIndex[slugifyName(name)]
    if (path) {
      await cache(path)
      return path
    }
  }

  await useStorage('cache').setItem(cacheKey, '', { ttl: REPO_TREE_CACHE_TTL })
  return null
}

const FRONTMATTER_INDEX_MAX_FILES = 250
const FRONTMATTER_FETCH_CONCURRENCY = 8

async function getRepoFrontmatterIndex(
  owner: string,
  repo: string,
  branch: string,
  skillMds: UnghTreeFile[],
): Promise<Record<string, string> | null> {
  if (skillMds.length > FRONTMATTER_INDEX_MAX_FILES)
    return null

  const cacheKey = `skills:fm-index:v2:${owner}/${repo}/${branch}`
  const cached = await useStorage('cache').getItem<Record<string, string>>(cacheKey)
  if (cached)
    return cached

  const index: Record<string, string> = {}
  let cursor = 0
  async function worker() {
    while (cursor < skillMds.length) {
      const i = cursor++
      const path = skillMds[i]!.path
      const name = await fetchFrontmatterName(owner, repo, branch, path)
      if (name) {
        const key = slugifyName(name)
        if (key && !index[key])
          index[key] = path
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FRONTMATTER_FETCH_CONCURRENCY, skillMds.length) }, () => worker()))

  await useStorage('cache').setItem(cacheKey, index, { ttl: REPO_TREE_CACHE_TTL })
  return index
}

async function fetchFrontmatterName(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
  const raw = await $fetch<string>(url, { responseType: 'text' }).catch(() => null)
  if (!raw)
    return null
  // Match only inside the frontmatter block to avoid pulling stray `name:` lines from prose.
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm)
    return null
  for (const line of fm[1]!.split(/\r?\n/)) {
    const m = line.match(/^name:(.*)$/)
    if (!m)
      continue
    const value = m[1]!.trim().replace(/^['"]|['"]$/g, '').trim()
    return value || null
  }
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

  const html = (skillMd.parse(body) as string).replace(/<pre\b([^>]*)>/g, (match, attrs: string) => {
    if (/\btabindex=/.test(attrs))
      return match
    return `<pre tabindex="0"${attrs}>`
  })
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

async function buildEndorsementMap(_db: D1Database): Promise<Record<string, CuratorEndorsement[]>> {
  // Phase 1: endorsements were sourced from atproto curator collections, which
  // are gone. Returns empty until Phase 2 rebuilds against collections_v2.
  return {}
}
