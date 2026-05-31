<script setup lang="ts">
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
  installs: number
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
  installs: number
  score: number
}

interface DuplicateSkill {
  name: string
  owner: string
  repo: string
  displayName: string
  installs: number
  stars: number
  slug: string
  supportTier: string | null
  trustTier: string | null
}

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch(
  () => `/api/skills/${slug.value}`,
  { watch: [slug], lazy: !isBot.value, immediate: true },
) as ReturnType<typeof useFetch<{
  content: string | null
  contentHtml: string | null
  frontmatter: Record<string, unknown> | null
  raw: string | null
  assets: { path: string, size: number, type: 'markdown' | 'code' | 'image' | 'data' | 'other' }[]
  curators: { did: string, handle: string, displayName?: string, avatar?: string, collectionName: string, collectionSlug: string, reason?: string }[]
  url: string
  repo: string
  owner: string
  name: string
  displayName: string
  installs: number
  githubUrl: string
  description: string | null
  stars: number
  forks: number
  pushedAt: string | null
  createdAt: string | null
  maturity: { ageDays: number, sinceUpdateDays: number, cadence: 'active' | 'steady' | 'dormant' } | null
  branch: string
  skillPath: string | null
  resolutionStatus: 'ok' | 'path_missing' | 'fetch_failed'
  tier: 'official-org' | 'official-user' | 'community'
  sourceFacts: SourceFacts
  tags: SkillTag[]
  keywords: string[]
  faqs: FaqItem[]
  summary: SkillSummary | null
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
    reason: 'duplicate_description' | 'duplicate_title'
    canonical: DuplicateSkill
    isCanonical: boolean
    siblings: DuplicateSkill[]
  } | null
}>>

const { data: relatedData, refresh: refreshRelated } = useFetch(
  () => `/api/skill-related/${slug.value}`,
  { watch: [slug], lazy: !isBot.value, immediate: true },
) as ReturnType<typeof useFetch<{
  commits: SkillCommit[]
  relatedRepoSkills: RelatedSkill[]
  relatedOwnerSkills: RelatedSkill[]
  coOccurrenceSkills: NeighborSkill[]
  semanticSiblings: NeighborSkill[]
}>>

watch(slug, () => {
  refresh()
  refreshRelated()
})

interface SkillAudit {
  provider: string
  slug: string
  status: 'pass' | 'warn' | 'fail' | string
  summary?: string
  auditedAt?: string
  riskLevel?: string
}
interface LiveSkill {
  installs: number | null
  formatted: string | null
  audits: SkillAudit[]
  fetchedAt: string
}
const liveId = computed(() =>
  data.value ? `${data.value.owner}/${data.value.repo}/${data.value.name}` : null,
)
const { data: liveSkill } = useAsyncData<LiveSkill | null>(
  () => `skill-live:${liveId.value ?? 'none'}`,
  async () => liveId.value ? $fetch<LiveSkill>(`/api/skill-live/${liveId.value}`) : null,
  {
    watch: [liveId],
    server: false,
    lazy: true,
    default: () => null,
  },
)

const { data: skillFiles } = useFetch(
  () => `/api/skill-files/${slug.value}`,
  { watch: [slug], lazy: true, server: false, immediate: true, default: () => null },
) as ReturnType<typeof useFetch<{
  skillPath: string | null
  branch: string
  files: { path: string, size: number, type: 'markdown' | 'code' | 'image' | 'data' | 'other' }[]
} | null>>

// Prefer the live ungh-walked file list when available (catches markdown
// siblings the sync job hasn't registered yet); fall back to data.assets.
const treeAssets = computed(() => {
  const live = skillFiles.value?.files
  if (live && live.length)
    return live
  return data.value?.assets ?? []
})

const displayInstalls = computed(() => liveSkill.value?.installs ?? data.value?.installs ?? 0)
const audits = computed<SkillAudit[]>(() => liveSkill.value?.audits ?? [])

const { copy: copyMarkdown, copied: markdownCopied } = useClipboard()

const installCmd = computed(() => {
  if (!data.value)
    return ''
  return gitInstallCmd(data.value.owner, data.value.repo, data.value.name)
})

