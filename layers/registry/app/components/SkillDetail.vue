<script setup lang="ts">
import type { SkillAudit } from '~~/app/utils/skill-audit-overview'
import { formatTimeAgo } from '@vueuse/core'
import { resolveSkillAuditOverview } from '~~/app/utils/skill-audit-overview'
import { skillBadgeImagePath, skillBadgeMarkdown } from '~~/shared/skill-badge'
import { partitionMetadataEntries } from '../utils/skill-metadata'
import { resolveSkillRawUrl } from '../utils/skill-raw-url'
import { resolveSkillTitle } from '../utils/skill-title'
import SkillCommandPanel from './_SkillCommandPanel.vue'
import SkillReceiptsPanel from './_SkillReceiptsPanel.vue'

const props = defineProps<{
  owner: string
  repo: string
  name: string
}>()

const owner = computed(() => props.owner)
const repo = computed(() => props.repo)
const name = computed(() => props.name)
const slug = computed(() => `${owner.value}/${repo.value}/${name.value}`)

interface RelatedSkill {
  name: string
  owner: string
  repo: string
  displayName: string
  description: string | null
  slug: string
}

interface SkillCommit {
  sha: string
  shortSha: string
  message: string
  authorName: string
  authorAvatar: string | null
  date: string
  url: string
  verified: boolean
  verifiedReason: string
}

interface SkillTag {
  slug: string
  label: string
  description: string
}

interface FaqItem {
  question: string
  answer: string
}

interface SkillSummary {
  text: string
}

interface SourceFacts {
  description: {
    present: boolean
    length: number
    source: 'repository' | 'frontmatter' | null
  }
  repository: {
    pushedAt: string | null
    pushedAgeDays: number | null
    createdAt: string | null
    stars: number
    forks: number
    defaultBranch: string
  }
  source: {
    resolved: boolean
    /** The sync found the SKILL.md gone upstream, whatever the cached render says. */
    gone: boolean
    resolutionStatus: 'ok' | 'path_missing' | 'fetch_failed'
    skillPath: string | null
    currentSha: string | null
    hasCurrentSha: boolean
    latestRevisionSha: string | null
    modifiedAt: number | null
    modifiedAgeDays: number | null
    referencesCount: number
    lastSyncedAt: number | null
    lastSyncedAgeDays: number | null
    syncStatus: string | null
  }
  frontmatter: {
    present: boolean
    keys: string[]
    model: string | null
    allowedTools: string[]
    capabilityScopes: ('read' | 'write' | 'exec' | 'net')[]
    mcpServers: string[]
  }
}

interface NeighborSkill {
  name: string
  owner: string
  repo: string
  slug: string
  displayName: string
  description: string | null
  score: number
}

interface DuplicateSkill {
  name: string
  owner: string
  repo: string
  displayName: string
  stars: number
  slug: string
  supportTier: string | null
  trustTier: string | null
  registryPath: string
}

interface LiveSkill {
  audits: SkillAudit[]
  fetchedAt: string
}

const skillFetch = useFetch(
  () => `/api/skills/${slug.value}`,
  {
    watch: [slug],
    immediate: true,
  },
) as ReturnType<typeof useFetch<{
  contentHtml: string | null
  frontmatter: Record<string, unknown> | null
  raw: string | null
  assets: { path: string, size: number, type: 'markdown' | 'code' | 'image' | 'data' | 'other' }[]
  assetCount: number
  curators: { did: string, handle: string, displayName?: string, avatar?: string, collectionName: string, collectionSlug: string, reason?: string }[]
  url: string
  repo: string
  owner: string
  name: string
  registryPath: string
  displayName: string
  githubUrl: string
  description: string | null
  license: string | null
  stars: number
  forks: number
  pushedAt: string | null
  createdAt: string | null
  maturity: { ageDays: number, sinceUpdateDays: number, cadence: 'active' | 'steady' | 'dormant' } | null
  branch: string
  skillPath: string | null
  resolutionStatus: 'ok' | 'path_missing' | 'fetch_failed'
  /**
   * The SKILL.md no longer exists upstream. Independent of `resolutionStatus`,
   * which only describes the cached render and stays `ok` indefinitely after
   * the file is deleted.
   */
  sourceGone: boolean
  tier: 'official-org' | 'official-user' | 'community'
  sourceFacts: SourceFacts
  tags: SkillTag[]
  keywords: string[]
  likeCount: number
  faqs: FaqItem[]
  summary: SkillSummary | null
  dependencies: string[]
  provenance: {
    owner: string
    repo: string
    branch: string
    skillPath: string | null
    sourceCommitSha: string | null
    sourceCommitUrl: string | null
    skillFileUrl: string | null
    historyUrl: string | null
    modifiedAt: number | null
    referencesCount: number
    lastSyncedAt: number | null
    syncStatus: string | null
  } | null
  seo: {
    indexScore: number
    indexable: boolean
    reasons: string[]
    syncedAt: number | null
    curatorCount: number
    curatorReasonCount: number
    approvedSocialCount: number
    authorSocialCount: number
  }
  trust: {
    tier: string
    source: string
    score: number
    reasons: string[]
    syncedAt: number | null
  }
  duplicateGroup: {
    reason: 'duplicate_content'
    canonical: DuplicateSkill
    isCanonical: boolean
    siblings: DuplicateSkill[]
  } | null
}>>

const relatedFetch = useFetch(
  () => `/api/skill-related/${slug.value}`,
  { watch: [slug], immediate: true },
) as ReturnType<typeof useFetch<{
  commits: SkillCommit[]
  relatedRepoSkills: RelatedSkill[]
  relatedOwnerSkills: RelatedSkill[]
  coOccurrenceSkills: NeighborSkill[]
  semanticSiblings: NeighborSkill[]
}>>

const liveSkillFetch = useAsyncData<LiveSkill | null>(
  () => `skill-live:${slug.value}`,
  () => $fetch<LiveSkill>(`/api/skill-live/${slug.value}`),
  {
    watch: [slug],
    default: () => null,
  },
)

// Keep complete SSR for search and link previews. Client navigation renders
// the loading state immediately while these independent requests run together.
if (import.meta.server)
  await Promise.all([skillFetch, relatedFetch, liveSkillFetch])

const { data, status, error, refresh } = skillFetch
const { data: relatedData } = relatedFetch
const { data: liveSkill } = liveSkillFetch

const legacySkillPath = computed(() => repoSkillPath(owner.value, repo.value, name.value))
if (import.meta.server && data.value?.registryPath === repoHubPath(owner.value, repo.value) && useRoute().path === legacySkillPath.value)
  await navigateTo(repoHubPath(owner.value, repo.value), { redirectCode: 301, replace: true })

watch(data, async (skill) => {
  if (import.meta.client && skill?.registryPath === repoHubPath(owner.value, repo.value) && useRoute().path === legacySkillPath.value)
    await navigateTo(repoHubPath(owner.value, repo.value), { replace: true })
}, { immediate: true })

// A skill whose SKILL.md was deleted upstream still renders perfectly from the
// cached copy, so nothing on the page told the reader it was gone. `sourceGone`
// is the sync's verdict and is reported ahead of the render status, which only
// ever describes the cache.
const sourceUnavailableTitle = computed(() => {
  if (data.value?.sourceGone)
    return 'Removed from the source repository'
  return data.value?.resolutionStatus === 'path_missing'
    ? 'SKILL.md not found in source repository'
    : 'Could not load SKILL.md'
})

