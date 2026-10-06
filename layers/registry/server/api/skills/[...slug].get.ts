import type { H3Event } from 'h3'
import type { z } from 'zod'
import type { Platform } from '#shared/server/platform'

import { cached } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { githubSkillFileUrl } from '#shared/skill-file-url'
import { selectSkillFiles } from '#shared/skill-files'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { isSourceResolved } from '#shared/skill-source-resolution'
import { officialRepos } from '../../data/official-repos'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { SkillDetailResponseSchema } from '../../schemas/skill-responses'
import { getTree, GITHUB_PAGE_READ_TIMEOUT_MS, resolveGithubBindings } from '../../utils/github-client'
import { resolveRepoSourceIdentityFromRow } from '../../utils/repo-source-identity'
import { skillPageBehaviors } from '../../utils/skill-behaviors'
import { getGeneratedKinds } from '../../utils/skill-generated'
import { skillImagePolicyForEvent } from '../../utils/skill-image-policy'
import { parseSkillMd } from '../../utils/skill-md-render'
import { findDuplicateGroupForSkill, findSkillWithRow } from '../../utils/skills-registry'
import { tagLinkPath } from '../../utils/tag-quality'
import { isSkillIndexable, noteAdmissionFallback, SKILL_INDEX_INPUT_COLUMNS_SQL } from '../../utils/trending-admission'
import { parseSkillTrendingAwards, SKILL_TRENDING_AWARDS_SQL } from '../../utils/trending-awards'
import { fetchUpstreamText } from '../../utils/upstream-text'

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

const ONE_DAY_MS = 1000 * 60 * 60 * 24

const DETAIL_CACHE_TTL = 60
const DETAIL_CACHE_STALE_TTL = 60 * 5
type SkillDetailPayload = z.infer<typeof SkillDetailResponseSchema>

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

/**
 * Every column the detail reads beyond the Skill itself, read in the same
 * statement that resolves the slug. `repo_skill_count` and `author_name`
 * come from the shared Skill select, so they are not repeated here.
 */
const DETAIL_COLUMNS_SQL = `r.forks, r.repo_created_at,
  ${SKILL_INDEX_INPUT_COLUMNS_SQL},
  s.references_count, s.assets, s.last_synced_at, s.sync_status, s.source_resolved,
  s.seo_index_reasons, s.seo_index_synced_at,
  s.curator_count, s.curator_reason_count, s.approved_social_count, s.author_social_count,
  s.trust_source, s.trust_reasons, s.trust_synced_at,
  s.rendered_status, s.rendered_raw, s.rendered_frontmatter, s.rendered_html,
  (SELECT sr.sha FROM skill_revisions sr
    WHERE sr.owner = s.owner AND sr.repo = s.repo AND sr.name = s.name
    ORDER BY sr.modified_at DESC LIMIT 1) AS latest_revision_sha,
  ${SKILL_TRENDING_AWARDS_SQL}`

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
  /**
   * The sync's verdict on whether the SKILL.md is still present upstream. Zero
   * means it is gone, which the cached render cannot tell you: a removed skill
   * keeps rendering perfectly from `rendered_raw` forever.
   */
  source_resolved: number | null
  current_sha: string | null
  modified_at: number | null
  references_count: number | null
  assets: string | null
  last_synced_at: number | null
  sync_status: string | null
  // seo / trust
  seo_index_score: number | null
  seo_indexable: number | null
  trending_admitted: number | null
  probe_exception: number | null
  admissions_populated: number | null
  repo_kind: string | null
  trending_awards: string | null
  seo_index_reasons: string | null
  seo_index_synced_at: number | null
  curator_count: number | null
  curator_reason_count: number | null
  like_count: number | null
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
  // shared Skill select
  repo_skill_count: number
  author_name: string | null
  latest_revision_sha: string | null
}

interface RepoSkillNameRow {
  name: string
}

