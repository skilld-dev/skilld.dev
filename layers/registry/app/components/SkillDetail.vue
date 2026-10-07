<script setup lang="ts">
import type { SkillAudit } from '~~/app/utils/skill-audit-overview'
import type { RunCheckFlagsResponse } from '#shared/run-check-flags'
import type { TrendingAward } from '#shared/trending-award'
import type { SkillDemoView } from '../../server/utils/skill-demos'
import type { ZipState } from '../utils/skill-zip'
import type { SkillBehavior } from './_SkillBehaviors.vue'
import { formatTimeAgo } from '@vueuse/core'
import { resolveSkillAuditOverview } from '~~/app/utils/skill-audit-overview'
import { comparisonLinkForSkill } from '#shared/comparison-navigation'
import { avatarProxyUrl, githubAvatarProxyUrl } from '#shared/image-proxy'
import { skillPageUrl as exactSkillPageUrl, skillInstallCmd, skillRunCmd, skillRunPrompt } from '#shared/skill-commands'
import { headlineTrendingAward, trendingAwardBadgeLabel, trendingAwardLabel, trendingAwardPath } from '#shared/trending-award'
import { behaviorIcon } from '../utils/skill-behaviors'
import { formatByteSize, formatTokenCount, resolveSkillContextCost, resolveSkillFileContext } from '../utils/skill-context-cost'
import { fileIcon, highlightLangFromPath } from '../utils/skill-file-tree'
import { partitionMetadataEntries } from '../utils/skill-metadata'
import { resolveSkillPageState } from '../utils/skill-page-state'
import { resolveSkillRawUrl } from '../utils/skill-raw-url'
import { resolveSkillTitle } from '../utils/skill-title'
import { resolveViewerLink } from '../utils/skill-viewer-link'
import { resolveSkillZipEntries } from '../utils/skill-zip'
import SkillBehaviors from './_SkillBehaviors.vue'
import SkillCommandPanel from './_SkillCommandPanel.vue'
import SkillDemo from './_SkillDemo.vue'
import SkillReceiptsPanel from './_SkillReceiptsPanel.vue'
import SkillStarTrend from './_SkillStarTrend.vue'
import SkillThirdPartyChecks from './_SkillThirdPartyChecks.vue'

const props = defineProps<{
  owner: string
  repo: string
  name: string
  /** A `/-/<file>` deep link: the file opens in the viewer on first paint. */
  file?: string
}>()

const owner = computed(() => props.owner)
const repo = computed(() => props.repo)
const name = computed(() => props.name)
const slug = computed(() => `${owner.value}/${repo.value}/${name.value}`)
const comparisonLink = computed(() => comparisonLinkForSkill(props))

interface RelatedSkill {
  name: string
  owner: string
  repo: string
  displayName: string
  description: string | null
  slug: string
  registryPath: string
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
  /** Final page for the tag. A redirected tag links to its target. */
  path: string
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
  behaviors: SkillBehavior[]
}

interface NeighborSkill {
  name: string
  owner: string
  repo: string
  slug: string
  displayName: string
  description: string | null
  score: number
  registryPath: string
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

interface MissingSkillMatch {
  name: string
  owner: string
  repo: string
  displayName: string
  description: string | null
  stars: number
}

interface MissingSkillSearchResponse {
  items: MissingSkillMatch[]
  total: number
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
  /** GitHub profile name from the synced `owners` row; null until synced. */
  authorName: string | null
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
  /** A recorded run of this Skill, when one is published. */
  demo: SkillDemoView | null
  tier: 'official-org' | 'official-user' | 'community'
  sourceFacts: SourceFacts
  tags: SkillTag[]
  keywords: string[]
  likeCount: number
  /** Best rank first. Optional while an edge-cached payload predates it. */
  trendingAwards?: TrendingAward[]
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

interface SkillRelatedResponse {
  commits: SkillCommit[]
  relatedRepoSkills: RelatedSkill[]
  relatedOwnerSkills: RelatedSkill[]
  coOccurrenceSkills: NeighborSkill[]
  semanticSiblings: NeighborSkill[]
}

// Related skills and commit history load in the browser, once either section
// nears the viewport. Crawlers that run no JavaScript render thousands of
// unique skill pages in bursts, and each SSR paid five D1 reads for this
// endpoint (2026-09-29 overload). Browsers and rendering crawlers still get it.
const {
  data: relatedData,
  error: relatedError,
  execute: loadRelated,
  clear: clearRelated,
} = useLazyFetch<SkillRelatedResponse>(
  () => `/api/skill-related/${slug.value}`,
  { server: false, immediate: false, watch: false },
)
const relatedLoading = computed(() => !relatedData.value && !relatedError.value)

const historySlot = useTemplateRef<HTMLElement>('historySlot')
const relatedSlot = useTemplateRef<HTMLElement>('relatedSlot')
const relatedSlotVisible = ref(false)
const requestedRelatedSlug = ref<string | null>(null)

useIntersectionObserver(
  () => [historySlot.value, relatedSlot.value],
  (entries) => {
    relatedSlotVisible.value = entries.some(entry => entry.isIntersecting)
  },
  { rootMargin: '1200px 0px' },
)

watch([relatedSlotVisible, slug], ([visible, key]) => {
  if (requestedRelatedSlug.value !== null && requestedRelatedSlug.value !== key) {
    requestedRelatedSlug.value = null
    clearRelated()
  }
  if (!visible || requestedRelatedSlug.value === key)
    return
  requestedRelatedSlug.value = key
  void loadRelated()
}, { flush: 'post' })

function retryRelated(): void {
  clearRelated()
  void loadRelated()
}

// The run check flag, from artifact delivery (ADR-0001). It renders with the
// page, so the flag never moves the run block after the first paint. The
// route reads only flagged rows, so most Skills cost one empty index read.
const runFlagFetch = useFetch<RunCheckFlagsResponse>('/api/run-checks/flags', {
  query: { skill: slug },
  watch: [slug],
  default: () => ({ items: [] }),
})
const runFlag = computed(() => runFlagFetch.data.value?.items[0] ?? null)

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
// A deep link renders its file on the server, so the link shows that file
// without waiting for a client fetch.
interface SkillAssetResponse {
  status: 'ok'
  raw: string
  html: string | null
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}
const initialFileFetch = props.file
  ? useFetch<SkillAssetResponse>(() => `/api/skill-asset/${slug.value}/${props.file}`, { watch: false })
  : null

if (import.meta.server)
  await Promise.all([skillFetch, liveSkillFetch, runFlagFetch, ...(initialFileFetch ? [initialFileFetch] : [])])

const { data, status, error, refresh } = skillFetch

interface StarHistoryResponse {
  starHistory: { _tag: 'ready', approximate: boolean, points: { at: number, value: number }[] } | { _tag: string }
}
// Browser only: the trend is decoration, so crawlers never pay a D1 read for it.
// The trend shows from lg up. Below that it would wrap the byline when it
// arrives, so smaller screens never fetch it.
const showStarTrend = useMediaQuery('(min-width: 1024px)')
const { data: starHistoryData, execute: loadStarHistory } = useLazyFetch<StarHistoryResponse>(
  () => `/api/repos/${owner.value}/${repo.value}/history`,
  { server: false, immediate: false, watch: false },
)
watch([showStarTrend, owner, repo], ([show]) => {
  if (show)
    void loadStarHistory()
}, { immediate: true })
const starTrend = computed(() => {
  const history = starHistoryData.value?.starHistory
  if (!history || history._tag !== 'ready' || !('points' in history) || history.points.length < 2)
    return null
  return history
})
const { data: liveSkill } = liveSkillFetch

const isMissingSkill = computed(() => error.value?.statusCode === 404)
const missingSkillQuery = computed(() => name.value
  .replace(/[-_:]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim())
const missingSkillFetch = useFetch<MissingSkillSearchResponse>('/api/skills', {
  query: computed(() => ({ q: missingSkillQuery.value, limit: 3 })),
  immediate: false,
  watch: false,
})
const {
  data: missingSkillSearch,
  status: missingSkillSearchStatus,
  error: missingSkillSearchError,
  execute: searchForMissingSkill,
} = missingSkillFetch
const missingSkillMatches = computed(() => missingSkillSearch.value?.items ?? [])
const allMissingSkillMatchesPath = computed(() => ({
  path: '/skills',
  query: { q: missingSkillQuery.value },
}))

async function loadMissingSkillMatches(): Promise<void> {
  if (!isMissingSkill.value || !missingSkillQuery.value)
    return
  await searchForMissingSkill()
}

if (import.meta.server && isMissingSkill.value)
  await loadMissingSkillMatches()

watch([isMissingSkill, missingSkillQuery], () => {
  if (import.meta.client && isMissingSkill.value)
    void loadMissingSkillMatches()
}, { immediate: true })

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
    return 'Source unavailable on GitHub'
  return data.value?.resolutionStatus === 'path_missing'
    ? 'SKILL.md not found in source repository'
    : 'Could not load SKILL.md'
})

const sourceUnavailableDetail = computed(() => {
  if (data.value?.sourceGone) {
    const message = 'This Skill may have been removed or moved.'
    return data.value.raw || data.value.contentHtml
      ? `${message} Below is the last saved copy.`
      : message
  }
  return 'The source file moved or was removed. Browse the repository to find its current location.'
})

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
  if (data.value?.sourceGone)
    return []
  const live = skillFiles.value?.files
  if (live && live.length)
    return live
  return data.value?.assets ?? []
})
const treeAssetCount = computed(() => skillFiles.value?.total ?? data.value?.assetCount ?? treeAssets.value.length)