const sourceUnavailableDetail = computed(() => data.value?.sourceGone
  ? 'This skill no longer exists upstream, so running or installing it will fail. What you see below is the last copy skilld indexed.'
  : 'The source file moved or was removed. Browse the repository to find its current location.')

const { data: skillFiles } = useFetch(
  () => `/api/skill-files/${slug.value}`,
  { watch: [slug], lazy: true, server: false, immediate: true, default: () => null },
) as ReturnType<typeof useFetch<{
  skillPath: string | null
  branch: string
  files: { path: string, size: number, type: 'markdown' | 'code' | 'image' | 'data' | 'other' }[]
  total: number
} | null>>

// Prefer the live ungh-walked file list when available (catches markdown
// siblings the sync job hasn't registered yet); fall back to data.assets.
const treeAssets = computed(() => {
  const live = skillFiles.value?.files
  if (live && live.length)
    return live
  return data.value?.assets ?? []
})
const treeAssetCount = computed(() => skillFiles.value?.total ?? data.value?.assetCount ?? treeAssets.value.length)

const audits = computed<SkillAudit[]>(() => liveSkill.value?.audits ?? [])
const auditOverview = computed(() => resolveSkillAuditOverview(audits.value))

const AUDIT_TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
} as const

const { copy: copyMarkdown, copied: markdownCopied } = useClipboard()

// An agent with no terminal cannot run a command, so it needs the raw URL.
const { copy: copyDocUrl, copied: docUrlCopied } = useClipboard({ legacy: true })

const { copy: copyBadge, copied: badgeCopied } = useClipboard()
const { copy: copyBadgeWithLikes, copied: badgeWithLikesCopied } = useClipboard()

const badgeInput = computed(() => data.value
  ? {
      owner: data.value.owner,
      repo: data.value.repo,
      name: data.value.name,
      registryPath: data.value.registryPath,
    }
  : null)

const badgeImageUrl = computed(() => badgeInput.value
  ? skillBadgeImagePath(badgeInput.value)
  : '')
const badgeMarkdown = computed(() => badgeInput.value ? skillBadgeMarkdown(badgeInput.value) : '')
const badgeWithLikesMarkdown = computed(() => badgeInput.value
  ? skillBadgeMarkdown({ ...badgeInput.value, showLikes: true })
  : '')

function copySkillBadgeMarkdown(showLikes = false) {
  if (showLikes) {
    void copyBadgeWithLikes(badgeWithLikesMarkdown.value)
    return
  }
  void copyBadge(badgeMarkdown.value)
}

// Running is the default: the agent reads the skill now and nothing lands in
// the repository. Installing is the opt-in for a skill you want every session.
const runCmd = computed(() => {
  if (!data.value)
    return ''
  return skillRunCmd(data.value.owner, data.value.repo, data.value.name)
})

const runPrompt = computed(() => skillRunPrompt(runCmd.value))

const installCmd = computed(() => {
  if (!data.value)
    return ''
  return skillInstallCmd(data.value.owner, data.value.repo, data.value.name)
})

const commandMode = ref<'run' | 'install'>('run')
const commandCopyError = ref('')

const { copy, copied } = useInstallCopy(
  runPrompt,
  'skill-page-hero',
  'run',
  () => ({ kind: 'skill', owner: data.value?.owner ?? '', name: data.value?.name ?? '' }),
)

const { copy: copyInstall, copied: installCopied } = useInstallCopy(
  installCmd,
  'skill-page-install',
  'install',
  () => ({ kind: 'skill', owner: data.value?.owner ?? '', name: data.value?.name ?? '' }),
)

async function copySkillCommand(mode: 'run' | 'install') {
  commandCopyError.value = ''
  const text = mode === 'run' ? runPrompt.value : installCmd.value
  const result = await (mode === 'run' ? copy(text) : copyInstall(text))
  if (result._tag === 'error' && commandMode.value === mode)
    commandCopyError.value = result.message
}

watch(commandMode, () => {
  commandCopyError.value = ''
})

// Pristine SKILL.md over HTTP, so an agent can read the skill without installing.
const docUrl = computed(() => data.value
  ? skillDocUrl(data.value.owner, data.value.repo, data.value.name)
  : '')

function copySkillDocUrl() {
  void copyDocUrl(docUrl.value)
}

const githubUrl = computed(() => data.value?.githubUrl ?? '')
const skillFileUrl = computed(() => data.value?.provenance?.skillFileUrl ?? '')

const HIDDEN_FRONTMATTER_KEYS = new Set(['name', 'description', 'license'])

const allowedTools = computed(() => {
  return data.value?.sourceFacts.frontmatter.allowedTools ?? []
})

// SSR and client may use different locales/12h-vs-24h formats, which trips
// hydration mismatch warnings on `:title` attributes. Pin to a stable
// locale + ISO-like time so server and client always agree.
const DATETIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
  timeZoneName: 'short',
})
function formatDateTitle(value: Date | string | number | null | undefined): string {
  if (!value)
    return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : DATETIME_FORMAT.format(d)
}

function formatFrontmatterValue(v: unknown): string {
  if (v === null || v === undefined)
    return ''
  if (typeof v === 'string')
    return v
  return JSON.stringify(v, null, 2)
}

function isComplexValue(v: unknown): boolean {
  return typeof v === 'object' && v !== null
}

const frontmatterEntries = computed(() => {
  const fm = data.value?.frontmatter
  if (!fm)
    return { visible: [], other: [] }
  const entries = Object.entries(fm)
    .filter(([k, v]) => !HIDDEN_FRONTMATTER_KEYS.has(k.toLowerCase()) && k !== 'allowed-tools' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({ key: k, value: formatFrontmatterValue(v), complex: isComplexValue(v) }))
  return partitionMetadataEntries(entries)
})

const pushedAtDate = computed(() => new Date(data.value?.pushedAt || 0))
const pushedAtAgo = useTimeAgo(pushedAtDate)
const maturity = computed(() => data.value?.maturity ?? null)

const verifiedSummary = computed<{ verified: number, total: number } | null>(() => {
  const list = relatedData.value?.commits ?? []
  if (!list.length)
    return null
  return { verified: list.filter(c => c.verified).length, total: list.length }
})

const capabilitySummary = computed<{ scopes: ('read' | 'write' | 'exec' | 'net')[], mcp: string[] } | null>(() => {
  const facts = data.value?.sourceFacts.frontmatter
  if (!facts?.allowedTools.length)
    return null
  return { scopes: facts.capabilityScopes, mcp: facts.mcpServers }
})

const SCOPE_META: Record<'read' | 'write' | 'exec' | 'net', { icon: string, label: string, hint: string }> = {
  read: { icon: 'i-lucide-eye', label: 'Reads files', hint: 'Can read files and search the codebase' },
  write: { icon: 'i-lucide-pencil', label: 'Edits files', hint: 'Can create or modify files' },
  exec: { icon: 'i-lucide-terminal', label: 'Runs commands', hint: 'Can execute shell commands via Bash' },
  net: { icon: 'i-lucide-globe', label: 'Network', hint: 'Can make web requests' },
}