const skillsShCmd = computed(() => {
  if (!data.value)
    return ''
  return skillsShInstallCmd(data.value.owner, data.value.repo, data.value.name)
})

const installerTab = ref<'skilld' | 'skills'>('skilld')

const installCmdActive = computed(() =>
  installerTab.value === 'skilld' ? installCmd.value : skillsShCmd.value,
)

const { copy, copied } = useInstallCopy(
  installCmdActive,
  'skill-page-hero',
  () => ({ kind: 'skill', owner: data.value?.owner ?? '', name: data.value?.name ?? '' }),
)

const githubUrl = computed(() => data.value?.githubUrl ?? '')
const skillsShUrl = computed(() => data.value?.url ?? '')

const HIDDEN_FRONTMATTER_KEYS = new Set(['name', 'description'])

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
    return []
  return Object.entries(fm)
    .filter(([k, v]) => !HIDDEN_FRONTMATTER_KEYS.has(k) && k !== 'allowed-tools' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({ key: k, value: formatFrontmatterValue(v), complex: isComplexValue(v) }))
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
const rawError = ref<string | null>(null)

import { shikiLangFromPath } from '../utils/skill-file-tree'

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
  try {
    const { codeToHtml } = await import('shiki')
    const lang = activeDocPath.value ? shikiLangFromPath(activeDocPath.value) : 'markdown'
    rawHtml.value = await codeToHtml(raw, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    })
  }
  catch (err) {
    rawError.value = err instanceof Error ? err.message : 'Failed to render markdown'
  }
}

watch([contentView, currentRaw], ([view, raw], [, prevRaw]) => {
  if (raw !== prevRaw) {
    rawHtml.value = null
    rawError.value = null
  }
  if (!import.meta.client || view !== 'markdown' || !raw || rawHtml.value)
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

const installerTabs = [
  { label: 'skilld', value: 'skilld' },
  { label: 'skills.sh', value: 'skills' },
]

const relatedTab = ref<string>('repo')

const relatedTabsAvailable = computed<{ label: string, value: string, items: NeighborSkill[] | RelatedSkill[] }[]>(() => {
  const tabs: { label: string, value: string, items: NeighborSkill[] | RelatedSkill[] }[] = []
  const repoItems = relatedData.value?.relatedRepoSkills ?? []
  const paired = relatedData.value?.coOccurrenceSkills ?? []
  const similar = relatedData.value?.semanticSiblings ?? []
  const ownerItems = relatedData.value?.relatedOwnerSkills ?? []
  if (repoItems.length)
    tabs.push({ label: `From ${data.value?.owner ?? ''}/${data.value?.repo ?? ''}`, value: 'repo', items: repoItems })
  if (paired.length)
    tabs.push({ label: 'Paired with', value: 'paired', items: paired })
  if (similar.length)
    tabs.push({ label: 'Similar', value: 'similar', items: similar })
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
    return { ...c, relative: useTimeAgo(d).value, absolute: formatDateTitle(d) }
  })
})

const recentCommits = computed(() => commitsWithAgo.value.slice(0, 4))

