<script setup lang="ts">
const route = useRoute()
const owner = computed(() => String(route.params.owner ?? ''))
const repo = computed(() => String(route.params.repo ?? ''))
const name = computed(() => String(route.params.name ?? ''))
const slug = computed(() => `${owner.value}/${repo.value}/${name.value}`)
const isSourceHub = false

interface RelatedSkill {
  name: string
  owner: string
  repo: string
  displayName: string
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
  tagline: string
  blurb: string
  useCases: string[]
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
  curators: { did: string, handle: string, displayName?: string, avatar?: string, collectionName: string, collectionSlug: string, reason?: string }[]
  url: string
  repo: string
  owner: string
  name: string
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

interface SocialPost {
  id: number
  platform: 'twitter' | 'bsky' | 'reddit'
  postUrl: string
  postId: string
  authorHandle: string
  authorDisplayName: string | null
  authorAvatar: string | null
  role: 'author' | 'community'
  textExtract: string
  title: string | null
  oembedHtml: string | null
  bskyUri: string | null
  bskyCid: string | null
  subreddit: string | null
  redditKind: 'post' | 'comment' | null
  score: number | null
  postedAt: number | null
}

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
const liveId = computed(() =>
  data.value ? `${data.value.owner}/${data.value.repo}/${data.value.name}` : null,
)
const { data: liveSkill } = useFetch(
  () => `/api/skill-live/${liveId.value}`,
  {
    watch: [liveId],
    server: false,
    lazy: true,
    default: () => null,
  },
) as ReturnType<typeof useFetch<{
  installs: number | null
  formatted: string | null
  audits: SkillAudit[]
  fetchedAt: string
} | null>>

const displayInstalls = computed(() => liveSkill.value?.installs ?? data.value?.installs ?? 0)
const audits = computed<SkillAudit[]>(() => liveSkill.value?.audits ?? [])

const { copy: copyMarkdown, copied: markdownCopied } = useClipboard()

const packageName = computed(() => {
  if (!data.value)
    return ''
  return data.value.name
})

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
const createdAtDate = computed(() => data.value?.createdAt ? new Date(data.value.createdAt) : null)
const createdAtAgo = useTimeAgo(computed(() => createdAtDate.value ?? new Date(0)))

const maturity = computed(() => data.value?.maturity ?? null)

const verifiedSummary = computed<{ verified: number, total: number } | null>(() => {
  const list = relatedData.value?.commits ?? []
  if (!list.length)
    return null
  return { verified: list.filter(c => c.verified).length, total: list.length }
})

const provenanceLine = computed<string | null>(() => {
  const d = data.value
  if (!d)
    return null
  const updated = d.pushedAt ? `source updated ${pushedAtAgo.value}` : null
  const v = verifiedSummary.value
  const signed = v ? `${v.verified}/${v.total} recent commits signed` : null
  const tail = [signed, updated].filter(Boolean).join(', ')
  const suffix = tail ? `, ${tail}` : ''
  if (d.tier === 'official-org')
    return `Maintained by the ${d.owner} team${suffix}.`
  if (d.tier === 'official-user')
    return `Maintained by @${d.owner}${suffix}.`
  return `Community skill from ${d.owner}${suffix}.`
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

async function renderRaw(raw: string) {
  rawError.value = null
  try {
    const { codeToHtml } = await import('shiki')
    rawHtml.value = await codeToHtml(raw, {
      lang: 'markdown',
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    })
  }
  catch (err) {
    rawError.value = err instanceof Error ? err.message : 'Failed to render markdown'
  }
}

watch([contentView, () => data.value?.raw], ([view, raw], [, prevRaw]) => {
  if (raw !== prevRaw) {
    rawHtml.value = null
    rawError.value = null
  }
  if (!import.meta.client || view !== 'markdown' || !raw || rawHtml.value)
    return
  renderRaw(raw)
})

const contentTabs = [
  { label: 'Preview', value: 'preview', icon: 'i-lucide-eye' },
  { label: 'Markdown', value: 'markdown', icon: 'i-lucide-file-text' },
]

const compatibleAgents = [
  { label: 'Claude Code' },
  { label: 'Codex' },
  { label: 'Cursor' },
  { label: 'Copilot' },
  { label: 'Gemini CLI' },
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
    return { ...c, relative: useTimeAgo(d).value, absolute: d.toLocaleString() }
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
const skillPagePath = computed(() => data.value ? repoSkillPath(data.value.owner, data.value.repo, data.value.name) : `/gh/${slug.value}`)
const skillPageUrl = computed(() => `${siteOrigin}${skillPagePath.value}`)
const duplicateGroup = computed(() => data.value?.duplicateGroup ?? null)
const isWeakerDuplicate = computed(() => Boolean(duplicateGroup.value && !duplicateGroup.value.isCanonical))
const canonicalSkillPageUrl = computed(() => {
  const canonical = duplicateGroup.value?.canonical
  return canonical ? `${siteOrigin}${repoSkillPath(canonical.owner, canonical.repo, canonical.name)}` : skillPageUrl.value
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
  const tagline = data.value.summary?.tagline
  return tagline ? `${data.value.name} — ${tagline}` : `${data.value.name} by ${data.value.owner}`
})

const skillDescription = computed(() => {
  if (!data.value)
    return 'View skill details on skilld.'
  const base = data.value.summary?.blurb
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
              :to="ownerHubPath(data.owner)"
              class="shrink-0"
              :aria-label="`${data.owner} profile`"
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
                  {{ data.name }}
                </h1>
                <UBadge
                  v-if="data.tier === 'official-org'"
                  label="official"
                  variant="solid"
                  color="primary"
                  size="xs"
                  title="Published by the org behind this technology"
                />
                <UBadge
                  v-else-if="data.tier === 'official-user'"
                  label="maintainer"
                  variant="solid"
                  color="primary"
                  size="xs"
                  title="Published by a recognised individual maintainer"
                />
              </div>
              <p class="mt-1 font-mono text-sm text-muted">
                <NuxtLink
                  :to="repoHubPath(data.owner, data.repo)"
                  class="hover:text-default transition-colors"
                >
                  {{ data.owner }}{{ data.repo !== 'skills' ? `/${data.repo}` : '' }}
                </NuxtLink>
              </p>
            </div>
          </div>
          <p
            v-if="data.description"
            class="mt-3 text-sm text-muted leading-relaxed line-clamp-3"
          >
            {{ data.description }}
          </p>
        </div>

        <div class="mt-6 space-y-3">
          <p
            v-if="provenanceLine"
            class="inline-flex items-start gap-1.5 font-mono text-xs text-muted"
          >
            <UIcon
              name="i-lucide-shield-check"
              class="size-3.5 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{{ provenanceLine }}</span>
          </p>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              v-if="displayInstalls > 0"
              class="data-label inline-flex items-center gap-1"
              :title="liveSkill?.fetchedAt ? `Refreshed ${new Date(liveSkill.fetchedAt).toLocaleString()} from skills.sh` : 'Weekly installs from skills.sh'"
            >
              <UIcon
                name="i-lucide-arrow-down-to-line"
                class="size-3.5"
                aria-hidden="true"
              />
              {{ liveSkill?.formatted ?? displayInstalls.toLocaleString() }}
            </span>
            <span
              v-for="a in audits"
              :key="a.slug"
              class="data-label inline-flex items-center gap-1"
              :title="`${a.provider}: ${a.summary || a.status}${a.auditedAt ? ` · audited ${new Date(a.auditedAt).toLocaleDateString()}` : ''}`"
            >
              <UIcon
                :name="a.status === 'pass' ? 'i-lucide-shield-check' : a.status === 'warn' ? 'i-lucide-shield-alert' : 'i-lucide-shield-x'"
                class="size-3.5"
                :class="a.status === 'pass' ? 'text-emerald-500' : a.status === 'warn' ? 'text-amber-500' : 'text-rose-500'"
                aria-hidden="true"
              />
              {{ a.provider }}
            </span>
            <span
              v-if="data.stars"
              class="data-label inline-flex items-center gap-1"
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
              class="data-label inline-flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-git-fork"
                class="size-3.5"
                aria-hidden="true"
              />
              {{ data.forks.toLocaleString() }}
            </span>
            <span
              v-if="data.pushedAt"
              class="data-label inline-flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-clock"
                class="size-3.5"
                aria-hidden="true"
              />
              Updated {{ pushedAtAgo }}
            </span>
            <span
              v-if="data.createdAt"
              class="data-label inline-flex items-center gap-1"
              :title="new Date(data.createdAt).toLocaleDateString()"
            >
              <UIcon
                name="i-lucide-sparkles"
                class="size-3.5"
                aria-hidden="true"
              />
              First seen {{ createdAtAgo }}
            </span>
            <UBadge
              v-if="maturity"
              :label="maturity.cadence"
              :color="maturity.cadence === 'active' ? 'primary' : 'neutral'"
              :variant="maturity.cadence === 'active' ? 'solid' : 'subtle'"
              size="xs"
              :title="maturity.cadence === 'active'
                ? 'Updated in the last 30 days'
                : maturity.cadence === 'steady'
                  ? 'Updated in the last 6 months'
                  : 'No updates in 6+ months'"
            />
          </div>

          <div
            v-if="data.tags.length"
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
          <div
            class="inline-flex items-center gap-1 rounded-md border border-default bg-muted/30 p-0.5 text-xs font-mono"
            role="tablist"
            aria-label="Choose installer"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="installerTab === 'skilld'"
              class="rounded px-2.5 py-1 transition-colors"
              :class="installerTab === 'skilld' ? 'bg-default text-default shadow-sm' : 'text-muted hover:text-default'"
              @click="installerTab = 'skilld'"
            >
              skilld
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="installerTab === 'skills'"
              class="rounded px-2.5 py-1 transition-colors"
              :class="installerTab === 'skills' ? 'bg-default text-default shadow-sm' : 'text-muted hover:text-default'"
              @click="installerTab = 'skills'"
            >
              skills.sh
            </button>
          </div>
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
          <p class="font-mono text-xs text-muted">
            Works with {{ compatibleAgents.map(a => a.label).join(' · ') }}
          </p>
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
            <AddToCollection :package-name="packageName" />
          </div>
        </div>
      </div>

      <div class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-10 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
        <div class="lg:col-span-8 space-y-10 md:space-y-12">
          <section
            v-if="data.contentHtml"
            aria-labelledby="content-heading"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <h2
                id="content-heading"
                class="section-label"
              >
                Skill content
              </h2>
              <UButton
                v-if="data.raw"
                :icon="markdownCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="markdownCopied ? 'Copied' : 'Copy as markdown'"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="copyMarkdown(data.raw)"
              />
            </div>

            <UTabs
              v-model="contentView"
              :items="contentTabs"
              :content="false"
              color="neutral"
              variant="link"
              size="xs"
              class="mb-3"
            />

            <div class="rounded-lg border border-default overflow-hidden">
              <article
                v-show="contentView === 'preview'"
                class="skill-prose p-4 sm:p-6"
                v-html="data.contentHtml"
              />
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
                      @click="data?.raw && renderRaw(data.raw)"
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
              {{ data.summary.blurb }}
            </p>
            <template v-if="data.summary.useCases.length">
              <h3 class="data-label mt-5 mb-2">
                Common use cases
              </h3>
              <ul class="space-y-1.5 text-sm text-muted">
                <li
                  v-for="(uc, idx) in data.summary.useCases"
                  :key="idx"
                  class="flex items-start gap-2"
                >
                  <UIcon
                    name="i-lucide-check"
                    class="size-3.5 shrink-0 mt-1 text-muted"
                    aria-hidden="true"
                  />
                  <span>{{ uc }}</span>
                </li>
              </ul>
            </template>
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

        <aside class="mt-10 lg:mt-0 lg:col-span-4 lg:sticky lg:top-6 space-y-6">
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
              <div
                class="inline-flex items-center gap-1 rounded-md border border-default bg-muted/30 p-0.5 text-xs font-mono"
                role="tablist"
                aria-label="Choose installer"
              >
                <button
                  type="button"
                  role="tab"
                  :aria-selected="installerTab === 'skilld'"
                  class="rounded px-2.5 py-1 transition-colors"
                  :class="installerTab === 'skilld' ? 'bg-default text-default shadow-sm' : 'text-muted hover:text-default'"
                  @click="installerTab = 'skilld'"
                >
                  skilld
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="installerTab === 'skills'"
                  class="rounded px-2.5 py-1 transition-colors"
                  :class="installerTab === 'skills' ? 'bg-default text-default shadow-sm' : 'text-muted hover:text-default'"
                  @click="installerTab = 'skills'"
                >
                  skills.sh
                </button>
              </div>
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
              <p class="font-mono text-xs text-muted">
                Works with {{ compatibleAgents.map(a => a.label).join(' · ') }}
              </p>
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
                <AddToCollection :package-name="packageName" />
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
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  {{ item.name }}
                </div>
                <div class="data-label mt-0.5 truncate">
                  {{ item.owner }}{{ item.repo !== 'skills' ? `/${item.repo}` : '' }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