const skillModel = computed(() => {
  return data.value?.sourceFacts.frontmatter.model ?? null
})

const contentView = ref<'preview' | 'markdown'>('preview')
const rawHtml = ref<string | null>(null)
// Set when the file's language has no bundled grammar; rendered as plain text
// so an unsupported extension doesn't leave the viewer stuck on the skeleton.
const rawPlain = ref<string | null>(null)
const rawError = ref<string | null>(null)

import { highlightLangFromPath } from '../utils/skill-file-tree'

// Path of the doc currently active in the viewer, relative to the skill folder.
// Empty string === SKILL.md. Used to highlight the file tree.
const activeDocPath = ref<string>('')
// Sub-doc state. When the user navigates to a non-root markdown file via the
// file tree, we store its server-rendered HTML + raw source here. Null means
// "show the root SKILL.md" (data.value.contentHtml / data.value.raw).
const subDocHtml = ref<string | null>(null)
const subDocRaw = ref<string | null>(null)
const currentDocLabel = computed(() => activeDocPath.value || 'SKILL.md')
const currentRaw = computed(() => subDocRaw.value ?? data.value?.raw ?? null)
const rawSourceUrl = computed(() => resolveSkillRawUrl({
  rootUrl: `/api/skills-raw/${slug.value}`,
  skillFileUrl: skillFileUrl.value || null,
  activeDocPath: activeDocPath.value,
}))
// Same `marked` pipeline as SSR (skill-md-render.ts) on both sides, so the
// initial paint matches `data.contentHtml` byte-for-byte — no hydration swap.
const currentContentHtml = computed(() => subDocHtml.value ?? data.value?.contentHtml ?? null)
// Surfaced when a sub-doc fetch fails so the user gets feedback instead of a
// silent no-op. Cleared on every successful navigation and on raw refresh.
const docLoadError = ref<{ path: string, message: string } | null>(null)
// True while a tree click is fetching a sub-doc; drives the skeleton overlay
// so the user doesn't stare at the previous doc.
const docLoading = ref<string | null>(null)

// Reset sub-doc state whenever the loaded skill changes so navigating between
// skills always lands on the root SKILL.md.
watch(
  () => data.value,
  () => {
    activeDocPath.value = ''
    subDocHtml.value = null
    subDocRaw.value = null
    docLoadError.value = null
  },
)

// Programmatic open from the file tree. Markdown sub-docs reuse the server's
// `marked` render via /api/skill-asset so every previewed document goes
// through the same renderer as the SSR'd root SKILL.md.
async function resolveAndOpen(path: string) {
  if (!data.value)
    return
  docLoadError.value = null
  const targetLabel = !path || path === 'SKILL.md' ? 'SKILL.md' : path
  docLoading.value = targetLabel
  try {
    if (!path || path === 'SKILL.md') {
      activeDocPath.value = ''
      subDocHtml.value = null
      subDocRaw.value = null
      return
    }
    const asset = await $fetch<{ status: 'ok', raw: string, html: string | null, type: 'markdown' | 'code' | 'image' | 'data' | 'other' }>(
      `/api/skill-asset/${data.value.owner}/${data.value.repo}/${data.value.name}/${path}`,
    ).catch((err: unknown) => {
      const message = (err as { statusMessage?: string })?.statusMessage
        ?? (err instanceof Error ? err.message : 'Network error')
      docLoadError.value = { path, message }
      return null
    })
    if (!asset?.raw)
      return
    activeDocPath.value = path
    subDocRaw.value = asset.raw
    const isMd = path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.markdown')
    subDocHtml.value = isMd ? asset.html : null
  }
  finally {
    docLoading.value = null
  }
}

function resolveRelativePath(baseDir: string, href: string): string | null {
  let target = href.replace(/^\.\//, '')
  if (target.startsWith('/')) {
    target = target.slice(1)
    return target.includes('..') ? null : target
  }
  const segments = baseDir ? baseDir.split('/').filter(Boolean) : []
  for (const part of target.split('/')) {
    if (part === '..') {
      if (!segments.length)
        return null
      segments.pop()
    }
    else if (part && part !== '.') {
      segments.push(part)
    }
  }
  return segments.join('/')
}

// Intercept clicks on relative `.md` links inside the rendered preview so we
// can swap the doc in place instead of leaving the page.
function onPreviewClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return
  const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor)
    return
  const href = anchor.getAttribute('href') ?? ''
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:\/\//i.test(href))
    return
  const cleanHref = href.split('#')[0]?.split('?')[0] ?? ''
  if (!cleanHref.toLowerCase().endsWith('.md') && !cleanHref.toLowerCase().endsWith('.markdown'))
    return
  const baseDir = activeDocPath.value.includes('/')
    ? activeDocPath.value.slice(0, activeDocPath.value.lastIndexOf('/'))
    : ''
  const resolved = resolveRelativePath(baseDir, cleanHref)
  if (!resolved)
    return
  e.preventDefault()
  void resolveAndOpen(resolved)
}

async function renderRaw(raw: string) {
  rawError.value = null
  rawPlain.value = null
  try {
    const lang = activeDocPath.value ? highlightLangFromPath(activeDocPath.value) : 'markdown'
    const { highlightToHtml } = await import('#shared/highlight')
    const html = highlightToHtml(raw, lang)
    if (html)
      rawHtml.value = html
    else
      rawPlain.value = raw
  }
  catch (err) {
    rawError.value = err instanceof Error ? err.message : 'Failed to render markdown'
  }
}

watch([contentView, currentRaw], ([view, raw], [, prevRaw]) => {
  if (raw !== prevRaw) {
    rawHtml.value = null
    rawPlain.value = null
    rawError.value = null
  }
  if (!import.meta.client || view !== 'markdown' || !raw || rawHtml.value || rawPlain.value)
    return
  renderRaw(raw)
})

const isNonMarkdownDoc = computed(() => {
  const p = activeDocPath.value
  if (!p)
    return false
  const lower = p.toLowerCase()
  return !lower.endsWith('.md') && !lower.endsWith('.markdown')
})

const contentTabs = computed(() => {
  if (isNonMarkdownDoc.value)
    return [{ label: 'Raw', value: 'markdown', icon: 'i-lucide-file-text' }]
  return [
    { label: 'Preview', value: 'preview', icon: 'i-lucide-eye' },
    { label: 'Raw', value: 'markdown', icon: 'i-lucide-file-text' },
  ]
})

// Non-md files have no Preview tab — pin to Raw whenever the active doc is
// not markdown, and snap back to Preview when returning to a markdown doc.
watch(isNonMarkdownDoc, (nonMd) => {
  contentView.value = nonMd ? 'markdown' : 'preview'
})

const relatedTab = ref<string>('similar')