// A Skill that is only SKILL.md has nothing to browse, so it gets no explorer
// and the Skill takes the width.
const hasExplorer = computed(() => treeAssets.value.length > 0)

// Claude and ChatGPT take a Skill as an uploaded ZIP. The browser builds it
// from GitHub at the pinned commit, so skilld serves no bytes.
const zipState = ref<ZipState>({ _tag: 'idle' })
const ZIP_FETCH_BATCH = 6

// Each click starts a numbered build. Progress from an older build that is
// still in flight must not overwrite the state of the current one.
let zipBuildId = 0

async function buildSkillZip(buildId: number, signal: AbortSignal): Promise<{ name: string, bytes: Uint8Array }> {
  const skill = data.value
  if (!skill?.skillPath)
    throw new Error('skilld has no path for this SKILL.md. Download it from GitHub.')
  if (treeAssetCount.value > treeAssets.value.length)
    throw new Error('This Skill has more files than skilld lists. Download it from GitHub.')
  // The live file list walks the branch head, so the files come from there too.
  // The recorded commit is the fallback when only the synced list exists.
  const ref = skillFiles.value?.files.length ? skillFiles.value.branch : (skill.provenance?.sourceCommitSha ?? skill.branch)
  const entries = resolveSkillZipEntries({
    owner: skill.owner,
    repo: skill.repo,
    ref,
    skillPath: skill.skillPath,
    name: skill.name,
    files: treeAssets.value,
  })
  // Loaded on click, so the ZIP code never ships in the page bundle.
  const { zipSync } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  let done = 0
  zipState.value = { _tag: 'building', done, total: entries.length }
  for (let start = 0; start < entries.length; start += ZIP_FETCH_BATCH) {
    await Promise.all(entries.slice(start, start + ZIP_FETCH_BATCH).map(async (entry) => {
      const response = await fetch(entry.url, { signal })
      if (!response.ok)
        throw new Error(`GitHub answered ${response.status} for ${entry.zipPath}.`)
      files[entry.zipPath] = new Uint8Array(await response.arrayBuffer())
      done += 1
      if (buildId === zipBuildId)
        zipState.value = { _tag: 'building', done, total: entries.length }
    }))
  }
  return { name: `${skill.name}.zip`, bytes: zipSync(files) }
}

function downloadSkillZip() {
  if (zipState.value._tag === 'building')
    return
  const buildId = ++zipBuildId
  const controller = new AbortController()
  buildSkillZip(buildId, controller.signal)
    .then(({ name, bytes }) => {
      // A copy backed by a plain ArrayBuffer, which is what Blob accepts.
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      // Safari and Firefox read the URL after the click returns.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      zipState.value = { _tag: 'idle' }
    })
    .catch((error: unknown) => {
      // Stop the files still downloading, so none of them reports progress.
      controller.abort()
      if (buildId === zipBuildId)
        zipState.value = { _tag: 'error', message: error instanceof Error ? error.message : 'The ZIP could not be built.' }
    })
}

const contextCost = computed(() => data.value
  ? resolveSkillContextCost({
      raw: data.value.raw,
      name: data.value.name,
      description: data.value.description,
      files: treeAssets.value,
    })
  : null)

const audits = computed<SkillAudit[]>(() => liveSkill.value?.audits ?? [])
const auditOverview = computed(() => resolveSkillAuditOverview(audits.value))

// The base tones are for dark surfaces. Light mode needs a darker shade to
// reach 4.5:1 against the warm background.
const AUDIT_TONE_CLASS = {
  success: 'text-success-700 dark:text-success',
  warning: 'text-warning-800 dark:text-warning',
  error: 'text-error-700 dark:text-error',
} as const

const { copy: copyMarkdown, copied: markdownCopied } = useClipboard()

const badgeInput = computed(() => data.value
  ? {
      owner: data.value.owner,
      repo: data.value.repo,
      name: data.value.name,
      registryPath: data.value.registryPath,
    }
  : null)

// Running is the default: the Agent fetches the Skill page, receives the
// SKILL.md as markdown, and nothing lands in the repository. Installing is the
// opt-in for a Skill you want every session. The exact three-segment address,
// not the canonical one: only that route answers a markdown fetch with the
// SKILL.md (server/plugins/ai-ready-markdown-source.ts).
const runUrl = computed(() => {
  if (!data.value)
    return ''
  return exactSkillPageUrl(data.value.owner, data.value.repo, data.value.name)
})

const runPrompt = computed(() => skillRunPrompt(runUrl.value))

// The CLI form survives in the meta description fallback, where a URL would
// repeat the page's own address.
const runCmd = computed(() => {
  if (!data.value)
    return ''
  return skillRunCmd(data.value.owner, data.value.repo, data.value.name)
})

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

const githubUrl = computed(() => data.value?.githubUrl ?? '')
const skillFileUrl = computed(() => data.value?.provenance?.skillFileUrl ?? '')