function truncateReason(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max)
    return collapsed
  return `${collapsed.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

defineOgImage('Skill.takumi', {
  name: () => data.value?.name ?? '',
  owner: () => data.value?.owner ?? '',
  repo: () => data.value?.repo ?? 'skills',
  curatorCount: () => 0,
  reason: () => '',
  reasonHandle: () => '',
}, {
  alt: () => `${data.value?.name ?? 'Skill'} by ${data.value?.owner ?? ''} on skilld`,
})

const siteOrigin = 'https://skilld.dev'
const skillPagePath = computed(() => data.value ? repoSkillPath(data.value.owner, data.value.repo, data.value.name) : '')
const skillPageUrl = computed(() => `${siteOrigin}${skillPagePath.value}`)
const duplicateGroup = computed(() => data.value?.duplicateGroup ?? null)
const isWeakerDuplicate = computed(() => Boolean(duplicateGroup.value && !duplicateGroup.value.isCanonical))
const canonicalSkillPagePath = computed(() => {
  const canonical = duplicateGroup.value?.canonical
  return canonical ? repoSkillPath(canonical.owner, canonical.repo, canonical.name) : skillPagePath.value
})
const canonicalSkillPageUrl = computed(() => {
  return `${siteOrigin}${canonicalSkillPagePath.value}`
})
const duplicateReasonLabel = computed(() => {
  return duplicateGroup.value?.reason === 'duplicate_description'
    ? 'same skill description'
    : 'same skill name'
})

function withSourceContext(text: string, owner: string, repo: string, max = 200): string {
  const suffix = ` From ${owner}/${repo}.`
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.includes(`${owner}/${repo}`))
    return truncateReason(collapsed, max)
  if (collapsed.length + suffix.length <= max)
    return `${collapsed}${suffix}`
  return `${truncateReason(collapsed, Math.max(40, max - suffix.length))}${suffix}`
}

useSchemaOrg(computed(() => {
  if (!data.value)
    return []
  const d = data.value
  const description = withSourceContext(d.description || `${d.name} Claude Code skill by ${d.owner}.`, d.owner, d.repo, 240)
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
      '@id': `${skillPageUrl.value}#install`,
      'name': `Install ${d.name} with skilld`,
      'description': `Install the ${d.name} skill into Claude Code.`,
      'totalTime': 'PT1M',
      'step': [
        {
          '@type': 'HowToStep',
          'name': 'Run the install command',
          'text': gitInstallCmd(d.owner, d.repo, d.name),
          'url': `${skillPageUrl.value}#install`,
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
  if (!data.value)
    return 'Skill'
  return `${data.value.name} by ${data.value.owner}`
})