const relatedTabsAvailable = computed<{ label: string, value: string, items: NeighborSkill[] | RelatedSkill[] }[]>(() => {
  const tabs: { label: string, value: string, items: NeighborSkill[] | RelatedSkill[] }[] = []
  const repoItems = relatedData.value?.relatedRepoSkills ?? []
  const paired = relatedData.value?.coOccurrenceSkills ?? []
  const similar = relatedData.value?.semanticSiblings ?? []
  const ownerItems = relatedData.value?.relatedOwnerSkills ?? []
  if (similar.length)
    tabs.push({ label: 'Similar', value: 'similar', items: similar })
  if (paired.length)
    tabs.push({ label: 'Paired with', value: 'paired', items: paired })
  if (repoItems.length)
    tabs.push({ label: `From ${data.value?.owner ?? ''}/${data.value?.repo ?? ''}`, value: 'repo', items: repoItems })
  if (ownerItems.length)
    tabs.push({ label: `Other by ${data.value?.owner ?? ''}`, value: 'owner', items: ownerItems })
  return tabs
})

watchEffect(() => {
  const tabs = relatedTabsAvailable.value
  if (tabs.length && !tabs.some(t => t.value === relatedTab.value))
    relatedTab.value = tabs[0]!.value
})

const currentRelatedItems = computed(() => {
  const tab = relatedTabsAvailable.value.find(t => t.value === relatedTab.value)
  return tab?.items ?? []
})

const commitsWithAgo = computed(() => {
  return (relatedData.value?.commits ?? []).map((c) => {
    const d = new Date(c.date)
    // Pure formatter. useTimeAgo here would register a fresh 30s interval per
    // commit on every recompute, outside any owner scope, so none of those
    // intervals would ever be disposed.
    return { ...c, relative: formatTimeAgo(d), absolute: formatDateTitle(d) }
  })
})

const recentCommits = computed(() => commitsWithAgo.value.slice(0, 5))

function truncateReason(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max)
    return collapsed
  return `${collapsed.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

defineOgImage('Skill.takumi', {
  name: () => data.value?.name ?? '',
  displayName: () => data.value?.displayName ?? data.value?.name ?? '',
  owner: () => data.value?.owner ?? '',
  ownerAvatar: () => data.value?.owner ? `https://github.com/${data.value.owner}.png?size=128` : '',
  repo: () => data.value?.repo ?? 'skills',
  curatorCount: () => data.value?.curators.length ?? 0,
  reason: () => data.value?.curators.find(curator => curator.reason)?.reason ?? '',
  reasonHandle: () => data.value?.curators.find(curator => curator.reason)?.handle ?? '',
}, {
  alt: () => `${data.value?.displayName ?? data.value?.name ?? 'Skill'} by ${data.value?.owner ?? ''} on skilld`,
})

const siteOrigin = 'https://skilld.dev'
const skillPagePath = computed(() => data.value?.registryPath ?? '')
const skillPageUrl = computed(() => `${siteOrigin}${skillPagePath.value}`)
const duplicateGroup = computed(() => data.value?.duplicateGroup ?? null)
const isWeakerDuplicate = computed(() => Boolean(duplicateGroup.value && !duplicateGroup.value.isCanonical))
const canonicalSkillPagePath = computed(() => {
  const canonical = duplicateGroup.value?.canonical
  return canonical?.registryPath ?? skillPagePath.value
})
const canonicalSkillPageUrl = computed(() => {
  return `${siteOrigin}${canonicalSkillPagePath.value}`
})

// 2026-08-22: the shared "A Claude Code skill for Cursor, Codex, and other
// agents." suffix is gone. Identical boilerplate across 1,300+ meta
// descriptions was the last scaled-content signature in Google snippets
// (GOOGLE_RECOVERY.md). Provenance stays: "From owner/repo." carries the
// unique part.
function withSeoContext(text: string, owner: string, repo: string, max = 200): string {
  const suffix = ` From ${owner}/${repo}.`
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length + suffix.length <= max)
    return `${collapsed}${suffix}`
  return `${truncateReason(collapsed, Math.max(40, max - suffix.length))}${suffix}`
}

useSchemaOrg(computed(() => {
  if (!data.value)
    return []
  const d = data.value
  const description = withSeoContext(d.description || `${d.name} by ${d.owner}.`, d.owner, d.repo, 240)
  return [
    defineSoftwareApp({
      '@id': `${skillPageUrl.value}#skill`,
      'name': d.name,
      description,
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Any',
      'url': skillPageUrl.value,
      'downloadUrl': d.githubUrl,
      'softwareVersion': d.pushedAt ?? undefined,
      'dateModified': d.pushedAt ?? undefined,
      'datePublished': d.createdAt ?? undefined,
      'author': {
        '@type': 'Person',
        'name': d.owner,
        'url': `https://github.com/${d.owner}`,
      },
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    }),
    defineHowTo({
      '@id': `${skillPageUrl.value}#run`,
      'name': `Run ${d.name} with skilld`,
      'description': `Run the ${d.name} Claude Code skill in Cursor, Codex, and other agents. Installing is the opt-in second step.`,
      'totalTime': 'PT1M',
      'step': [
        {
          '@type': 'HowToStep',
          'name': 'Run the skill',
          'text': runCmd.value,
          'url': `${skillPageUrl.value}#run`,
        },
        {
          '@type': 'HowToStep',
          'name': 'Keep the skill in every session',
          'text': installCmd.value,
          'url': `${skillPageUrl.value}#run`,
        },
      ],
    }),
    ...(d.faqs.length
      ? [{
          '@type': 'FAQPage' as const,
          '@id': `${skillPageUrl.value}#faq`,
          'mainEntity': d.faqs.map(f => ({
            '@type': 'Question',
            'name': f.question,
            'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
          })),
        }]
      : []),
  ]
}))

const skillTitle = computed(() => {
  return resolveSkillTitle(data.value, {
    name: name.value,
    owner: owner.value,
  })
})

const skillDescription = computed(() => {
  if (!data.value)
    return 'View skill details on skilld.'
  const base = data.value.summary?.text
    || data.value.description
    || `${data.value.name} skill by ${data.value.owner}. Run with: ${runCmd.value}`
  return withSeoContext(base, data.value.owner, data.value.repo)
})

useSeoMeta({
  title: () => skillTitle.value,
  description: () => skillDescription.value,
  robots: () => {
    return data.value?.seo.indexable && !isWeakerDuplicate.value ? 'index,follow' : 'noindex,follow'
  },
  ogTitle: () => skillTitle.value,
  ogDescription: () => skillDescription.value,
  twitterTitle: () => skillTitle.value,
  twitterDescription: () => skillDescription.value,
})

