import type { H3Event } from 'h3'

import { LIVE_RENDER_STALE_SECONDS } from '~~/server/utils/sync-thresholds'
import { writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { officialRepos } from '../../data/official-repos'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { SkillDetailResponseSchema } from '../../schemas/skill-responses'
import { getTree, resolveGithubBindings } from '../../utils/github-client'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { getGenerated } from '../../utils/skill-generated'
import { parseSkillMd } from '../../utils/skill-md-render'
import { findDuplicateGroupForSkill, findSkill } from '../../utils/skills-registry'

interface FaqPayload { faqs: { question: string, answer: string }[] }
interface SummaryPayload { text: string }
interface TagPayload { tags: string[] }

interface CuratorEndorsement {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  collectionName: string
  collectionSlug: string
  reason?: string
}

const ENDORSEMENTS_CACHE_KEY = 'skills:endorsement-map'
const ENDORSEMENTS_CACHE_TTL = 60 * 5

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

function computeMaturity(createdAtSec: number | null, pushedAtSec: number | null): { ageDays: number, sinceUpdateDays: number, cadence: 'active' | 'steady' | 'dormant' } | null {
  if (!createdAtSec || !pushedAtSec)
    return null
  const nowSec = Math.floor(Date.now() / 1000)
  const dayS = 86400
  const ageDays = Math.max(1, Math.floor((nowSec - createdAtSec) / dayS))
  const sinceUpdateDays = Math.floor((nowSec - pushedAtSec) / dayS)
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

function epochToIso(sec: number | null | undefined): string | null {
  if (!sec)
    return null
  return new Date(sec * 1000).toISOString()
}

function isoToSecondsAgo(value: string | null | undefined): number | null {
  if (!value)
    return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time))
    return null
  return Math.max(0, Math.floor((Date.now() - time) / 1000))
}

interface SkillDetailRow {
  // repo meta
  stars: number | null
  forks: number | null
  pushed_at: number | null
  repo_created_at: number | null
  default_branch: string | null
  source_owner: string | null
  source_repo: string | null
  // sync/revision
  current_sha: string | null
  modified_at: number | null
  references_count: number | null
  assets: string | null
  last_synced_at: number | null
  sync_status: string | null
  // seo / trust
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
  // rendered
  rendered_skill_path: string | null
  rendered_status: string | null
  rendered_raw: string | null
  rendered_frontmatter: string | null
  rendered_html: string | null
  rendered_at: number | null
}