const skillDetailHandler = defineApiHandler({
  response: SkillDetailResponseSchema,
  handler: async ({ event, platform }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    return cached({
      storage: useStorage('edge-cache'),
      key: `skills:detail:v3:${slug.toLowerCase()}`,
      ttlSeconds: DETAIL_CACHE_TTL,
      staleSeconds: DETAIL_CACHE_STALE_TTL,
      compute: () => loadSkillDetail(event, platform, slug),
      schedule: promise => runAfterResponse(event, promise),
    })
  },
})

function indexableWithFallbackNote(row: Parameters<typeof isSkillIndexable>[0]): boolean {
  if (row.admissions_populated !== 1)
    noteAdmissionFallback()
  return isSkillIndexable(row)
}

async function loadSkillDetail(event: H3Event, platform: Platform, slug: string): Promise<SkillDetailPayload> {
  const found = await findSkillWithRow<SkillDetailRow>(event, slug, DETAIL_COLUMNS_SQL)
  if (!found)
    throw createError({ statusCode: 404, message: 'Skill not found' })
  const { skill, row } = found
  const curators: CuratorEndorsement[] = []

  const [duplicateGroup, generated, repoSkillRows] = await Promise.all([
    findDuplicateGroupForSkill(event, `${skill.owner}/${skill.repo}/${skill.name}`),
    getGeneratedKinds(platform.db, { owner: skill.owner, repo: skill.repo, name: skill.name }, ['faq', 'tags', 'summary']),
    // Dependency links must only target Skills whose source still exists.
    platform.db
      .prepare(`SELECT name FROM skills WHERE owner = ? AND repo = ? AND source_resolved = 1 ORDER BY name`)
      .bind(skill.owner, skill.repo)
      .all<RepoSkillNameRow>(),
  ])
  const faqRow = generated.get('faq') as { payload: FaqPayload } | undefined
  const tagRow = generated.get('tags') as { payload: TagPayload } | undefined
  const summaryRow = generated.get('summary') as { payload: SummaryPayload } | undefined

  const source = resolveRepoSourceIdentityFromRow(skill, row)
  const githubUrl = `https://github.com/${source.owner}/${source.repo}`
  const branch = row.default_branch || 'main'
  const repoSkillNames = (repoSkillRows.results ?? []).map(candidate => candidate.name)

  // Warm path: render is in D1. Cold path (no usable stored render): render
  // live so the page still has content. A page view never writes the render
  // back: the repo sync re-renders a Skill whenever its SKILL.md changes, and
  // `reconcile-rendered` repairs rows with no usable render. A per-view write
  // cost 557 D1 writes in two minutes of one crawler burst on 2026-09-29.
  let rendered: RenderedView
  if (row.rendered_html && row.rendered_status === 'ok') {
    const reparsed = row.rendered_raw
      ? await parseSkillMd(row.rendered_raw, {
          owner: source.owner,
          repo: source.repo,
          name: skill.name,
          branch,
          skillDir: row.rendered_skill_path?.replace(/\/SKILL\.md$/, '') ?? '',
          filePath: '',
          skillNames: repoSkillNames,
          registryOwner: skill.owner,
          registryRepo: skill.repo,
          sourceGone: row.source_resolved === 0,
        }, await skillImagePolicyForEvent(event))
      : null
    rendered = {
      skillPath: row.rendered_skill_path,
      raw: row.rendered_raw,
      frontmatter: reparsed?.frontmatter ?? parseFrontmatterJson(row.rendered_frontmatter),
      body: reparsed?.body ?? stripFrontmatter(row.rendered_raw ?? ''),
      html: reparsed?.html ?? row.rendered_html,
      dependencies: reparsed?.dependencies ?? [],
      status: 'ok',
    }
  }
  else if (row.source_resolved === 0) {
    // The sync says the SKILL.md is gone upstream, so a live render can only
    // fail. Skills with no stored render were all in this state on 2026-09-30,
    // and each page view cost up to seven failed GitHub reads (about 1,750).
    rendered = { skillPath: null, raw: null, frontmatter: null, body: null, html: null, dependencies: [], status: 'path_missing' }
  }
  else {
    rendered = await renderLive(event, {
      sourceOwner: source.owner,
      sourceRepo: source.repo,
      registryOwner: skill.owner,
      registryRepo: skill.repo,
      name: skill.name,
      branch,
      skillNames: repoSkillNames,
    })
  }

  const rawAiTags = tagRow?.payload.tags ?? []
  const tags = rawAiTags
    .map(s => TAG_BY_SLUG.get(s))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map(t => ({ ...t, path: tagLinkPath(t.slug) }))
  const knownTagSlugs = new Set(tags.map(t => t.slug))
  const keywords = rawAiTags.filter(t => !knownTagSlugs.has(t))

  const description = frontmatterString(rendered.frontmatter, 'description') ?? skill.description ?? null
  const license = frontmatterString(rendered.frontmatter, 'license')
  let assets: { path: string, size: number, type: string }[] = []
  if (row.assets) {
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
  const behaviors = skillPageBehaviors({
    raw: rendered.raw,
    assetPaths: assets.map(asset => asset.path),
    source: { owner: source.owner, repo: source.repo, branch, skillPath: rendered.skillPath },
  })
  const selectedAssets = selectSkillFiles(assets)
  // `rendered.*` describes the cached copy, which survives the file being
  // deleted upstream, so it can only ever say "we can still render this". The
  // stored `source_resolved` is the sync's verdict on whether the file is
  // still there. Reading only the former reported `resolved: true` for skills
  // whose SKILL.md upstream had been 404 for months.
  const sourceResolved = isSourceResolved({
    sourceResolved: row.source_resolved,
    renderStatus: rendered.status,
    skillPath: rendered.skillPath,
    raw: rendered.raw,
  })
  const sourceGone = !sourceResolved && row.source_resolved === 0
  // `current_sha` is the blob sha of SKILL.md, not a commit, so it cannot pin a link.
  const sourceCommitSha = row.latest_revision_sha ?? null
  const pushedAtIso = epochToIso(row.pushed_at)
  const createdAtIso = epochToIso(row.repo_created_at)
  const repoSkillCount = row.repo_skill_count ?? 0

  const detail = {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    registryPath: canonicalRepoSkillPath({
      owner: skill.owner,
      repo: skill.repo,
      name: skill.name,
      repoSkillCount,
    }),
    displayName: skill.displayName,
    authorName: row.author_name ?? null,
    githubUrl,
    skillPath: rendered.skillPath,
    branch,
    resolutionStatus: rendered.status,
    sourceGone,
    contentHtml: rendered.html,
    dependencies: rendered.dependencies,
    frontmatter: rendered.frontmatter,
    raw: rendered.raw,
    assets: selectedAssets.files,
    assetCount: selectedAssets.total,
    curators,
    description,
    license,
    stars: row.stars ?? 0,
    forks: row.forks ?? 0,
    pushedAt: pushedAtIso,
    createdAt: createdAtIso,
    maturity: computeMaturity(row.repo_created_at ?? null, row.pushed_at ?? null),
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
        stars: row.stars ?? 0,
        forks: row.forks ?? 0,
        defaultBranch: branch,
      },
      source: {
        resolved: sourceResolved,
        gone: sourceGone,
        resolutionStatus: rendered.status,
        skillPath: rendered.skillPath,
        currentSha: row.current_sha ?? null,
        hasCurrentSha: Boolean(row.current_sha),
        latestRevisionSha: row.latest_revision_sha,
        modifiedAt: row.modified_at ?? null,
        modifiedAgeDays: daysFromSecondsAgo(secondsAgo(row.modified_at)),
        referencesCount: row.references_count ?? 0,
        lastSyncedAt: row.last_synced_at ?? null,
        lastSyncedAgeDays: daysFromSecondsAgo(secondsAgo(row.last_synced_at)),
        syncStatus: row.sync_status ?? null,
      },
      frontmatter: {
        present: Boolean(rendered.frontmatter && Object.keys(rendered.frontmatter).length),
        keys: rendered.frontmatter ? Object.keys(rendered.frontmatter).sort() : [],
        model: frontmatterString(rendered.frontmatter, 'model'),
        allowedTools,
        capabilityScopes: capability.scopes,
        mcpServers: capability.mcpServers,
      },
      behaviors,
    },
    tags,
    keywords,
    // Deliberately top-level, not under `seo`: likes are displayed and back
    // ?sort=likes, but never feed indexability or trust (ADR-0003).
    likeCount: row.like_count ?? 0,
    // Best rank first. Display only, like likes: never trust or indexability (ADR-0011).
    trendingAwards: parseSkillTrendingAwards(row.trending_awards),
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
      skillFileUrl: githubSkillFileUrl({
        owner: source.owner,
        repo: source.repo,
        skillPath: rendered.skillPath,
        branch,
      }),
      historyUrl: rendered.skillPath
        ? `${githubUrl}/commits/${branch}/${rendered.skillPath}`
        : null,
      modifiedAt: row.modified_at ?? null,
      referencesCount: row.references_count ?? 0,
      lastSyncedAt: row.last_synced_at ?? null,
      syncStatus: row.sync_status ?? null,
    },
    seo: {
      indexScore: row.seo_index_score ?? 0,
      indexable: indexableWithFallbackNote(row),
      reasons: row.seo_index_reasons ? JSON.parse(row.seo_index_reasons) as string[] : [],
      syncedAt: row.seo_index_synced_at ?? null,
      curatorCount: row.curator_count ?? 0,
      curatorReasonCount: row.curator_reason_count ?? 0,
      approvedSocialCount: row.approved_social_count ?? 0,
      authorSocialCount: row.author_social_count ?? 0,
    },
    trust: {
      tier: row.trust_tier ?? 'untrusted',
      source: row.trust_source ?? 'computed',
      score: row.trust_score ?? 0,
      reasons: row.trust_reasons ? JSON.parse(row.trust_reasons) as string[] : [],
      syncedAt: row.trust_synced_at ?? null,
    },
    duplicateGroup,
  }

  return detail
}