// Byline falls back to the login when the owner has no synced profile name.
const authorLabel = computed(() => {
  if (!data.value)
    return ''
  return resolveAuthorName(data.value.owner, data.value.authorName) ?? data.value.owner
})

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
const maturity = computed(() => data.value?.maturity ?? null)

// The SKILL.md commit date, which is what the Agent reads. The repository push
// date moves on any unrelated commit, so the header used to contradict History.
const skillUpdatedDate = computed(() => {
  const modifiedAt = data.value?.provenance?.modifiedAt
  return modifiedAt ? new Date(modifiedAt * 1000) : pushedAtDate.value
})
const skillUpdatedAgo = useTimeAgo(skillUpdatedDate)
// Descriptions double as trigger text and run long. Two lines, then "more".
const descriptionEl = useTemplateRef<HTMLElement>('descriptionEl')
const descriptionExpanded = ref(false)
const descriptionClamped = ref(false)
useResizeObserver(descriptionEl, () => {
  const el = descriptionEl.value
  if (el && !descriptionExpanded.value)
    descriptionClamped.value = el.scrollHeight > el.clientHeight + 1
})
const shortSha = computed(() => data.value?.provenance?.sourceCommitSha?.slice(0, 7) ?? null)
const trendingAward = computed(() => headlineTrendingAward(data.value?.trendingAwards ?? []))

// Frontmatter licences are free text ("Proprietary. LICENSE.txt has complete
// terms"). The chip keeps the first clause; the title carries the rest.
const licenseLabel = computed(() => {
  const license = data.value?.license?.trim()
  if (!license)
    return null
  // "MIT", "Apache-2.0", "Proprietary" read as names. A sentence such as
  // "Complete terms in LICENSE.txt" does not, so the chip says "License".
  const first = license.split(/[.;(]/)[0]!.trim()
  return first.length <= 20 && first.split(/\s+/).length <= 2 ? first : 'License'
})

const verifiedSummary = computed<{ verified: number, total: number } | null>(() => {
  const list = relatedData.value?.commits ?? []
  if (!list.length)
    return null
  return { verified: list.filter(c => c.verified).length, total: list.length }
})

const behaviors = computed(() => data.value?.sourceFacts.behaviors ?? [])

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

const initialFile = initialFileFetch?.data.value?.raw ? initialFileFetch.data.value : null
const initialFileIsMarkdown = /\.(?:md|markdown)$/i.test(props.file ?? '')
const contentView = ref<'preview' | 'markdown'>(initialFile && !initialFileIsMarkdown ? 'markdown' : 'preview')
const rawHtml = ref<string | null>(null)
// Set when the file's language has no bundled grammar; rendered as plain text
// so an unsupported extension doesn't leave the viewer stuck on the skeleton.
const rawPlain = ref<string | null>(null)
const rawError = ref<string | null>(null)

// Path of the doc currently active in the viewer, relative to the skill folder.
// Empty string === SKILL.md. Used to highlight the file tree.
const activeDocPath = ref<string>(initialFile ? props.file! : '')
// Sub-doc state. When the user navigates to a non-root markdown file via the
// file tree, we store its server-rendered HTML + raw source here. Null means
// "show the root SKILL.md" (data.value.contentHtml / data.value.raw).
const subDocHtml = ref<string | null>(initialFile && initialFileIsMarkdown ? initialFile.html : null)
const subDocRaw = ref<string | null>(initialFile?.raw ?? null)
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
const MISSING_FILE_MESSAGE = 'This file is not in the Skill folder.'
// Only a finished fetch can say the file is missing. On a client navigation
// the fetch is still running here, and the watcher below applies its result.
const docLoadError = ref<{ path: string, message: string } | null>(
  props.file && !initialFile && initialFileFetch?.error.value ? { path: props.file, message: MISSING_FILE_MESSAGE } : null,
)
// True while a tree click is fetching a sub-doc; drives the skeleton overlay
// so the user doesn't stare at the previous doc.
const docLoading = ref<string | null>(null)

// The body goes full width on desktop, capped so ultra-wide screens keep a
// readable page. The header keeps its 1024px column.
const SKILL_CONTAINER = 'mx-auto w-full max-w-[105rem] px-4 sm:px-6 lg:px-8 xl:px-10'

const viewerSection = useTemplateRef<HTMLElement>('viewerSection')
// The header checks chip jumps to the checks and opens their detail.
const checksOpen = ref(useRoute().hash === '#third-party-checks')
const filesPopoverOpen = ref(false)

// The site header and the sticky viewer bar cover the top 108px, so focus and
// anchor jumps would land underneath them.
useHead({ htmlAttrs: { style: 'scroll-padding-top: 7rem' } })

// A file opened from deep inside a long document would otherwise start
// mid-page. Only jump when the viewer top has scrolled out of view.
function revealViewerTop() {
  const section = viewerSection.value
  if (section && section.getBoundingClientRect().top < 0)
    section.scrollIntoView({ block: 'start' })
}

// The address bar follows the open file, so a copied URL opens that file.
// replaceState keeps the router state, so no navigation or remount happens.
function syncViewerUrl(path: string) {
  if (!import.meta.client || !data.value)
    return
  const base = data.value.registryPath
  const next = path && path !== 'SKILL.md'
    ? `${base}/-/${path.split('/').map(encodeURIComponent).join('/')}`
    : base
  if (window.location.pathname !== next)
    window.history.replaceState({ ...window.history.state, current: next }, '', next)
}

function showAsset(path: string, asset: { raw: string, html: string | null }) {
  activeDocPath.value = path
  subDocRaw.value = asset.raw
  subDocHtml.value = /\.(?:md|markdown)$/i.test(path) ? asset.html : null
  syncViewerUrl(path)
  revealViewerTop()
}

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
      syncViewerUrl('')
      revealViewerTop()
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
    showAsset(path, asset)
  }
  finally {
    docLoading.value = null
  }
}

// Navigating to another Skill lands on its SKILL.md.
watch(() => data.value?.registryPath, (registryPath, previous) => {
  if (!previous || registryPath === previous)
    return
  activeDocPath.value = ''
  subDocHtml.value = null
  subDocRaw.value = null
  docLoadError.value = null
})

// A deep link reached by client navigation, or by Back, was not rendered on
// the server. Its file fetch finishes after setup, so apply it here.
if (initialFileFetch) {
  watch([initialFileFetch.data, initialFileFetch.error], ([asset, error]) => {
    if (!props.file)
      return
    if (asset?.raw) {
      if (activeDocPath.value !== props.file)
        showAsset(props.file, asset)
      return
    }
    if (error)
      docLoadError.value = { path: props.file, message: MISSING_FILE_MESSAGE }
  })
}