export default defineApiHandler({
  response: SkillDetailResponseSchema,
  handler: async ({ event, platform }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    const skill = await findSkill(event, slug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const [curators, row, latestCommit, duplicateGroup, faqRow, tagRow, summaryRow] = await Promise.all([
      getEndorsementsForSkill(platform.db, skill.name),
      platform.db
        .prepare(`SELECT r.stars, r.forks, r.pushed_at, r.repo_created_at, r.default_branch,
                         r.source_owner, r.source_repo,
                         s.current_sha, s.modified_at, s.references_count, s.assets, s.last_synced_at, s.sync_status,
                         s.seo_index_score, s.seo_indexable, s.seo_index_reasons, s.seo_index_synced_at,
                         s.curator_count, s.curator_reason_count, s.approved_social_count, s.author_social_count,
                         s.trust_tier, s.trust_source, s.trust_score, s.trust_reasons, s.trust_synced_at,
                         s.rendered_skill_path, s.rendered_status, s.rendered_raw, s.rendered_frontmatter, s.rendered_html, s.rendered_at
                  FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
                  WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
        .bind(skill.owner, skill.repo, skill.name)
        .first<SkillDetailRow>(),
      platform.db
        .prepare(`SELECT sha FROM skill_revisions WHERE owner = ? AND repo = ? AND name = ? ORDER BY modified_at DESC LIMIT 1`)
        .bind(skill.owner, skill.repo, skill.name)
        .first<{ sha: string }>(),
      findDuplicateGroupForSkill(event, `${skill.owner}/${skill.repo}/${skill.name}`),
      getGenerated<FaqPayload>(platform.db, { owner: skill.owner, repo: skill.repo, name: skill.name, kind: 'faq' }),
      getGenerated<TagPayload>(platform.db, { owner: skill.owner, repo: skill.repo, name: skill.name, kind: 'tags' }),
      getGenerated<SummaryPayload>(platform.db, { owner: skill.owner, repo: skill.repo, name: skill.name, kind: 'summary' }),
    ])

    const source = resolveRepoSourceIdentityFromRow(skill, row)
    const githubUrl = `https://github.com/${source.owner}/${source.repo}`
    const branch = row?.default_branch || 'main'

    // Warm path: render is in D1. Cold path (legacy rows or fetch_failed
    // status): fall back to a live render so the first visit still works,
    // then write back to D1.
    let rendered: RenderedView
    if (row?.rendered_html && row.rendered_status === 'ok') {
      const reparsed = row.rendered_raw
        ? await parseSkillMd(row.rendered_raw, {
            owner: source.owner,
            repo: source.repo,
            name: skill.name,
            branch,
            skillDir: row.rendered_skill_path?.replace(/\/SKILL\.md$/, '') ?? '',
            filePath: '',
          })
        : null
      rendered = {
        skillPath: row.rendered_skill_path,
        raw: row.rendered_raw,
        frontmatter: reparsed?.frontmatter ?? parseFrontmatterJson(row.rendered_frontmatter),
        body: reparsed?.body ?? stripFrontmatter(row.rendered_raw ?? ''),
        html: reparsed?.html ?? row.rendered_html,
        status: 'ok',
      }
    }
    else {
      rendered = await renderLive(event, source.owner, source.repo, skill.name, branch)
      // Cache cold-path result back to D1 so subsequent visits hit the warm
      // path. Fire-and-forget; missing waitUntil context (e.g. local dev)
      // just means we await it inline.
      schedulePersist(event, platform.db, skill.owner, skill.repo, skill.name, rendered)
    }

    // Stale refresh: only fire when rendered_at older than threshold.
    const renderedAge = secondsAgo(row?.rendered_at)
    if (row?.rendered_html && renderedAge != null && renderedAge > LIVE_RENDER_STALE_SECONDS)
      scheduleRefresh(event, platform.db, skill, source, skill.name, branch)

    const rawAiTags = tagRow?.payload.tags ?? []
    const tags = rawAiTags
      .map(s => TAG_BY_SLUG.get(s))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
    const knownTagSlugs = new Set(tags.map(t => t.slug))
    const keywords = rawAiTags.filter(t => !knownTagSlugs.has(t))

    const description = frontmatterString(rendered.frontmatter, 'description') ?? skill.description ?? null
    let assets: { path: string, size: number, type: string }[] = []
    if (row?.assets) {
      try {
        const parsedAssets = JSON.parse(row.assets) as unknown
        if (Array.isArray(parsedAssets)) {
          assets = parsedAssets.filter((a): a is { path: string, size: number, type: string } =>
            Boolean(a) && typeof a === 'object' && typeof (a as { path: unknown }).path === 'string')
        }
      }
      catch {
        // Ignore malformed JSON; treat as no assets.
      }
    }
    const allowedTools = parseAllowedTools(rendered.frontmatter)
    const capability = classifyAllowedTools(allowedTools)
    const sourceResolved = Boolean(rendered.status === 'ok' && rendered.skillPath && rendered.raw)
    const sourceCommitSha = latestCommit?.sha ?? row?.current_sha ?? null
    const pushedAtIso = epochToIso(row?.pushed_at)
    const createdAtIso = epochToIso(row?.repo_created_at)

    return {
      owner: skill.owner,
      repo: skill.repo,
      name: skill.name,
      displayName: skill.displayName,
      githubUrl,
      skillPath: rendered.skillPath,
      branch,
      resolutionStatus: rendered.status,
      content: rendered.body,
      contentHtml: rendered.html,
      frontmatter: rendered.frontmatter,
      raw: rendered.raw,
      assets,
      curators,
      description,
      stars: row?.stars ?? 0,
      forks: row?.forks ?? 0,
      pushedAt: pushedAtIso,
      createdAt: createdAtIso,
      maturity: computeMaturity(row?.repo_created_at ?? null, row?.pushed_at ?? null),
      tier: resolveTier(skill.owner, skill.repo),
      sourceFacts: {
        description: {
          present: Boolean(description?.trim()),
          length: description?.trim().length ?? 0,
          source: frontmatterString(rendered.frontmatter, 'description') ? 'frontmatter' : skill.description ? 'repository' : null,
        },
        repository: {
          pushedAt: pushedAtIso,
          pushedAgeDays: daysFromSecondsAgo(isoToSecondsAgo(pushedAtIso)),
          createdAt: createdAtIso,
          stars: row?.stars ?? 0,
          forks: row?.forks ?? 0,
          defaultBranch: branch,
        },
        source: {
          resolved: sourceResolved,
          resolutionStatus: rendered.status,
          skillPath: rendered.skillPath,
          currentSha: row?.current_sha ?? null,
          hasCurrentSha: Boolean(row?.current_sha),
          latestRevisionSha: latestCommit?.sha ?? null,
          modifiedAt: row?.modified_at ?? null,
          modifiedAgeDays: daysFromSecondsAgo(secondsAgo(row?.modified_at)),
          referencesCount: row?.references_count ?? 0,
          lastSyncedAt: row?.last_synced_at ?? null,
          lastSyncedAgeDays: daysFromSecondsAgo(secondsAgo(row?.last_synced_at)),
          syncStatus: row?.sync_status ?? null,
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
      keywords,
      faqs: faqRow?.payload.faqs ?? [],
      summary: summaryRow?.payload?.text
        ? { text: summaryRow.payload.text }
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
        modifiedAt: row?.modified_at ?? null,
        referencesCount: row?.references_count ?? 0,
        lastSyncedAt: row?.last_synced_at ?? null,
        syncStatus: row?.sync_status ?? null,
      },
      seo: {
        indexScore: row?.seo_index_score ?? 0,
        indexable: row?.seo_indexable === 1,
        reasons: row?.seo_index_reasons ? JSON.parse(row.seo_index_reasons) as string[] : [],
        syncedAt: row?.seo_index_synced_at ?? null,
        curatorCount: row?.curator_count ?? 0,
        curatorReasonCount: row?.curator_reason_count ?? 0,
        approvedSocialCount: row?.approved_social_count ?? 0,
        authorSocialCount: row?.author_social_count ?? 0,
      },
      trust: {
        tier: row?.trust_tier ?? 'untrusted',
        source: row?.trust_source ?? 'computed',
        score: row?.trust_score ?? 0,
        reasons: row?.trust_reasons ? JSON.parse(row.trust_reasons) as string[] : [],
        syncedAt: row?.trust_synced_at ?? null,
      },
      duplicateGroup,
    }
  },
})

interface RenderedView {
  skillPath: string | null
  raw: string | null
  frontmatter: Record<string, unknown> | null
  body: string | null
  html: string | null
  status: 'ok' | 'path_missing' | 'fetch_failed'
}

function parseFrontmatterJson(value: string | null): Record<string, unknown> | null {
  if (!value)
    return null
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  }
  catch {
    return null
  }
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
  return m ? m[1]! : raw
}

// Live render fallback for rows that pre-date the rendered_* columns or had
// a previous fetch_failed. Tries the common layouts via raw.githubusercontent
// first (cheap, no API quota), then falls back to the authenticated GitHub
// trees API for repos that nest SKILL.md under arbitrary directories
// (e.g. Claude plugin repos mirroring under `.claude/skills/<name>/SKILL.md`).
async function renderLive(
  event: H3Event,
  owner: string,
  repo: string,
  name: string,
  branch: string,
): Promise<RenderedView> {
  const candidates = [
    `skills/${name}/SKILL.md`,
    `${name}/SKILL.md`,
    `.claude/skills/${name}/SKILL.md`,
    `.agents/skills/${name}/SKILL.md`,
    `plugin/skills/${name}/SKILL.md`,
  ]
  for (const path of candidates) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    const raw = await $fetch<string>(url, { responseType: 'text' }).catch((error) => {
      console.warn(`[skill-detail] ${error instanceof Error ? error.message : String(error)}`)
      return null
    })
    if (raw) {
      const skillDir = path.replace(/\/SKILL\.md$/, '')
      const parsed = await parseSkillMd(raw, { owner, repo, name, branch, skillDir, filePath: '' })
      return {
        skillPath: path,
        raw,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        html: parsed.html,
        status: 'ok',
      }
    }
  }

  // Authenticated GitHub trees API (matches sync-repo.ts). Recursive listing
  // surfaces nested or dotfile-mirrored layouts the candidates above miss.
  const bindings = resolveGithubBindings(event.context.platform?.env)
  const treeRes = await getTree(owner, repo, branch, bindings).catch((error) => {
    console.warn(`[skill-detail] ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  const match = treeRes?.data?.tree.find(
    e => e.type === 'blob' && e.path.endsWith(`/${name}/SKILL.md`),
  )
  if (match) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${match.path}`
    const raw = await $fetch<string>(url, { responseType: 'text' }).catch((error) => {
      console.warn(`[skill-detail] ${error instanceof Error ? error.message : String(error)}`)
      return null
    })
    if (raw) {
      const skillDir = match.path.replace(/\/SKILL\.md$/, '')
      const parsed = await parseSkillMd(raw, { owner, repo, name, branch, skillDir, filePath: '' })
      return {
        skillPath: match.path,
        raw,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        html: parsed.html,
        status: 'ok',
      }
    }
  }

  return { skillPath: null, raw: null, frontmatter: null, body: null, html: null, status: 'path_missing' }
}

function schedulePersist(event: H3Event, db: D1Database, owner: string, repo: string, name: string, rendered: RenderedView): void {
  if (rendered.status !== 'ok' || !rendered.html)
    return
  const promise = db
    .prepare(`UPDATE skills SET rendered_skill_path = ?, rendered_status = 'ok', rendered_raw = ?, rendered_frontmatter = ?, rendered_html = ?, rendered_at = ? WHERE owner = ? AND repo = ? AND name = ?`)
    .bind(
      rendered.skillPath,
      rendered.raw,
      JSON.stringify(rendered.frontmatter ?? {}),
      rendered.html,
      Math.floor(Date.now() / 1000),
      owner,
      repo,
      name,
    )
    .run()
    .catch((err) => {
      console.warn(`[skills] persist rendered failed for ${owner}/${repo}/${name}:`, err)
    })
  runAfterResponse(event, promise)
}

function scheduleRefresh(
  event: H3Event,
  db: D1Database,
  registry: { owner: string, repo: string },
  source: { owner: string, repo: string },
  name: string,
  branch: string,
): void {
  const promise = (async () => {
    const live = await renderLive(event, source.owner, source.repo, name, branch)
    if (live.status !== 'ok' || !live.html)
      return
    await db
      .prepare(`UPDATE skills SET rendered_skill_path = ?, rendered_status = 'ok', rendered_raw = ?, rendered_frontmatter = ?, rendered_html = ?, rendered_at = ? WHERE owner = ? AND repo = ? AND name = ?`)
      .bind(
        live.skillPath,
        live.raw,
        JSON.stringify(live.frontmatter ?? {}),
        live.html,
        Math.floor(Date.now() / 1000),
        registry.owner,
        registry.repo,
        name,
      )
      .run()
  })().catch((err) => {
    console.warn(`[skills] stale refresh failed for ${registry.owner}/${registry.repo}/${name}:`, err)
  })
  runAfterResponse(event, promise)
}

function runAfterResponse(event: H3Event, promise: Promise<unknown>): void {
  const ctx = (event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise)
    return
  }
  // Local dev / non-Workers: don't block the response, but make sure the
  // promise isn't an unhandled rejection.
  void promise
}

async function getEndorsementsForSkill(db: D1Database, skillName: string): Promise<CuratorEndorsement[]> {
  let endorsementMap = await useStorage('cache').getItem<Record<string, CuratorEndorsement[]>>(ENDORSEMENTS_CACHE_KEY)

  if (!endorsementMap) {
    endorsementMap = await buildEndorsementMap(db)
    await writeCache(useStorage('cache'), ENDORSEMENTS_CACHE_KEY, endorsementMap, { ttl: ENDORSEMENTS_CACHE_TTL })
  }

  return endorsementMap[skillName] ?? []
}

async function buildEndorsementMap(_db: D1Database): Promise<Record<string, CuratorEndorsement[]>> {
  // Phase 1: endorsements were sourced from atproto curator collections, which
  // are gone. Returns empty until Phase 2 rebuilds against collections_v2.
  return {}
}