// Skill detail data is public and changes only when indexing or social counts
// update. A read-through cache keeps popular links from repeating every D1
// lookup and Markdown render for each reader. `cached` restores what Nitro's
// route cache used to provide here (maxAge 60, staleMaxAge 300, swr) without
// the bare `storage.setItem` that let a KV `KV PUT failed: 429` escape the
// handler as a 500 (Sentry SKILLD-1V): a fresh entry is served as-is, a stale
// entry is served while one background refresh recomputes, and a dead entry
// recomputes once per key per isolate. Without that stale shield every
// concurrent miss after the 60s TTL re-runs three D1 queries plus a
// possible live GitHub render, and cold-key bursts are the documented D1
// overload mechanism on these routes (Sentry SKILLD-G/H/J/K/M/N/P/Q).
export default skillDetailHandler

interface RenderedView {
  skillPath: string | null
  raw: string | null
  frontmatter: Record<string, unknown> | null
  body: string | null
  html: string | null
  dependencies: string[]
  status: 'ok' | 'path_missing' | 'fetch_failed'
}

interface RenderLiveOptions {
  sourceOwner: string
  sourceRepo: string
  registryOwner: string
  registryRepo: string
  name: string
  branch: string
  skillNames: string[]
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

/** The most a cold live render waits on GitHub, across every read it makes. */
const LIVE_RENDER_BUDGET_MS = 8_000

// Live render fallback for rows that pre-date the rendered_* columns or had
// a previous fetch_failed. Tries the common layouts via raw.githubusercontent
// first (cheap, no API quota), then falls back to the authenticated GitHub
// trees API for repos that nest SKILL.md under arbitrary directories
// (e.g. Claude plugin repos mirroring under `.claude/skills/<name>/SKILL.md`).
async function renderLive(
  event: H3Event,
  options: RenderLiveOptions,
): Promise<RenderedView> {
  const { sourceOwner, sourceRepo, registryOwner, registryRepo, name, branch, skillNames } = options
  const candidates = [
    `skills/${name}/SKILL.md`,
    `${name}/SKILL.md`,
    `.claude/skills/${name}/SKILL.md`,
    `.agents/skills/${name}/SKILL.md`,
    `plugin/skills/${name}/SKILL.md`,
  ]
  // One budget for the whole render. Seven sequential reads at the per read
  // timeout would still hold a request for tens of seconds while GitHub is
  // down (2026-09-30). When the budget is spent, or a read failed for a
  // reason other than "not there", the page answers `fetch_failed` so it does
  // not claim the SKILL.md was deleted.
  const deadline = Date.now() + LIVE_RENDER_BUDGET_MS
  const remainingMs = () => deadline - Date.now()
  let upstreamFailed = false
  const readRaw = async (path: string, operation: string): Promise<string | null> => {
    if (remainingMs() <= 0) {
      upstreamFailed = true
      return null
    }
    const raw = await fetchUpstreamText(
      `https://raw.githubusercontent.com/${sourceOwner}/${sourceRepo}/${branch}/${path}`,
      { maxAttempts: 1, timeoutMs: Math.min(GITHUB_PAGE_READ_TIMEOUT_MS, remainingMs()) },
    )
    if (raw._tag === 'ok')
      return raw.body || null
    if (raw._tag === 'unavailable') {
      upstreamFailed = true
      emitOperationalEvent(createWideEvent({ 'operation': operation, 'outcome': 'failed', 'upstream.status': raw.status ?? 0 }))
    }
    return null
  }
  for (const path of candidates) {
    const raw = await readRaw(path, 'skill-detail-candidate-fetch')
    if (raw) {
      const skillDir = path.replace(/\/SKILL\.md$/, '')
      const parsed = await parseSkillMd(raw, {
        owner: sourceOwner,
        repo: sourceRepo,
        name,
        branch,
        skillDir,
        filePath: '',
        skillNames,
        registryOwner,
        registryRepo,
      }, await skillImagePolicyForEvent(event))
      return {
        skillPath: path,
        raw,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        html: parsed.html,
        dependencies: parsed.dependencies,
        status: 'ok',
      }
    }
  }

  // Authenticated GitHub trees API (matches sync-repo.ts). Recursive listing
  // surfaces nested or dotfile-mirrored layouts the candidates above miss.
  const bindings = resolveGithubBindings(event.context.platform?.env)
  const treeRes = remainingMs() <= 0
    ? null
    : await getTree(sourceOwner, sourceRepo, branch, bindings, { timeoutMs: Math.min(GITHUB_PAGE_READ_TIMEOUT_MS, remainingMs()) }).catch((error: unknown) => {
        emitOperationalEvent(createWideEvent({ operation: 'skill-detail-tree-fetch', outcome: 'failed', reason: error instanceof Error ? error.message : String(error) }))
        return null
      })
  // No answer at all, or an answer that says GitHub is unwell, is not "the
  // SKILL.md is missing". Only a 404 or a real tree is a verdict.
  if (!treeRes || (!treeRes.data && treeRes.status !== 404))
    upstreamFailed = true
  // A root `SKILL.md` is a skill named after its repository, so it has no
  // `/<name>/` segment to match on and would fall through to no content.
  const match = treeRes?.data?.tree.find(
    e => e.type === 'blob'
      && (e.path.endsWith(`/${name}/SKILL.md`) || (e.path === 'SKILL.md' && name === sourceRepo)),
  )
  if (match) {
    const raw = await readRaw(match.path, 'skill-detail-matched-fetch')
    if (raw) {
      const skillDir = match.path.replace(/\/SKILL\.md$/, '')
      const parsed = await parseSkillMd(raw, {
        owner: sourceOwner,
        repo: sourceRepo,
        name,
        branch,
        skillDir,
        filePath: '',
        skillNames,
        registryOwner,
        registryRepo,
      }, await skillImagePolicyForEvent(event))
      return {
        skillPath: match.path,
        raw,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        html: parsed.html,
        dependencies: parsed.dependencies,
        status: 'ok',
      }
    }
  }

  return {
    skillPath: null,
    raw: null,
    frontmatter: null,
    body: null,
    html: null,
    dependencies: [],
    status: upstreamFailed ? 'fetch_failed' : 'path_missing',
  }
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