useHead(computed(() => ({
  link: [
    {
      rel: 'canonical',
      href: canonicalSkillPageUrl.value,
    },
  ],
})))
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-10 pb-6 md:pt-14"
      :aria-labelledby="data && !error ? 'skill-heading' : undefined"
      :aria-label="!data || error ? 'Skill details' : undefined"
    >
      <NuxtLink
        to="/skills"
        class="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-default transition-colors mb-6"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-3.5"
          aria-hidden="true"
        />
        All skills
      </NuxtLink>

      <div
        v-if="status === 'pending' && !data"
        aria-busy="true"
        class="space-y-3"
      >
        <div class="flex items-start gap-3">
          <USkeleton class="size-12 rounded-md" />
          <div class="min-w-0 flex-1 space-y-2">
            <USkeleton class="h-5 w-2/3" />
            <USkeleton class="h-4 w-1/3" />
          </div>
        </div>
        <USkeleton class="h-4 w-full max-w-md" />
        <USkeleton class="h-4 w-3/4 max-w-md" />
      </div>

      <div
        v-else-if="error || !data"
        class="py-12 text-center"
        role="alert"
      >
        <h1
          id="skill-heading"
          class="sr-only"
        >
          Skill not found
        </h1>
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          {{ error?.statusCode === 404 ? "Couldn't find this skill. It may have been removed or the URL is incorrect." : "Couldn't load this skill. Check your connection and try again." }}
        </p>
        <div class="mt-4 flex items-center justify-center gap-3">
          <UButton
            v-if="error?.statusCode !== 404"
            label="Retry"
            size="sm"
            variant="outline"
            color="neutral"
            @click="refresh()"
          />
          <UButton
            to="/skills"
            label="Browse skills"
            size="sm"
            variant="outline"
            color="neutral"
          />
        </div>
      </div>

      <template v-else>
        <div class="min-w-0">
          <div class="flex items-start gap-3">
            <NuxtLink
              :to="ownerHubPath(data.owner)"
              class="shrink-0"
              :aria-label="`${data.owner} skill profile`"
            >
              <img
                :src="`https://github.com/${data.owner}.png?size=96`"
                :alt="`${data.owner} avatar`"
                width="48"
                height="48"
                class="size-12 rounded-md border border-default"
              >
            </NuxtLink>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h1
                  id="skill-heading"
                  class="font-mono text-xl font-medium"
                >
                  /{{ data.name }}
                </h1>
                <UBadge
                  v-if="data.tier === 'official-org'"
                  label="official"
                  variant="solid"
                  color="primary"
                  size="xs"
                  title="Published by the organization that maintains this project"
                />
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-muted">
                <span>
                  <NuxtLink
                    :to="ownerHubPath(data.owner)"
                    class="hover:text-default transition-colors"
                  >{{ data.owner }}</NuxtLink>/<NuxtLink
                    :to="repoHubPath(data.owner, data.repo)"
                    class="hover:text-default transition-colors"
                  >{{ data.repo }}</NuxtLink>
                </span>
                <span
                  v-if="data.stars"
                  class="inline-flex items-center gap-1"
                  :title="`${data.stars.toLocaleString()} GitHub stars`"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ formatGithubStars(data.stars) }}
                </span>
                <LikeButton
                  :owner="data.owner"
                  :repo="data.repo"
                  :name="data.name"
                  :count="data.likeCount"
                  variant="inline"
                />
                <span
                  v-if="data.forks"
                  class="inline-flex items-center gap-1"
                  title="Repository forks on GitHub"
                >
                  <UIcon
                    name="i-lucide-git-fork"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ data.forks.toLocaleString() }}
                </span>
              </div>
            </div>
          </div>
          <p
            v-if="data.description"
            class="mt-3 text-sm text-muted leading-relaxed line-clamp-3"
          >
            {{ data.description }}
          </p>

          <div
            v-if="data.dependencies?.length"
            class="mt-3 flex flex-wrap items-center gap-1.5"
            aria-label="Required skills"
          >
            <span class="data-label mr-1 inline-flex items-center gap-1">
              <UIcon
                name="i-lucide-workflow"
                class="size-3.5"
                aria-hidden="true"
              />
              Requires
            </span>
            <NuxtLink
              v-for="dependency in data.dependencies"
              :key="dependency"
              :to="repoSkillPath(data.owner, data.repo, dependency)"
              class="rounded-md border border-default px-2 py-1 font-mono text-xs text-muted transition-colors hover:border-inverted/30 hover:text-default"
            >
              /{{ dependency }}
            </NuxtLink>
          </div>

          <div
            v-if="isWeakerDuplicate && duplicateGroup"
            class="mt-5 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm sm:flex-row sm:items-start"
            role="status"
          >
            <UIcon
              name="i-lucide-shield-alert"
              class="size-5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="font-medium text-default">
                Canonical version available
              </p>
              <p class="mt-1 text-muted">
                This appears to be a copy of
                <NuxtLink
                  :to="canonicalSkillPagePath"
                  class="font-mono text-default hover:underline"
                >
                  {{ duplicateGroup.canonical.owner }}/{{ duplicateGroup.canonical.repo }}/{{ duplicateGroup.canonical.name }}
                </NuxtLink>
                based on identical SKILL.md content.
              </p>
            </div>
            <UButton
              :to="canonicalSkillPagePath"
              label="View canonical"
              icon="i-lucide-arrow-right"
              trailing
              size="xs"
              color="warning"
              variant="soft"
              class="shrink-0"
            />
          </div>
        </div>

        <div class="mt-6 space-y-3">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              v-if="skillFileUrl"
              :href="skillFileUrl"
              target="_blank"
              rel="noopener"
              class="data-label inline-flex min-h-11 items-center gap-1 transition-colors hover:text-default"
              title="View SKILL.md on GitHub"
            >
              <UIcon name="i-lucide-github" class="size-3.5" aria-hidden="true" />
              GitHub
            </a>
            <span
              v-if="data.pushedAt"
              class="data-label inline-flex items-center gap-1"
              :title="formatDateTitle(data.pushedAt)"
              data-allow-mismatch="text"
            >
              <UIcon
                name="i-lucide-clock"
                class="size-3.5"
                aria-hidden="true"
              />
              Updated {{ pushedAtAgo }}
            </span>
            <a
              v-if="auditOverview"
              href="#receipts"
              class="inline-flex min-h-11 items-center gap-1 font-mono text-xs transition-colors hover:brightness-110"
              :class="AUDIT_TONE_CLASS[auditOverview.tone]"
              :title="`Security checks: ${auditOverview.label} · ${auditOverview.detail}. View full trust signals.`"
            >
              <UIcon
                :name="auditOverview.icon"
                class="size-3.5"
                aria-hidden="true"
              />
              {{ auditOverview.label }}
            </a>
          </div>
        </div>
      </template>
    </section>

    <template v-if="data && status !== 'pending'">
      <USeparator />

      <!-- The two command blocks are breakpoint twins, so neither can hold the anchor. -->
      <div id="run" class="scroll-mt-24" />
      <div class="mx-auto max-w-5xl px-4 sm:px-6 pt-6 lg:hidden">
        <h2 class="section-label mb-2">
          Use it
        </h2>
        <SkillCommandPanel
          v-model="commandMode"
          :run-command="runCmd"
          :install-command="installCmd"
          :run-copied="copied"
          :install-copied="installCopied"
          :doc-url="docUrl"
          :doc-url-copied="docUrlCopied"
          :copy-error="commandCopyError"
          @copy="copySkillCommand"
          @copy-doc-url="copySkillDocUrl"
        />
      </div>

      <div class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-10 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
        <div class="lg:col-span-8 space-y-10 md:space-y-12">
          <section
            v-if="data.contentHtml"
            class="skill-content-section"
            aria-labelledby="content-heading"
          >
            <aside
              class="skill-files-float hidden 2xl:block"
              aria-labelledby="files-float-heading"
            >
              <div class="skill-files-float-inner">
                <h2
                  id="files-float-heading"
                  class="section-label mb-3"
                >
                  Files
                </h2>
                <div class="rounded-lg border border-default p-2 bg-default">
                  <SkillFileTree
                    :assets="treeAssets"
                    :owner="data.owner"
                    :repo="data.repo"
                    :name="data.name"
                    :branch="data.branch"
                    :skill-path="data.skillPath"
                    :active-path="activeDocPath"
                    @select="(p) => { void resolveAndOpen(p) }"
                  />
                  <p v-if="treeAssetCount > treeAssets.length" class="px-2 pt-2 font-mono text-[10px] text-muted">
                    Showing {{ treeAssets.length.toLocaleString() }} of {{ treeAssetCount.toLocaleString() }} files.
                  </p>
                </div>
              </div>
            </aside>
            <div class="mb-3 flex items-start justify-between gap-3">
              <h2
                id="content-heading"
                class="section-label flex min-w-0 flex-1 items-baseline gap-2"
              >
                <span class="shrink-0">Skill content</span>
                <span
                  v-if="activeDocPath"
                  class="min-w-0 truncate font-mono text-[10px] tracking-normal normal-case text-muted"
                  :title="currentDocLabel"
                >
                  / {{ currentDocLabel }}
                </span>
              </h2>
              <div
                v-if="currentRaw"
                class="flex shrink-0 items-center gap-1"
              >
                <UButton
                  :icon="markdownCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11"
                  :aria-label="markdownCopied ? `${currentDocLabel} copied` : `Copy ${currentDocLabel}`"
                  @click="copyMarkdown(currentRaw)"
                >
                  {{ markdownCopied ? 'Copied' : 'Copy markdown' }}
                </UButton>
                <UButton
                  :href="rawSourceUrl"
                  target="_blank"
                  rel="noopener"
                  label="Raw"
                  icon="i-lucide-file-text"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11"
                />
              </div>
            </div>

            <UTabs
              v-if="!isNonMarkdownDoc"
              v-model="contentView"
              :items="contentTabs"
              :content="false"
              color="neutral"
              variant="link"
              size="xs"
              class="mb-3"
            />

            <div class="rounded-lg border border-default overflow-hidden">
              <section
                v-show="contentView === 'preview'"
                class="skill-mdxg p-4 sm:p-6 relative"
                :data-loading="docLoading || undefined"
                aria-label="Skill content viewer"
                :aria-busy="docLoading ? 'true' : undefined"
              >
                <div
                  v-if="docLoading"
                  class="skill-mdxg-loading"
                  role="status"
                  :aria-label="`Loading ${docLoading}`"
                >
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-4 shrink-0 animate-spin text-muted"
                    aria-hidden="true"
                  />
                  <span class="font-mono text-xs text-muted">
                    Loading {{ docLoading }}…
                  </span>
                </div>
                <div
                  v-if="docLoadError"
                  role="alert"
                  class="mb-3 flex items-start gap-2 rounded-md border border-default bg-muted/30 px-3 py-2 text-sm"
                >
                  <UIcon
                    name="i-lucide-alert-circle"
                    class="size-4 shrink-0 mt-0.5 text-muted"
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <p>
                      Couldn't open <code class="font-mono">{{ docLoadError.path }}</code>.
                    </p>
                    <p class="mt-1 font-mono text-xs text-muted break-words">
                      {{ docLoadError.message }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="shrink-0 px-2 py-0.5 font-mono text-xs text-muted hover:text-default"
                    @click="docLoadError = null"
                  >
                    Dismiss
                  </button>
                </div>
                <article
                  class="skill-prose"
                  @click="onPreviewClick"
                  v-html="currentContentHtml || ''"
                />
              </section>
            </div>
            <div
              v-show="contentView === 'markdown'"
              class="skill-markdown"
            >
              <div
                v-if="rawHtml"
                v-html="rawHtml"
              />
              <pre
                v-else-if="rawPlain"
                class="p-4 sm:p-6 overflow-auto text-xs whitespace-pre-wrap"
              >{{ rawPlain }}</pre>
              <div
                v-else-if="rawError"
                class="flex items-start gap-3 p-4 sm:p-6 text-sm"
                role="alert"
              >
                <UIcon
                  name="i-lucide-alert-circle"
                  class="size-4 shrink-0 mt-0.5 text-muted"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-default">
                    Couldn't render markdown source.
                  </p>
                  <p class="mt-1 font-mono text-xs text-muted break-words">
                    {{ rawError }}
                  </p>
                  <UButton
                    label="Retry"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    class="mt-3"
                    @click="() => { if (currentRaw) renderRaw(currentRaw) }"
                  />
                </div>
              </div>
              <div
                v-else
                class="p-4 sm:p-6"
              >
                <USkeleton class="h-4 w-3/4" />
                <USkeleton class="mt-2 h-4 w-1/2" />
                <USkeleton class="mt-2 h-4 w-2/3" />
              </div>
            </div>

            <p class="mt-3 text-xs text-muted">
              Source:
              <a
                :href="data.provenance?.skillFileUrl || githubUrl"
                target="_blank"
                rel="noopener"
                class="font-mono hover:text-default transition-colors"
              >
                SKILL.md on GitHub
              </a>
            </p>
          </section>

          <section
            v-if="(data.resolutionStatus && data.resolutionStatus !== 'ok') || data.sourceGone"
            aria-labelledby="broken-heading"
          >
            <h2
              id="broken-heading"
              class="sr-only"
            >
              Source unavailable
            </h2>
            <div
              class="flex items-start gap-3 rounded-lg border border-default bg-muted/30 p-4 text-sm"
              role="status"
            >
              <UIcon
                name="i-lucide-alert-triangle"
                class="size-5 shrink-0 mt-0.5 text-muted"
                aria-hidden="true"
              />
              <div class="flex-1">
                <p class="font-medium">
                  {{ sourceUnavailableTitle }}
                </p>
                <p class="mt-1 text-muted">
                  {{ sourceUnavailableDetail }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UButton
                    v-if="data.sourceGone"
                    :to="repoHubPath(data.owner, data.repo)"
                    :label="`Skills still live in ${data.owner}/${data.repo}`"
                    icon="i-lucide-arrow-right"
                    trailing
                    size="xs"
                    color="neutral"
                  />
                  <UButton
                    :href="data.githubUrl"
                    target="_blank"
                    rel="noopener"
                    label="Browse repository"
                    icon="i-simple-icons-github"
                    size="xs"
                    color="neutral"
                    variant="outline"
                  />
                </div>
              </div>
            </div>
          </section>

          <section
            v-if="data.summary"
            aria-labelledby="summary-heading"
          >
            <h2
              id="summary-heading"
              class="section-label mb-3"
            >
              What it does
            </h2>
            <p class="text-sm leading-relaxed">
              {{ data.summary.text }}
            </p>
            <p class="mt-4 font-mono text-xs text-muted">
              Generated from the current SKILL.md.
            </p>
          </section>

          <section
            v-if="data.faqs.length"
            aria-labelledby="faq-heading"
          >
            <h2
              id="faq-heading"
              class="section-label mb-4"
            >
              Frequently asked
            </h2>
            <div class="divide-y divide-default rounded-lg border border-default">
              <details
                v-for="(faq, idx) in data.faqs"
                :key="idx"
                class="group"
              >
                <summary class="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors">
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-4 shrink-0 mt-0.5 text-muted transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                  <span class="flex-1">{{ faq.question }}</span>
                </summary>
                <div class="px-4 pb-4 pl-11 text-sm text-muted leading-relaxed">
                  {{ faq.answer }}
                </div>
              </details>
            </div>
            <p class="mt-3 font-mono text-xs text-muted">
              Generated from the current SKILL.md. These answers refresh after source changes.
            </p>
          </section>
        </div>

        <aside
          class="mt-10 lg:mt-0 lg:col-span-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 scroll-fancy space-y-6"
          aria-label="Run, install and metadata"
        >
          <section
            class="hidden lg:block"
            aria-labelledby="rail-run-heading"
          >
            <h2
              id="rail-run-heading"
              class="section-label mb-2"
            >
              Use it
            </h2>
            <SkillCommandPanel
              v-model="commandMode"
              :run-command="runCmd"
              :install-command="installCmd"
              :run-copied="copied"
              :install-copied="installCopied"
              :doc-url="docUrl"
              :doc-url-copied="docUrlCopied"
              :copy-error="commandCopyError"
              @copy="copySkillCommand"
              @copy-doc-url="copySkillDocUrl"
            />
          </section>

          <section
            v-if="duplicateGroup?.siblings.length"
            aria-labelledby="duplicate-siblings-heading"
          >
            <h2
              id="duplicate-siblings-heading"
              class="section-label mb-3"
            >
              Also available from
            </h2>
            <div class="divide-y divide-default rounded-lg border border-default overflow-hidden">
              <NuxtLink
                v-for="sibling in duplicateGroup.siblings"
                :key="sibling.slug"
                :to="sibling.registryPath"
                class="flex min-w-0 items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                :title="`${sibling.owner}/${sibling.repo} · ${sibling.stars.toLocaleString()} GitHub stars`"
              >
                <UIcon
                  name="i-lucide-git-branch"
                  class="size-3.5 shrink-0 text-muted"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  {{ sibling.owner }}/{{ sibling.repo }}
                </span>
                <span
                  v-if="sibling.slug === duplicateGroup.canonical.slug"
                  class="shrink-0 font-mono text-[11px] text-muted/70"
                >
                  canonical
                </span>
              </NuxtLink>
            </div>
          </section>

          <section
            v-if="data.license"
            aria-labelledby="license-heading"
          >
            <h2
              id="license-heading"
              class="section-label mb-3"
            >
              License
            </h2>
            <p class="rounded-lg border border-default px-3 py-2.5 font-mono text-sm text-muted">
              {{ data.license }}
            </p>
          </section>

          <section
            v-if="data.tags.length || data.keywords?.length"
            aria-labelledby="topics-heading"
          >
            <h2
              id="topics-heading"
              class="section-label mb-3"
            >
              Topics
            </h2>
            <ul
              role="list"
              class="flex flex-wrap gap-1.5"
            >
              <li
                v-for="tag in data.tags"
                :key="tag.slug"
              >
                <NuxtLink
                  :to="`/skills/tag/${tag.slug}`"
                  class="inline-flex items-center gap-1 rounded-md border border-default bg-muted/40 px-2 py-1 font-mono text-xs text-muted hover:text-default hover:border-inverted/30 transition-colors"
                  :title="tag.description"
                >
                  <UIcon
                    name="i-lucide-tag"
                    class="size-3"
                    aria-hidden="true"
                  />
                  {{ tag.label }}
                </NuxtLink>
              </li>
              <li
                v-for="kw in data.keywords"
                :key="`kw-${kw}`"
              >
                <NuxtLink
                  :to="`/skills/tag/${kw}`"
                  class="inline-flex items-center gap-1 rounded-md border border-dashed border-default px-2 py-1 font-mono text-xs text-muted hover:text-default hover:border-inverted/30 transition-colors"
                >
                  <UIcon
                    name="i-lucide-hash"
                    class="size-3"
                    aria-hidden="true"
                  />
                  {{ kw }}
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section
            class="2xl:hidden"
            aria-labelledby="files-heading"
          >
            <h2
              id="files-heading"
              class="section-label mb-3"
            >
              Files
            </h2>
            <div class="rounded-lg border border-default p-2" style="min-height:8rem">
              <SkillFileTree
                :assets="treeAssets"
                :owner="data.owner"
                :repo="data.repo"
                :name="data.name"
                :branch="data.branch"
                :skill-path="data.skillPath"
                :active-path="activeDocPath"
                @select="(p) => { void resolveAndOpen(p) }"
              />
              <p v-if="treeAssetCount > treeAssets.length" class="px-2 pt-2 font-mono text-[10px] text-muted">
                Showing {{ treeAssets.length.toLocaleString() }} of {{ treeAssetCount.toLocaleString() }} files.
              </p>
            </div>
          </section>

          <section
            v-if="capabilitySummary || skillModel || frontmatterEntries.visible.length || frontmatterEntries.other.length"
            aria-labelledby="capability-heading"
          >
            <h2
              id="capability-heading"
              class="section-label mb-3"
            >
              Capability
            </h2>
            <div class="rounded-lg border border-default p-4 space-y-3">
              <div
                v-if="capabilitySummary && capabilitySummary.scopes.length"
                class="space-y-1.5"
              >
                <span class="data-label block">What it can do</span>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="scope in capabilitySummary.scopes"
                    :key="scope"
                    class="inline-flex items-center gap-1.5 rounded-md border border-default px-2 py-1 font-mono text-xs"
                    :title="SCOPE_META[scope].hint"
                  >
                    <UIcon
                      :name="SCOPE_META[scope].icon"
                      class="size-3.5"
                      aria-hidden="true"
                    />
                    {{ SCOPE_META[scope].label }}
                  </span>
                </div>
              </div>

              <div
                v-if="capabilitySummary && capabilitySummary.mcp.length"
                class="space-y-1.5"
              >
                <span class="data-label block">MCP servers</span>
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="server in capabilitySummary.mcp"
                    :key="server"
                    :label="server"
                    variant="subtle"
                    color="neutral"
                    size="xs"
                    class="font-mono"
                  />
                </div>
              </div>

              <div
                v-if="skillModel"
                class="space-y-1.5"
              >
                <span class="data-label block">Model</span>
                <UBadge
                  :label="skillModel"
                  variant="subtle"
                  color="neutral"
                  size="xs"
                  class="font-mono"
                />
              </div>

              <dl
                v-if="frontmatterEntries.visible.length"
                class="divide-y divide-default"
              >
                <div
                  v-for="entry in frontmatterEntries.visible"
                  :key="entry.key"
                  class="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
                >
                  <dt class="data-label">
                    {{ entry.key }}
                  </dt>
                  <dd class="min-w-0 font-mono text-xs text-muted">
                    <pre
                      v-if="entry.complex"
                      class="whitespace-pre-wrap break-all"
                    >{{ entry.value }}</pre>
                    <span
                      v-else
                      class="break-all"
                    >{{ entry.value }}</span>
                  </dd>
                </div>
              </dl>

              <details
                v-if="allowedTools.length"
                class="group"
              >
                <summary class="flex cursor-pointer items-center gap-2 text-xs text-muted font-mono hover:text-default transition-colors">
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                  All {{ allowedTools.length }} allowed tools
                </summary>
                <div class="mt-3 flex flex-wrap gap-1 pl-5">
                  <UBadge
                    v-for="tool in allowedTools"
                    :key="tool"
                    :label="tool"
                    variant="subtle"
                    color="neutral"
                    size="xs"
                    class="font-mono"
                  />
                </div>
              </details>

              <details
                v-if="frontmatterEntries.other.length"
                class="group"
              >
                <summary class="flex cursor-pointer items-center gap-2 text-xs text-muted font-mono hover:text-default transition-colors">
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                  Other metadata
                </summary>
                <dl class="mt-3 divide-y divide-default rounded-md border border-default bg-muted/30 text-xs">
                  <div
                    v-for="entry in frontmatterEntries.other"
                    :key="entry.key"
                    class="flex flex-col gap-1 px-3 py-2"
                  >
                    <dt class="data-label">
                      {{ entry.key }}
                    </dt>
                    <dd class="min-w-0 font-mono text-muted">
                      <pre
                        v-if="entry.complex"
                        class="whitespace-pre-wrap break-all"
                      >{{ entry.value }}</pre>
                      <span
                        v-else
                        class="break-all"
                      >{{ entry.value }}</span>
                    </dd>
                  </div>
                </dl>
              </details>
            </div>
          </section>

          <SkillReceiptsPanel
            v-if="data.provenance"
            :provenance="data.provenance"
            :audits="audits"
            :verified-summary="verifiedSummary"
            :maturity="maturity"
          />

          <section
            v-if="recentCommits.length"
            aria-labelledby="history-heading"
          >
            <h2
              id="history-heading"
              class="section-label mb-3"
            >
              History
            </h2>
            <ol
              class="divide-y divide-default rounded-lg border border-default"
            >
              <li
                v-for="commit in recentCommits"
                :key="commit.sha"
                class="flex items-start gap-2.5 px-3 py-2.5"
              >
                <img
                  v-if="commit.authorAvatar"
                  :src="commit.authorAvatar"
                  :alt="`${commit.authorName} avatar`"
                  width="20"
                  height="20"
                  class="size-5 shrink-0 rounded-full mt-0.5"
                >
                <div
                  v-else
                  class="size-5 shrink-0 rounded-full bg-muted mt-0.5"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                  <a
                    :href="commit.url"
                    target="_blank"
                    rel="noopener"
                    class="text-xs hover:underline underline-offset-2 transition-colors line-clamp-2 leading-snug"
                  >
                    {{ commit.message }}
                  </a>
                  <div class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <time
                      :datetime="commit.date"
                      :title="commit.absolute"
                      class="font-mono"
                      data-allow-mismatch="text"
                    >{{ commit.relative }}</time>
                    <span aria-hidden="true">·</span>
                    <code class="font-mono">{{ commit.shortSha }}</code>
                    <UIcon
                      v-if="commit.verified"
                      name="i-lucide-shield-check"
                      class="size-3 shrink-0"
                      :title="`GPG-signed (${commit.verifiedReason})`"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </li>
            </ol>
            <p class="mt-2 text-xs text-muted">
              <a
                :href="data.provenance?.historyUrl || `${data.githubUrl}/commits/${data.branch}/${data.skillPath}`"
                target="_blank"
                rel="noopener"
                class="font-mono hover:text-default transition-colors"
              >
                View full history →
              </a>
            </p>
          </section>

          <section
            class="border-t border-default pt-4 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100"
            aria-labelledby="readme-badge-heading"
          >
            <h2 id="readme-badge-heading" class="sr-only">
              README badge
            </h2>
            <img
              :src="badgeImageUrl"
              alt="Run on skilld.dev"
              width="137"
              height="20"
              loading="lazy"
              decoding="async"
            >
            <div class="mt-1 flex flex-wrap items-center gap-1">
              <UButton
                type="button"
                :label="badgeCopied ? 'Badge copied' : 'Copy badge'"
                :icon="badgeCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="-ml-2 min-h-11"
                :aria-label="badgeCopied ? 'Badge copied' : 'Copy badge'"
                @click="copySkillBadgeMarkdown(false)"
              />
              <UButton
                type="button"
                :label="badgeWithLikesCopied ? 'Badge copied' : 'Copy badge with likes'"
                :icon="badgeWithLikesCopied ? 'i-lucide-check' : 'i-lucide-heart'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="min-h-11"
                :aria-label="badgeWithLikesCopied ? 'Badge with likes copied' : 'Copy badge with likes'"
                @click="copySkillBadgeMarkdown(true)"
              />
            </div>
          </section>
        </aside>
      </div>
    </template>
  </div>

  <template v-if="relatedTabsAvailable.length">
    <USeparator />
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="related-heading"
    >
      <h2
        id="related-heading"
        class="section-label mb-4"
      >
        Related skills
      </h2>
      <UTabs
        v-model="relatedTab"
        :items="relatedTabsAvailable"
        :content="false"
        color="neutral"
        variant="link"
        size="xs"
        class="mb-4"
      />
      <SkillSourceList
        :items="currentRelatedItems"
        variant="grid"
        aria-label="Related skills"
      />
    </section>
  </template>
</template>

<style scoped>
/* tick-1778739986023 */
/* Floating file-tree panel — visible at 2xl+ only. Pinned to the viewport
   left of the centered max-w-5xl content column. Half-page = 32rem
   (max-w-5xl / 2), tree column ~14rem, gap 1.5rem; max-aligned to a 1rem
   safety margin so very wide viewports keep the panel near the content. */
/* The content section becomes the positioning anchor at 2xl+ so the floating
   panel can sit aligned with the section's top edge ("Skill content"
   heading) and extend down with it. */
@media (min-width: 1536px) {
  .skill-content-section {
    position: relative;
  }
}

.skill-files-float {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Offset left of the column (14rem panel + 1.5rem gap). */
  left: -15.5rem;
  width: 14rem;
}

.skill-files-float-inner {
  position: sticky;
  top: 6rem;
  max-height: calc(100vh - 8rem);
  overflow-y: auto;
  padding-right: 0.25rem;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--ui-border) 80%, transparent) transparent;
}
.skill-files-float-inner:hover {
  scrollbar-color: color-mix(in oklch, var(--ui-text-muted) 60%, transparent) transparent;
}
.skill-files-float-inner::-webkit-scrollbar {
  width: 8px;
}
.skill-files-float-inner::-webkit-scrollbar-track {
  background: transparent;
}
.skill-files-float-inner::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--ui-border) 80%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background-color 200ms;
}
.skill-files-float-inner:hover::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--ui-text-muted) 60%, transparent);
  background-clip: padding-box;
}

.skill-mdxg {
  min-height: 24rem;
}

.skill-mdxg[data-loading] :deep(.skill-prose) {
  opacity: 0.4;
  transition: opacity 120ms;
  pointer-events: none;
}

.skill-mdxg-loading {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  z-index: 1;
}

.skill-markdown :deep(pre),
.skill-markdown :deep(.shiki),
.skill-prose :deep(pre),
.skill-prose :deep(.shiki) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.65;
  background: var(--ui-bg-muted) !important;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 0.875rem 1rem;
  overflow-x: auto;
}
.skill-markdown :deep(.shiki span),
.skill-prose :deep(.shiki span) {
  background: transparent !important;
}
</style>