// Intercept clicks on Markdown links inside the rendered preview so we can
// swap the doc in place instead of leaving the page.
function onPreviewClick(e: MouseEvent) {
  if (!data.value || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return
  const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor)
    return
  const resolved = resolveViewerLink({
    href: anchor.getAttribute('href') ?? '',
    activeDocPath: activeDocPath.value,
    fileRoutePrefix: `${repoSkillPath(data.value.owner, data.value.repo, data.value.name)}/-/`,
  })
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

watch([contentView, currentRaw], ([view, raw], previous) => {
  if (raw !== previous?.[1]) {
    rawHtml.value = null
    rawPlain.value = null
    rawError.value = null
  }
  if (!import.meta.client || view !== 'markdown' || !raw || rawHtml.value || rawPlain.value)
    return
  renderRaw(raw)
}, { immediate: true })

const skillMdBytes = computed(() => data.value?.raw ? new TextEncoder().encode(data.value.raw).byteLength : 0)
const viewerCrumbs = computed(() => currentDocLabel.value.split('/'))

// What the open file costs the Agent's context, shown beside the file itself.
const viewerContext = computed(() => {
  const cost = contextCost.value
  if (!cost)
    return null
  if (!activeDocPath.value)
    return { _tag: 'skill' as const, cost }
  const file = treeAssets.value.find(asset => asset.path === activeDocPath.value)
  return file ? resolveSkillFileContext(file) : null
})
// A LICENSE file at the Skill root, which the license chip opens in the viewer.
const licenseFile = computed(() => treeAssets.value.find(asset => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(asset.path))?.path ?? null)

const viewerFileSize = computed(() => {
  if (!activeDocPath.value)
    return skillMdBytes.value || null
  return treeAssets.value.find(asset => asset.path === activeDocPath.value)?.size ?? null
})

const isNonMarkdownDoc = computed(() => {
  const p = activeDocPath.value
  if (!p)
    return false
  const lower = p.toLowerCase()
  return !lower.endsWith('.md') && !lower.endsWith('.markdown')
})

// Non-Markdown files have no rendered view, so they always show source. Going
// back to a Markdown file shows it rendered again.
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

const pageState = computed(() => {
  const skill = data.value
  if (isMissingSkill.value)
    return resolveSkillPageState({ _tag: 'missing' })
  if (!skill)
    return resolveSkillPageState({ _tag: error.value ? 'failed' : 'loading' })
  return resolveSkillPageState({
    _tag: 'loaded',
    indexable: skill.seo.indexable,
    sourceGone: skill.sourceGone,
    registryPath: skill.registryPath,
    duplicateCanonicalPath: isWeakerDuplicate.value ? canonicalSkillPagePath.value : null,
  })
})

// Set the status while rendering on the server. A missing Skill keeps its
// helpful page, but the response says 404 so Google drops the URL instead of
// filing it as a soft 404.
// A deep link to a file the Skill does not have answers 404 and shows the
// Skill with a notice, like a missing page with a way back.
if (import.meta.server && props.file && !initialFile && data.value)
  setResponseStatus(useRequestEvent()!, 404)

if (import.meta.server && pageState.value.status) {
  const event = useRequestEvent()!
  setResponseStatus(event, pageState.value.status)
  // A 503 tells Google the failure is transient, so it retries the URL.
  if (pageState.value.retryAfterSeconds)
    useResponseHeader('Retry-After').value = String(pageState.value.retryAfterSeconds)
}

// 2026-08-22: the shared "A Claude Code skill for Cursor, Codex, and other
// agents." suffix is gone. Identical boilerplate across 1,300+ meta
// descriptions was the last scaled-content signature in Google snippets.
// Provenance stays: "From owner/repo." carries the unique part.
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
    ...(!d.sourceGone
      ? [defineHowTo({
          '@id': `${skillPageUrl.value}#run`,
          'name': `Run ${d.name} with skilld`,
          'description': `Run the ${d.name} Claude Code skill in Cursor, Codex, and other agents. Installing is the opt-in second step.`,
          'totalTime': 'PT1M',
          'step': [
            {
              '@type': 'HowToStep',
              'name': 'Run the skill',
              'text': runPrompt.value,
              'url': `${skillPageUrl.value}#run`,
            },
            {
              '@type': 'HowToStep',
              'name': 'Keep the skill in every session',
              'text': installCmd.value,
              'url': `${skillPageUrl.value}#run`,
            },
          ],
        })]
      : []),
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

// A deep link is a view of the Skill page, so it stays out of the index and
// points its canonical at the Skill.
const deepLinkTitle = computed(() => activeDocPath.value
  ? `${activeDocPath.value.split('/').pop()} · ${data.value?.name ?? props.name}`
  : null)

useSeoMeta({
  title: () => deepLinkTitle.value ?? skillTitle.value,
  description: () => skillDescription.value,
  robots: () => props.file ? 'noindex,follow' : pageState.value.robots ?? undefined,
  ogUrl: () => pageState.value.canonicalPath ? `${siteOrigin}${pageState.value.canonicalPath}` : undefined,
  ogTitle: () => skillTitle.value,
  ogDescription: () => skillDescription.value,
  twitterTitle: () => skillTitle.value,
  twitterDescription: () => skillDescription.value,
})

useHead(computed(() => ({
  link: pageState.value.canonicalPath
    ? [{ rel: 'canonical', href: `${siteOrigin}${pageState.value.canonicalPath}` }]
    : [],
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

      <section
        v-else-if="isMissingSkill"
        class="editorial-state overflow-hidden rounded-lg text-left"
        aria-labelledby="skill-heading"
      >
        <div class="px-4 py-6 sm:px-6">
          <h1
            id="skill-heading"
            class="font-mono text-lg font-medium"
          >
            Skill not found
          </h1>
          <p class="mt-2 max-w-2xl text-base text-muted">
            This URL does not match a published skill.
          </p>
          <p class="mt-1 break-words font-mono text-sm text-muted">
            We searched for “{{ missingSkillQuery }}”.
          </p>
        </div>

        <div class="border-t border-default">
          <div
            v-if="missingSkillSearchStatus === 'idle' || missingSkillSearchStatus === 'pending'"
            class="px-4 py-6 sm:px-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <p class="text-sm text-muted">
              Searching for similar skills…
            </p>
          </div>

          <div
            v-else-if="missingSkillSearchError"
            class="px-4 py-6 sm:px-6"
            role="alert"
          >
            <p class="text-sm text-highlighted">
              Couldn't load similar skills.
            </p>
            <p class="mt-1 text-sm text-muted">
              Check your connection, then try again.
            </p>
            <UButton
              label="Retry search"
              color="neutral"
              variant="outline"
              size="sm"
              class="mt-4 min-h-11"
              @click="() => { void loadMissingSkillMatches() }"
            />
          </div>

          <section
            v-else-if="missingSkillMatches.length"
            aria-labelledby="missing-skill-matches-heading"
          >
            <h2
              id="missing-skill-matches-heading"
              class="section-label px-4 pb-2 pt-4 sm:px-6"
            >
              Closest matches
            </h2>
            <ul class="divide-y divide-default">
              <li
                v-for="match in missingSkillMatches"
                :key="`${match.owner}/${match.repo}/${match.name}`"
              >
                <NuxtLink
                  :to="repoSkillPath(match.owner, match.repo, match.name)"
                  data-testid="missing-skill-match"
                  class="group flex min-h-11 items-start gap-3 px-4 py-4 transition-colors duration-200 hover:bg-elevated sm:px-6"
                >
                  <img
                    :src="githubAvatarProxyUrl(match.owner, 48)"
                    :alt="`${match.owner} avatar`"
                    loading="lazy"
                    width="24"
                    height="24"
                    class="size-6 shrink-0 rounded-full"
                  >
                  <span class="min-w-0 flex-1">
                    <span class="block break-words font-mono text-sm font-medium text-highlighted">
                      {{ match.displayName || match.name }}
                    </span>
                    <span class="mt-1 block break-words font-mono text-xs text-muted">
                      {{ match.owner }}/{{ match.repo }}
                    </span>
                    <span
                      v-if="match.description"
                      class="mt-2 text-sm text-muted line-clamp-2"
                    >
                      {{ match.description }}
                    </span>
                  </span>
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="mt-1 size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </NuxtLink>
              </li>
            </ul>
          </section>

          <div v-else class="px-4 py-6 sm:px-6">
            <p class="text-sm text-muted">
              No similar skills found.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2 border-t border-default px-4 py-4 sm:flex-row sm:px-6">
          <UButton
            v-if="missingSkillMatches.length"
            :to="allMissingSkillMatchesPath"
            data-testid="missing-skill-all-matches"
            label="View all matches"
            size="sm"
            variant="outline"
            color="neutral"
            class="min-h-11"
          />
          <UButton
            to="/skills"
            label="Browse skills"
            size="sm"
            variant="ghost"
            color="neutral"
            class="min-h-11"
          />
        </div>
      </section>

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
          Couldn't load this skill. Check your connection and try again.
        </p>
        <div class="mt-4 flex items-center justify-center gap-3">
          <UButton
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
                :src="githubAvatarProxyUrl(data.owner, 96)"
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
                <a
                  v-if="shortSha && data.provenance?.sourceCommitUrl"
                  :href="data.provenance.sourceCommitUrl"
                  target="_blank"
                  rel="noopener"
                  class="skill-sha font-mono text-sm tabular-nums hover:underline underline-offset-2"
                  :title="`Your agent reads SKILL.md at commit ${shortSha}`"
                >@{{ shortSha }}</a>
                <span
                  v-if="data.tier !== 'community'"
                  class="skill-official"
                  :title="data.tier === 'official-org' ? 'Published by the organization that maintains this project' : 'Published by the maintainer of this project'"
                >
                  <UIcon
                    name="i-lucide-badge-check"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  official
                </span>
                <NuxtLink
                  v-if="trendingAward"
                  :to="trendingAwardPath(trendingAward)"
                  class="skill-award"
                  :aria-label="trendingAwardLabel(trendingAward)"
                  :title="trendingAwardLabel(trendingAward)"
                >
                  <TrendingMark />
                  {{ trendingAwardBadgeLabel(trendingAward) }}
                </NuxtLink>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span>
                  by <NuxtLink
                    :to="ownerHubPath(data.owner)"
                    class="text-default hover:underline underline-offset-2"
                  >{{ authorLabel }}</NuxtLink>
                </span>
                <span aria-hidden="true">·</span>
                <span class="font-mono">
                  <NuxtLink
                    :to="ownerHubPath(data.owner)"
                    class="hover:text-default transition-colors"
                  >{{ data.owner }}</NuxtLink>/<NuxtLink
                    :to="repoHubPath(data.owner, data.repo)"
                    class="hover:text-default transition-colors"
                  >{{ data.repo }}</NuxtLink>
                </span>
                <template v-if="data.stars">
                  <span aria-hidden="true">·</span>
                  <span
                    class="font-mono tabular-nums"
                    :title="`${data.stars.toLocaleString()} GitHub stars`"
                  >{{ formatGithubStars(data.stars) }} stars</span>
                </template>
                <LikeButton
                  :owner="data.owner"
                  :repo="data.repo"
                  :name="data.name"
                  :count="data.likeCount"
                  variant="inline"
                />
                <span
                  v-if="data.forks"
                  class="inline-flex items-center gap-1 font-mono"
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
            <SkillStarTrend
              v-if="showStarTrend && starTrend"
              :points="starTrend.points"
              :approximate="starTrend.approximate"
              class="ml-auto hidden shrink-0 lg:flex"
            />
          </div>
          <!-- Only the browser can tell whether two lines clamp the text, so
               "more" appears after hydration. It sits over the end of the
               second line instead of below it, so nothing under it moves. -->
          <div
            v-if="data.description"
            class="skill-description mt-3"
          >
            <p
              id="skill-description"
              ref="descriptionEl"
              class="text-sm text-muted leading-relaxed"
              :class="{ 'line-clamp-2': !descriptionExpanded }"
            >
              {{ data.description }}
            </p>
            <button
              v-if="descriptionClamped || descriptionExpanded"
              type="button"
              class="data-label inline-flex min-h-6 items-center transition-colors hover:text-default"
              :class="descriptionExpanded ? 'mt-1' : 'skill-description__more'"
              :aria-expanded="descriptionExpanded"
              aria-controls="skill-description"
              @click="descriptionExpanded = !descriptionExpanded"
            >
              {{ descriptionExpanded ? 'less' : 'more' }}
            </button>
          </div>

          <p v-if="comparisonLink" class="mt-3 text-sm">
            <NuxtLink
              :to="comparisonLink.to"
              class="inline-flex min-h-11 items-center text-default underline underline-offset-4 hover:text-primary"
            >
              {{ comparisonLink.label }}
            </NuxtLink>
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

        <div class="mt-5 space-y-2">
          <ul
            role="list"
            class="flex flex-wrap items-center gap-1.5"
            aria-label="Skill facts"
          >
            <li v-if="contextCost">
              <span class="skill-chip">
                <UIcon name="i-lucide-files" class="size-3.5" aria-hidden="true" />
                {{ contextCost.fileCount }} {{ contextCost.fileCount === 1 ? 'file' : 'files' }}
              </span>
            </li>
            <li v-if="contextCost">
              <span class="skill-chip" title="Total size of every file in the Skill folder">
                <UIcon name="i-lucide-package" class="size-3.5" aria-hidden="true" />
                {{ formatByteSize(contextCost.totalBytes) }}
              </span>
            </li>
            <li v-if="licenseLabel">
              <button
                v-if="licenseFile"
                type="button"
                class="skill-chip skill-chip-link"
                :title="`License: ${data.license}. Opens ${licenseFile}.`"
                @click="() => { void resolveAndOpen(licenseFile!) }"
              >
                <UIcon name="i-lucide-scale" class="size-3.5" aria-hidden="true" />
                {{ licenseLabel }}
              </button>
              <span
                v-else
                class="skill-chip"
                :title="`License: ${data.license}`"
              >
                <UIcon name="i-lucide-scale" class="size-3.5" aria-hidden="true" />
                {{ licenseLabel }}
              </span>
            </li>
            <li v-if="data.provenance?.modifiedAt || data.pushedAt">
              <span
                class="skill-chip"
                :title="formatDateTitle(skillUpdatedDate)"
                data-allow-mismatch="text"
              >
                <UIcon name="i-lucide-clock" class="size-3.5" aria-hidden="true" />
                Updated {{ skillUpdatedAgo }}
              </span>
            </li>
            <li v-if="skillFileUrl && !data.sourceGone">
              <a
                :href="skillFileUrl"
                target="_blank"
                rel="noopener"
                class="skill-chip skill-chip-link"
                title="View SKILL.md on GitHub"
              >
                <UIcon name="i-lucide-github" class="size-3.5" aria-hidden="true" />
                GitHub
              </a>
            </li>
            <li v-if="auditOverview">
              <a
                href="#third-party-checks"
                class="skill-chip skill-chip-link"
                :class="AUDIT_TONE_CLASS[auditOverview.tone]"
                :title="`Third-party checks: ${auditOverview.label} · ${auditOverview.detail}`"
                @click="checksOpen = true"
              >
                <UIcon :name="auditOverview.icon" class="size-3.5" aria-hidden="true" />
                {{ auditOverview.label }}
              </a>
            </li>
          </ul>

          <section
            v-if="(data.resolutionStatus && data.resolutionStatus !== 'ok') || data.sourceGone"
            class="mt-6"
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
                    variant="outline"
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
        </div>
      </template>
    </section>

    <template v-if="data && status !== 'pending'">
      <USeparator />

      <!-- The header width, like Related: the demo answers the header question, not the file viewer one. -->
      <div v-if="data.demo" class="mx-auto max-w-5xl px-4 pt-6 sm:px-6 md:pt-8">
        <SkillDemo :demo="data.demo" :on-board="!runFlag && !data.demo.skillPageOnly" />
      </div>

      <!-- The two command blocks are breakpoint twins, so neither can hold the anchor. -->
      <div id="run" class="scroll-mt-24" />
      <div
        v-if="!data.sourceGone"
        class="pt-6 lg:hidden"
        :class="SKILL_CONTAINER"
      >
        <SkillCommandPanel
          v-model="commandMode"
          :run-url="runUrl"
          :install-command="installCmd"
          :run-copied="copied"
          :install-copied="installCopied"
          :copy-error="commandCopyError"
          :run-flag="runFlag"
          :source-url="skillFileUrl || githubUrl"
          @copy="copySkillCommand"
        />
      </div>

      <div
        class="skill-layout py-8 md:py-10"
        :class="hasExplorer ? SKILL_CONTAINER : ['mx-auto max-w-5xl px-4 sm:px-6', 'skill-layout--solo']"
      >
        <aside
          class="skill-rail scroll-fancy hidden space-y-8 lg:block"
          aria-label="Run and install"
        >
          <section v-if="!data.sourceGone" aria-label="Run or install">
            <SkillCommandPanel
              v-model="commandMode"
              layout="stacked"
              :zip-name="data.skillPath ? `${data.name}.zip` : undefined"
              :zip-state="zipState"
              :run-url="runUrl"
              :install-command="installCmd"
              :run-copied="copied"
              :install-copied="installCopied"
              :copy-error="commandCopyError"
              :run-flag="runFlag"
              :source-url="skillFileUrl || githubUrl"
              @download="downloadSkillZip"
              @copy="copySkillCommand"
            />
          </section>

          <section
            v-if="hasExplorer"
            class="hidden lg:block xl:hidden"
            aria-labelledby="files-heading"
          >
            <div class="mb-2 flex items-baseline justify-between gap-2">
              <h2
                id="files-heading"
                class="section-label"
              >
                Files
              </h2>
              <span
                v-if="contextCost"
                class="data-label"
              >{{ contextCost.fileCount }} {{ contextCost.fileCount === 1 ? 'file' : 'files' }} · {{ formatByteSize(contextCost.totalBytes) }}</span>
            </div>
            <div class="rounded-lg border border-default p-1.5">
              <SkillFileTree
                :assets="treeAssets"
                :owner="data.owner"
                :repo="data.repo"
                :name="data.name"
                :registry-path="data.registryPath"
                :branch="data.branch"
                :skill-path="data.skillPath"
                :skill-md-size="skillMdBytes"
                :active-path="activeDocPath"
                @select="(p) => { void resolveAndOpen(p) }"
              />
              <p v-if="treeAssetCount > treeAssets.length" class="px-2 pt-2 font-mono text-[10px] text-muted">
                Showing {{ treeAssets.length.toLocaleString() }} of {{ treeAssetCount.toLocaleString() }} files.
              </p>
            </div>
          </section>

          <section
            v-if="behaviors.length"
            class="hidden lg:block"
            aria-labelledby="rail-behaviors-heading"
          >
            <h2
              id="rail-behaviors-heading"
              class="section-label mb-2"
            >
              Skill behaviors
            </h2>
            <ul
              role="list"
              class="flex flex-wrap gap-1.5"
            >
              <li
                v-for="behavior in behaviors"
                :key="behavior.id"
                class="skill-chip"
              >
                <UIcon
                  :name="behaviorIcon(behavior)"
                  :class="behavior.tier === 'ask' ? 'text-warning' : undefined"
                  class="size-3.5"
                  aria-hidden="true"
                />
                {{ behavior.label }}
                <span
                  v-if="behavior.tier === 'ask'"
                  class="sr-only"
                >, needs approval</span>
              </li>
            </ul>
            <a
              href="#skill-behaviors"
              class="data-label mt-2 inline-flex min-h-6 items-center gap-1 transition-colors hover:text-default"
            >
              Where each one appears
              <UIcon
                name="i-lucide-arrow-down"
                class="size-3"
                aria-hidden="true"
              />
            </a>
          </section>
        </aside>

        <aside
          class="skill-explorer scroll-fancy space-y-8"
          aria-label="Files and history"
        >
          <section
            v-if="hasExplorer"
            class="hidden xl:block"
            aria-labelledby="explorer-heading"
          >
            <div class="mb-2 flex items-baseline justify-between gap-2">
              <h2
                id="explorer-heading"
                class="section-label"
              >
                Files
              </h2>
              <span
                v-if="contextCost"
                class="data-label"
              >{{ contextCost.fileCount }} {{ contextCost.fileCount === 1 ? 'file' : 'files' }} · {{ formatByteSize(contextCost.totalBytes) }}</span>
            </div>
            <div class="rounded-lg border border-default p-1.5">
              <SkillFileTree
                :assets="treeAssets"
                :owner="data.owner"
                :repo="data.repo"
                :name="data.name"
                :registry-path="data.registryPath"
                :branch="data.branch"
                :skill-path="data.skillPath"
                :skill-md-size="skillMdBytes"
                :active-path="activeDocPath"
                @select="(p) => { void resolveAndOpen(p) }"
              />
              <p v-if="treeAssetCount > treeAssets.length" class="px-2 pt-2 font-mono text-[10px] text-muted">
                Showing {{ treeAssets.length.toLocaleString() }} of {{ treeAssetCount.toLocaleString() }} files.
              </p>
            </div>
          </section>
          <section
            ref="historySlot"
            aria-labelledby="history-heading"
            :aria-busy="relatedLoading || undefined"
          >
            <h2
              id="history-heading"
              class="section-label mb-3"
            >
              History
            </h2>
            <ol
              v-if="relatedLoading"
              class="divide-y divide-default rounded-lg border border-default"
              aria-label="Loading recent commits"
            >
              <li
                v-for="n in 3"
                :key="n"
                class="flex items-start gap-2.5 px-3 py-2.5"
              >
                <USkeleton class="size-5 shrink-0 rounded-full mt-0.5" />
                <div class="min-w-0 flex-1 space-y-1.5">
                  <USkeleton class="h-3.5 w-4/5" />
                  <USkeleton class="h-3 w-1/3" />
                </div>
              </li>
            </ol>
            <div
              v-else-if="relatedError"
              class="rounded-lg border border-default px-3 py-3"
              role="alert"
            >
              <p class="text-xs text-muted">
                Couldn't load recent commits. Check your connection and try again.
              </p>
              <UButton
                label="Retry"
                color="neutral"
                variant="outline"
                size="xs"
                class="mt-2"
                @click="retryRelated"
              />
            </div>
            <p
              v-else-if="!recentCommits.length"
              class="text-xs text-muted"
            >
              No recent commits found for this file.
            </p>
            <ol
              v-else
              class="divide-y divide-default rounded-lg border border-default"
            >
              <li
                v-for="commit in recentCommits"
                :key="commit.sha"
                class="flex items-start gap-2.5 px-3 py-2.5"
              >
                <img
                  v-if="commit.authorAvatar"
                  :src="avatarProxyUrl(commit.authorAvatar)"
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
        </aside>

        <div class="skill-main min-w-0 space-y-10 md:space-y-12">
          <section
            v-if="data.contentHtml"
            ref="viewerSection"
            class="scroll-mt-20"
            aria-labelledby="content-heading"
          >
            <div class="skill-viewer-bar">
              <SkillFileIcon
                :name="fileIcon(viewerCrumbs.at(-1) ?? 'SKILL.md')"
                class="size-4 shrink-0"
              />
              <h2
                id="content-heading"
                class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-xs"
              >
                <button
                  type="button"
                  class="skill-crumb-root inline-flex min-h-6 min-w-0 items-center text-muted transition-colors hover:text-default"
                  :aria-label="`Open SKILL.md of ${data.name}`"
                  @click="() => { void resolveAndOpen('SKILL.md') }"
                >
                  {{ data.name }}
                </button>
                <template
                  v-for="(crumb, index) in viewerCrumbs"
                  :key="index"
                >
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3 shrink-0 text-dimmed"
                    aria-hidden="true"
                  />
                  <span
                    class="min-w-0 truncate"
                    :class="index === viewerCrumbs.length - 1 ? 'skill-crumb-file text-default' : 'text-muted'"
                  >{{ crumb }}</span>
                </template>
              </h2>
              <span
                v-if="viewerFileSize !== null"
                class="hidden shrink-0 font-mono text-xs text-muted tabular-nums sm:inline"
              >
                {{ formatByteSize(viewerFileSize) }}
              </span>
              <button
                v-if="!isNonMarkdownDoc"
                type="button"
                class="skill-viewer-action inline-flex"
                :aria-pressed="contentView === 'markdown'"
                @click="contentView = contentView === 'preview' ? 'markdown' : 'preview'"
              >
                <UIcon
                  name="i-lucide-code"
                  class="size-3.5"
                  aria-hidden="true"
                />
                <span class="sr-only sm:not-sr-only">source</span>
              </button>
              <button
                v-if="currentRaw"
                type="button"
                class="skill-viewer-action inline-flex"
                :aria-label="markdownCopied ? `${currentDocLabel} copied` : `Copy ${currentDocLabel}`"
                @click="copyMarkdown(currentRaw)"
              >
                <UIcon
                  :name="markdownCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                  class="size-3.5"
                  aria-hidden="true"
                />
                <span class="hidden sm:inline">{{ markdownCopied ? 'copied' : 'copy' }}</span>
              </button>
              <a
                v-if="currentRaw && !data.sourceGone"
                :href="rawSourceUrl"
                target="_blank"
                rel="noopener"
                class="skill-viewer-action hidden sm:inline-flex"
              >
                <UIcon
                  name="i-lucide-file-text"
                  class="size-3.5"
                  aria-hidden="true"
                />
                raw
              </a>
              <UPopover
                v-if="hasExplorer"
                v-model:open="filesPopoverOpen"
                :content="{ align: 'end', sideOffset: 6 }"
              >
                <button
                  type="button"
                  class="skill-viewer-action inline-flex lg:hidden"
                  :aria-label="`Browse ${treeAssets.length + 1} files`"
                >
                  <UIcon
                    name="i-lucide-folder-tree"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ treeAssets.length + 1 }}
                </button>
                <template #content>
                  <div class="max-h-[60vh] w-72 overflow-y-auto p-2">
                    <SkillFileTree
                      :assets="treeAssets"
                      :owner="data.owner"
                      :repo="data.repo"
                      :name="data.name"
                      :registry-path="data.registryPath"
                      :branch="data.branch"
                      :skill-path="data.skillPath"
                      :skill-md-size="skillMdBytes"
                      :active-path="activeDocPath"
                      @select="(p) => { filesPopoverOpen = false; void resolveAndOpen(p) }"
                    />
                  </div>
                </template>
              </UPopover>
            </div>

            <div class="skill-viewer-body">
              <p
                v-if="viewerContext"
                class="skill-context-strip"
              >
                <UIcon
                  name="i-lucide-layers"
                  class="size-3.5 shrink-0 text-[var(--syntax-arg)]"
                  aria-hidden="true"
                />
                <span v-if="viewerContext._tag === 'skill'">
                  <strong>{{ formatTokenCount(viewerContext.cost.tokens.metadata) }}</strong> tokens always: the name and description.
                  <strong>{{ formatTokenCount(viewerContext.cost.tokens.instructions) }}</strong> when used: this file.
                  <template v-if="viewerContext.cost.resourceFileCount">
                    <strong>{{ formatTokenCount(viewerContext.cost.tokens.resources) }}</strong> more on demand in {{ viewerContext.cost.resourceFileCount }} {{ viewerContext.cost.resourceFileCount === 1 ? 'file' : 'files' }}.
                  </template>
                </span>
                <span v-else-if="viewerContext._tag === 'resource'">
                  <strong>{{ formatTokenCount(viewerContext.tokens) }}</strong> tokens on demand. Your agent reads this file only when SKILL.md points to it.
                </span>
                <span v-else-if="viewerContext._tag === 'script'">
                  Your agent runs this script. Only its output enters context.
                </span>
                <span v-else>
                  Your agent does not load this file into context unless it opens it.
                </span>
              </p>
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
              <div
                v-show="contentView === 'markdown'"
                class="skill-markdown"
                :class="{ 'skill-markdown-wrap': !isNonMarkdownDoc }"
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
            </div>

            <p v-if="!data.sourceGone" class="mt-3 text-xs text-muted">
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

          <div
            class="grid gap-x-10 gap-y-10 border-t border-default pt-10 md:grid-cols-2"
            aria-label="About this Skill"
            role="region"
          >
            <SkillBehaviors
              v-if="data.raw || behaviors.length"
              :behaviors="behaviors"
            />
            <SkillThirdPartyChecks
              v-model:open="checksOpen"
              :audits="audits"
            />
            <SkillReceiptsPanel
              v-if="data.provenance"
              :provenance="data.provenance"
              :verified-summary="verifiedSummary"
              :maturity="maturity"
            />
            <section
              v-if="capabilitySummary || skillModel || frontmatterEntries.visible.length || frontmatterEntries.other.length"
              class="md:col-span-2"
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
                    :to="tag.path"
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
                  <span
                    class="inline-flex items-center gap-1 rounded-md border border-dashed border-default px-2 py-1 font-mono text-xs text-muted"
                  >
                    <UIcon
                      name="i-lucide-hash"
                      class="size-3"
                      aria-hidden="true"
                    />
                    {{ kw }}
                  </span>
                </li>
              </ul>
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
              v-if="badgeInput"
              class="md:col-span-2 border-t border-default pt-4 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100"
              aria-labelledby="readme-badge-heading"
            >
              <h2 id="readme-badge-heading" class="sr-only">
                README badge
              </h2>
              <BadgeEmbedControl
                v-bind="badgeInput"
                :trending-award="trendingAward"
              />
            </section>
          </div>

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
      </div>
    </template>
  </div>

  <template v-if="data && !error">
    <USeparator />
    <section
      ref="relatedSlot"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="related-heading"
      :aria-busy="relatedLoading || undefined"
    >
      <h2
        id="related-heading"
        class="section-label mb-4"
      >
        Related skills
      </h2>
      <div
        v-if="relatedLoading"
        role="status"
        aria-label="Loading related skills"
      >
        <div class="mb-4 flex gap-4 border-b border-default pb-2">
          <USkeleton class="h-4 w-16" />
          <USkeleton class="h-4 w-24" />
        </div>
        <ul class="grid list-none gap-3 p-0 sm:grid-cols-2">
          <li
            v-for="n in 6"
            :key="n"
            class="flex items-start gap-3 rounded-(--ui-radius) border border-default p-4"
          >
            <USkeleton class="size-6 shrink-0 rounded-md" />
            <div class="min-w-0 flex-1 space-y-2">
              <USkeleton class="h-4 w-1/2" />
              <USkeleton class="h-3 w-1/3" />
              <USkeleton class="h-3 w-full" />
              <USkeleton class="h-3 w-4/5" />
            </div>
          </li>
        </ul>
      </div>
      <div
        v-else-if="relatedError"
        class="editorial-state"
        role="alert"
      >
        <p class="font-medium">
          Couldn't load related skills.
        </p>
        <p class="mt-1 text-sm text-muted">
          Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 min-h-11"
          @click="retryRelated"
        />
      </div>
      <div
        v-else-if="!relatedTabsAvailable.length"
        class="editorial-state"
      >
        <p class="font-medium">
          No related skills yet.
        </p>
        <p class="mt-1 text-sm text-muted">
          Browse the registry to find skills for the same job.
        </p>
        <UButton
          label="Browse skills"
          to="/skills"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 min-h-11"
        />
      </div>
      <template v-else>
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
      </template>
    </section>
  </template>
</template>

<style scoped>
/* Components layer, so Tailwind utilities on the same element (a tone colour,
   `hidden`) still win. Unlayered scoped CSS would beat every utility. */
@layer components {
  .skill-description {
    position: relative;
  }

  /* Fades the clamped line out under the toggle, so the ellipsis and the
     label never overlap. */
  .skill-description__more {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    padding-inline-start: 2.5rem;
    background: linear-gradient(to right, transparent, var(--ui-bg) 2rem);
  }

  .skill-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 1.5rem;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: color-mix(in oklch, var(--ui-bg-muted) 50%, transparent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--ui-text-muted);
    white-space: nowrap;
  }
  .skill-chip-link {
    transition: color 200ms, border-color 200ms;
  }
  .skill-chip-link:hover {
    color: var(--ui-text);
    border-color: var(--ui-border-accented);
  }
  /* The solid xs badge set 10px text on rose. This keeps the accent and reads
     at chip size. */
  .skill-official,
  .skill-award {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid color-mix(in oklch, var(--syntax-arg) 35%, transparent);
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.25rem;
    color: var(--syntax-arg);
  }
  .skill-award {
    font-variant-numeric: tabular-nums;
    transition: border-color 150ms ease;
  }
  .skill-award:hover {
    border-color: var(--syntax-arg);
  }
  .skill-sha {
    color: var(--syntax-arg);
  }
  .skill-context-strip {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ui-border);
    background: color-mix(in oklch, var(--ui-bg-muted) 40%, transparent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--ui-text-muted);
  }
  .skill-context-strip strong {
    font-weight: 500;
    color: var(--ui-text);
  }
  .skill-context-strip > .iconify,
  .skill-context-strip > svg {
    transform: translateY(0.125rem);
  }

  .skill-viewer-bar {
    position: sticky;
    top: 4rem;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
    border: 1px solid var(--ui-border);
    border-radius: 8px 8px 0 0;
    background: var(--ui-bg);
  }
  /* Desktop puts the Skill in the middle: files and history on the left from
     xl, and a slim rail on the right with only what a visitor acts on.
     History is one element, placed per breakpoint: after the Skill on small
     screens, under it from lg, and under the files from xl. */
  .skill-layout {
    display: flex;
    flex-direction: column;
  }
  .skill-main {
    order: 1;
  }
  .skill-explorer {
    order: 2;
    margin-top: 2.5rem;
  }
  @media (min-width: 1024px) {
    .skill-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 20rem;
      column-gap: 2.5rem;
      align-items: start;
    }
    .skill-main {
      grid-column: 1;
      grid-row: 1;
    }
    .skill-explorer {
      grid-column: 1;
      grid-row: 2;
    }
    .skill-rail {
      grid-column: 2;
      grid-row: 1 / span 2;
      position: sticky;
      top: 5rem;
      max-height: calc(100vh - 6rem);
      overflow-y: auto;
    }
  }
  @media (min-width: 1280px) {
    .skill-layout {
      grid-template-columns: 16rem minmax(0, 56rem) 20rem;
      justify-content: space-between;
      column-gap: 3rem;
    }
    .skill-layout--solo {
      grid-template-columns: minmax(0, 1fr) 20rem;
    }
    .skill-layout:not(.skill-layout--solo) .skill-explorer {
      grid-column: 1;
      grid-row: 1;
      margin-top: 0;
      position: sticky;
      top: 5rem;
      max-height: calc(100vh - 6rem);
      overflow-y: auto;
    }
    .skill-layout:not(.skill-layout--solo) .skill-main {
      grid-column: 2;
    }
    .skill-layout:not(.skill-layout--solo) .skill-rail {
      grid-column: 3;
      grid-row: 1;
    }
  }

  /* Folders give up their width first; the file name truncates last. */
  .skill-crumb-file {
    flex-shrink: 0.05;
  }
  .skill-crumb-root {
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.5rem;
  }
  @media (pointer: coarse) {
    .skill-viewer-action {
      min-height: 2.75rem;
    }
  }
  .skill-viewer-action {
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
    min-height: 2rem;
    padding: 0 0.5rem;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ui-text-muted);
    transition: color 200ms, background-color 200ms;
  }
  .skill-viewer-action:hover,
  .skill-viewer-action[aria-pressed='true'] {
    color: var(--ui-text);
    background: var(--ui-bg-muted);
  }
  .skill-viewer-body {
    border: 1px solid var(--ui-border);
    border-top: 0;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }
  /* Prose source reads top to bottom; a sideways scrollbar at the end of a long
     file is out of reach. Code keeps its line breaks and scrolls instead. */
  .skill-markdown-wrap :deep(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .skill-viewer-body > .skill-markdown :deep(.shiki),
  .skill-viewer-body > .skill-markdown :deep(pre) {
    border: 0;
    border-radius: 0;
    margin: 0;
  }
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