const skillDescription = computed(() => {
  if (!data.value)
    return 'View skill details on skilld.'
  const base = data.value.summary?.text
    || data.value.description
    || `${data.value.name} skill by ${data.value.owner}. Install with: ${installCmd.value}`
  return withSourceContext(base, data.value.owner, data.value.repo)
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
              :to="repoHubPath(data.owner, data.repo)"
              class="shrink-0"
              :aria-label="`${data.owner}/${data.repo} repository`"
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
                  title="Published by the org behind this technology"
                />
              </div>
              <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-muted">
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
                  title="Repository stars on GitHub"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ data.stars.toLocaleString() }}
                </span>
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
              </p>
            </div>
          </div>
          <p
            v-if="data.description"
            class="mt-3 text-sm text-muted leading-relaxed line-clamp-3"
          >
            {{ data.description }}
          </p>

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
                based on the {{ duplicateReasonLabel }}.
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
            <span
              v-if="displayInstalls > 0"
              class="data-label inline-flex items-center gap-1"
              :title="liveSkill?.fetchedAt ? `Weekly installs from skills.sh — refreshed ${formatDateTitle(liveSkill.fetchedAt)}` : 'Weekly installs from skills.sh'"
            >
              <UIcon
                name="i-lucide-trending-up"
                class="size-3.5"
                aria-hidden="true"
              />
              {{ liveSkill?.formatted ?? displayInstalls.toLocaleString() }}/wk
            </span>
            <span
              v-if="data.pushedAt"
              class="data-label inline-flex items-center gap-1"
              :title="formatDateTitle(data.pushedAt)"
            >
              <UIcon
                name="i-lucide-clock"
                class="size-3.5"
                aria-hidden="true"
              />
              Updated {{ pushedAtAgo }}
            </span>
            <a
              v-if="data.provenance"
              href="#receipts"
              class="data-label inline-flex items-center gap-1 hover:text-default transition-colors"
              title="View trust signals: audits, signed commits, source provenance"
            >
              <UIcon
                name="i-lucide-shield-check"
                class="size-3.5"
                aria-hidden="true"
              />
              Trust
            </a>
          </div>

          <div
            v-if="data.tags.length || data.keywords?.length"
            class="flex flex-wrap gap-1.5"
          >
            <NuxtLink
              v-for="tag in data.tags"
              :key="tag.slug"
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
            <NuxtLink
              v-for="kw in data.keywords"
              :key="`kw-${kw}`"
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
          </div>
        </div>
      </template>
    </section>

    <template v-if="data && status !== 'pending'">
      <USeparator />

      <div class="mx-auto max-w-5xl px-4 sm:px-6 pt-6 lg:hidden">
        <h2 class="section-label mb-2">
          Install
        </h2>
        <div class="rounded-lg border border-default p-4 space-y-3">
          <UTabs
            v-model="installerTab"
            :items="installerTabs"
            :content="false"
            color="neutral"
            variant="link"
            size="xs"
            :ui="{ list: 'border-b border-default' }"
          />
          <div class="flex items-center gap-2">
            <code class="flex-1 truncate rounded-lg border border-default bg-muted px-3 py-2 font-mono text-sm">
              {{ installCmdActive }}
            </code>
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              color="neutral"
              variant="outline"
              size="sm"
              :aria-label="copied ? 'Copied' : 'Copy install command'"
              @click="copy(installCmdActive)"
            />
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 border-t border-default">
            <UButton
              :href="githubUrl"
              target="_blank"
              rel="noopener"
              label="GitHub"
              icon="i-lucide-github"
              size="xs"
              color="neutral"
              variant="ghost"
            />
            <UButton
              :href="skillsShUrl"
              target="_blank"
              rel="noopener"
              label="skills.sh"
              icon="i-lucide-external-link"
              size="xs"
              color="neutral"
              variant="ghost"
            />
            <UButton
              :href="`/api/skills-raw/${slug}`"
              target="_blank"
              rel="noopener"
              label="Raw"
              icon="i-lucide-file-text"
              size="xs"
              color="neutral"
              variant="ghost"
            />
            <AddToCollection :owner="data.owner" :repo="data.repo" :name="data.name" />
          </div>
        </div>
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
              <UButton
                v-if="currentRaw"
                :icon="markdownCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="shrink-0"
                :aria-label="markdownCopied ? `${currentDocLabel} copied` : `Copy ${currentDocLabel}`"
                @click="copyMarkdown(currentRaw)"
              >
                {{ markdownCopied ? 'Copied' : 'Copy markdown' }}
              </UButton>
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
                    @click="currentRaw && renderRaw(currentRaw)"
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
            v-if="data.resolutionStatus && data.resolutionStatus !== 'ok'"
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
                  {{ data.resolutionStatus === 'path_missing' ? 'SKILL.md not found in source repository' : 'Could not load SKILL.md' }}
                </p>
                <p class="mt-1 text-muted">
                  The skill is still in the registry with {{ data.installs.toLocaleString() }} installs, but the source file isn't where the registry expects it. The repo may have been restructured or the skill removed.
                </p>
                <UButton
                  :href="data.githubUrl"
                  target="_blank"
                  rel="noopener"
                  label="Browse repository"
                  icon="i-simple-icons-github"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  class="mt-3"
                />
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
            <p class="mt-4 text-xs text-muted">
              Generated from this skill's SKILL.md.
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
            <p class="mt-3 text-xs text-muted">
              Generated from the skill's SKILL.md. Refreshed when the source changes.
            </p>
          </section>
        </div>

        <aside
          class="mt-10 lg:mt-0 lg:col-span-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 scroll-fancy space-y-6"
          aria-label="Install and metadata"
        >
          <section
            class="hidden lg:block"
            aria-labelledby="rail-install-heading"
          >
            <h2
              id="rail-install-heading"
              class="section-label mb-2"
            >
              Install
            </h2>
            <div class="rounded-lg border border-default p-4 space-y-3">
              <UTabs
                v-model="installerTab"
                :items="installerTabs"
                :content="false"
                color="neutral"
                variant="link"
                size="xs"
                :ui="{ list: 'border-b border-default' }"
              />
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-md border border-default bg-muted px-2 py-1.5 font-mono text-xs">
                  {{ installCmdActive }}
                </code>
                <UButton
                  :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :aria-label="copied ? 'Copied' : 'Copy install command'"
                  @click="copy(installCmdActive)"
                />
              </div>
              <div style="min-height:1.75rem">
                <WatchSkillButton :owner="data.owner" :repo="data.repo" />
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 border-t border-default">
                <UButton
                  :href="githubUrl"
                  target="_blank"
                  rel="noopener"
                  label="GitHub"
                  icon="i-lucide-github"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                />
                <UButton
                  :href="skillsShUrl"
                  target="_blank"
                  rel="noopener"
                  label="skills.sh"
                  icon="i-lucide-external-link"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                />
                <UButton
                  :href="`/api/skills-raw/${slug}`"
                  target="_blank"
                  rel="noopener"
                  label="Raw"
                  icon="i-lucide-file-text"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                />
                <AddToCollection :owner="data.owner" :repo="data.repo" :name="data.name" />
              </div>
            </div>
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
                :to="repoSkillPath(sibling.owner, sibling.repo, sibling.name)"
                class="flex min-w-0 items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                :title="`${sibling.owner}/${sibling.repo} · ${sibling.installs.toLocaleString()} installs`"
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

          <section aria-labelledby="metadata-heading">
            <h2
              id="metadata-heading"
              class="section-label mb-3"
            >
              Metadata
            </h2>
            <dl class="divide-y divide-default rounded-lg border border-default text-sm">
              <div class="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt class="data-label">
                  Description
                </dt>
                <dd class="font-mono text-xs text-muted">
                  {{ data.sourceFacts.description.length }} chars{{ data.sourceFacts.description.source ? ` · ${data.sourceFacts.description.source}` : '' }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt class="data-label">
                  Frontmatter
                </dt>
                <dd class="font-mono text-xs text-muted">
                  {{ data.sourceFacts.frontmatter.present ? `${data.sourceFacts.frontmatter.keys.length} keys` : 'missing' }}
                </dd>
              </div>
              <div
                v-if="allowedTools.length"
                class="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <dt class="data-label">
                  Allowed tools
                </dt>
                <dd class="font-mono text-xs text-muted">
                  {{ allowedTools.length }}
                </dd>
              </div>
              <div
                v-if="!data.sourceFacts.source.resolved || (data.sourceFacts.source.syncStatus && data.sourceFacts.source.syncStatus !== 'ok')"
                class="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <dt class="data-label">
                  Source
                </dt>
                <dd class="inline-flex items-center gap-1.5 font-mono text-xs text-amber-500">
                  <UIcon
                    name="i-lucide-alert-triangle"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ data.sourceFacts.source.syncStatus || data.sourceFacts.source.resolutionStatus }}
                </dd>
              </div>
            </dl>
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
            </div>
          </section>

          <section
            v-if="capabilitySummary || skillModel || frontmatterEntries.length"
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
                v-if="frontmatterEntries.length"
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
                    v-for="entry in frontmatterEntries"
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
            aria-labelledby="changelog-heading"
          >
            <h2
              id="changelog-heading"
              class="section-label mb-3"
            >
              Recent changes
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
                :href="`${data.githubUrl}/commits/${data.branch}/${data.skillPath}`"
                target="_blank"
                rel="noopener"
                class="font-mono hover:text-default transition-colors"
              >
                View full history →
              </a>
            </p>
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
      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="item in currentRelatedItems"
          :key="`${relatedTab}-${item.slug}`"
          :to="repoSkillPath(item.owner, item.repo, item.name)"
          class="group flex items-start gap-3 rounded-lg border border-default p-4 transition-colors hover:border-inverted/30"
        >
          <img
            :src="`https://github.com/${item.owner}.png?size=48`"
            :alt="`${item.owner} avatar`"
            width="24"
            height="24"
            class="size-6 shrink-0 rounded-md border border-default mt-0.5"
          >
          <div class="min-w-0 flex-1">
            <div class="truncate font-mono text-sm">
              /{{ item.name }}
            </div>
            <div class="data-label mt-0.5 truncate">
              {{ item.owner }}{{ item.repo !== 'skills' ? `/${item.repo}` : '' }}
            </div>
            <p
              v-if="item.description"
              class="mt-2 line-clamp-2 text-sm text-muted"
            >
              {{ item.description }}
            </p>
          </div>
        </NuxtLink>
      </div>
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
  color: var(--shiki-light);
  font-style: var(--shiki-light-font-style);
  font-weight: var(--shiki-light-font-weight);
  background: transparent !important;
}
.dark .skill-markdown :deep(.shiki span),
.dark .skill-prose :deep(.shiki span) {
  color: var(--shiki-dark);
  font-style: var(--shiki-dark-font-style);
  font-weight: var(--shiki-dark-font-weight);
}
</style>
