<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

interface BucketCounts {
  breaking: number
  features: number
  fixes: number
  improvements: number
}
interface VersionBuckets {
  version: string
  buckets: { breaking: string[], features: string[], fixes: string[], improvements: string[] }
  counts: BucketCounts
}
interface GuideMeta {
  slug: string
  packageName: string
  version: string
  tag: string
  prerelease: boolean
  fromVersion?: string
  repoUrl?: string
  releasedAt?: string
  title: string
  counts: BucketCounts
  releaseBuckets: VersionBuckets[]
  supersedes: string[]
  generatedAt: string
}

const route = useRoute()
const slug = computed(() => {
  const s = route.params.slug
  return Array.isArray(s) ? s.join('/') : String(s ?? '')
})

const { data, error } = await useFetch<{ meta: GuideMeta, markdown: string }>(
  () => `/api/npm-guides/${slug.value}`,
)
if (error.value || !data.value)
  throw createError({ statusCode: 404, statusMessage: 'Guide not found', fatal: true })

// Parse in the app/SSR context (not the server route) so the mdxg app plugin's
// Shiki highlighter is registered — otherwise code blocks render unhighlighted.
const { data: doc } = await useAsyncData(
  () => `mdxg-${slug.value}`,
  () => parseMdxg(data.value!.markdown),
)

const meta = computed(() => data.value!.meta)
const installCmd = computed(() => `npx skilld add npm:${meta.value.packageName}`)
const rawUrl = computed(() => `/api/npm-guides-raw/${slug.value}`)
const { copy, copied } = useClipboard({ source: installCmd })

// --- semver helpers (client-side, numeric major.minor.patch; prerelease dropped) ---
function parseV(v: string): number[] {
  return (v.replace(/^\D+/, '').split('-')[0] ?? '').split('.').map(n => Number.parseInt(n, 10) || 0)
}
function cmpV(a: string, b: string): number {
  const pa = parseV(a)
  const pb = parseV(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d)
      return d
  }
  return 0
}
function majorOf(v?: string): number | null {
  if (!v)
    return null
  const n = Number.parseInt(String(v).replace(/^\D+/, ''), 10)
  return Number.isNaN(n) ? null : n
}

const fromMajor = computed(() => majorOf(meta.value.fromVersion))
const toMajor = computed(() => majorOf(meta.value.version))
const isMajorJump = computed(() => fromMajor.value != null && fromMajor.value !== toMajor.value)
const majorLabel = computed(() =>
  isMajorJump.value ? `v${fromMajor.value} → v${toMajor.value}` : (toMajor.value != null ? `v${toMajor.value}` : null),
)

// --- from-version window ---
// releaseBuckets is newest-first. The user picks the version they're on; we show
// everything strictly newer, up to the target. Default = the previous-major
// anchor (full migration); '' is the "from the earliest cached release" sentinel.
const releaseBuckets = computed(() => meta.value.releaseBuckets ?? [])
// Sentinel for "from the earliest cached release" — a version below all real
// ones, so the window includes everything. Must be non-empty: USelect rejects
// an empty-string value (it's reserved for clearing the selection).
const EARLIEST = '0.0.0'
const fromOptions = computed(() => {
  const opts: { label: string, value: string }[] = []
  if (meta.value.fromVersion)
    opts.push({ label: `${meta.value.fromVersion}${fromMajor.value != null ? ` · v${fromMajor.value}` : ''}`, value: meta.value.fromVersion })
  else
    opts.push({ label: 'earliest', value: EARLIEST })
  for (const r of releaseBuckets.value) {
    if (cmpV(r.version, meta.value.version) < 0)
      opts.push({ label: r.version, value: r.version })
  }
  return opts
})
const selectedFrom = ref(meta.value.fromVersion ?? EARLIEST)
const windowed = computed(() => releaseBuckets.value.filter(r => cmpV(r.version, selectedFrom.value) > 0))
const windowCounts = computed<BucketCounts>(() => windowed.value.reduce<BucketCounts>((acc, r) => ({
  breaking: acc.breaking + r.counts.breaking,
  features: acc.features + r.counts.features,
  fixes: acc.fixes + r.counts.fixes,
  improvements: acc.improvements + r.counts.improvements,
}), { breaking: 0, features: 0, fixes: 0, improvements: 0 }))

const changeSummary = computed(() => {
  const c = windowCounts.value
  return [
    { n: c.breaking, label: c.breaking === 1 ? 'breaking change' : 'breaking changes', tone: 'breaking' as const },
    { n: c.features, label: c.features === 1 ? 'new feature' : 'new features', tone: 'feature' as const },
    { n: c.fixes, label: 'fixes', tone: 'muted' as const },
    { n: c.improvements, label: 'improvements', tone: 'muted' as const },
  ].filter(item => item.n > 0)
})
const noActionableChanges = computed(() => windowCounts.value.breaking + windowCounts.value.features === 0)
const hasBreakdown = computed(() => releaseBuckets.value.length > 0)

const releasedDate = computed(() => {
  const iso = meta.value.releasedAt
  if (!iso)
    return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})

// SEO uses the canonical whole-major counts (not the interactive window).
const description = computed(() =>
  `How to migrate ${meta.value.packageName} to ${meta.value.version}: ${meta.value.counts.breaking} breaking changes, ${meta.value.counts.features} new features, and a step-by-step upgrade an AI agent can follow.`,
)
const url = useRequestURL()
const canonical = computed(() => `${url.origin}/guides/npm/${meta.value.slug}`)

useSeoMeta({
  title: () => meta.value.title,
  description,
  ogTitle: () => meta.value.title,
  ogDescription: description,
  ogType: 'article',
  articleModifiedTime: () => meta.value.generatedAt,
  articlePublishedTime: () => meta.value.releasedAt ?? meta.value.generatedAt,
})
useHead({ link: [{ rel: 'canonical', href: canonical }] })

useSchemaOrg(() => {
  const m = meta.value
  return [
    defineArticle({
      '@type': 'TechArticle',
      'headline': m.title,
      'description': description.value,
      'datePublished': m.releasedAt ?? m.generatedAt,
      'dateModified': m.generatedAt,
      'author': { '@type': 'Organization', 'name': 'skilld' },
    }),
    defineHowTo({
      '@id': `${canonical.value}#upgrade`,
      'name': m.title,
      'description': `Upgrade ${m.packageName} to ${m.version}.`,
      'totalTime': 'PT15M',
      'step': [
        { '@type': 'HowToStep', 'name': 'Install the upgrade', 'text': installCmd.value },
        { '@type': 'HowToStep', 'name': 'Apply breaking changes', 'text': `Work through the ${m.counts.breaking} breaking changes documented below.` },
        { '@type': 'HowToStep', 'name': 'Verify', 'text': 'Run your build and test suite to confirm the upgrade.' },
      ],
    }),
    defineBreadcrumb({
      itemListElement: [
        { name: 'Migration guides', item: '/guides' },
        { name: m.title, item: `/guides/npm/${m.slug}` },
      ],
    }),
  ]
})
</script>

<template>
  <UContainer v-if="data" class="py-10 max-w-3xl">
    <header class="mb-6">
      <NuxtLink to="/guides" class="font-mono text-xs text-muted hover:text-default transition-colors">
        ← Migration guides
      </NuxtLink>

      <h1 class="mt-4 text-2xl sm:text-3xl font-semibold tracking-tight text-default">
        Migrating {{ meta.packageName }} to {{ meta.version }}
      </h1>

      <!-- Identity row: lead with the major jump so the scope reads instantly. -->
      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
        <UBadge
          v-if="majorLabel"
          :color="isMajorJump ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
          class="font-mono"
        >
          {{ majorLabel }}
        </UBadge>
        <span class="text-default">{{ meta.packageName }}</span>
        <UBadge v-if="meta.prerelease" color="warning" variant="subtle" size="sm">
          {{ meta.tag }}
        </UBadge>
        <span v-if="releasedDate" class="text-dimmed">released {{ releasedDate }}</span>
      </div>

      <!-- From-version control + live-recomputed change summary. -->
      <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs">
        <div class="flex items-center gap-2">
          <span class="text-muted">Upgrading from</span>
          <USelect
            v-model="selectedFrom"
            :items="fromOptions"
            value-key="value"
            size="sm"
            class="font-mono w-40"
            :disabled="fromOptions.length < 2"
          />
          <span class="text-muted">→ {{ meta.version }}</span>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
        <template v-if="changeSummary.length">
          <span
            v-for="item in changeSummary"
            :key="item.label"
            :class="{
              'text-warning': item.tone === 'breaking',
              'text-default': item.tone === 'feature',
              'text-muted': item.tone === 'muted',
            }"
          >
            <span class="font-semibold">{{ item.n }}</span> {{ item.label }}
          </span>
        </template>
        <span v-if="noActionableChanges" class="text-muted">No code changes required in this range</span>
      </div>
    </header>

    <!-- Install CTA. -->
    <UCard class="mb-8 rounded-lg" :ui="{ root: 'rounded-lg', body: 'p-4 sm:p-4' }">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-medium text-sm">
            Give your agent this upgrade
          </p>
          <p class="text-xs text-muted mt-0.5">
            Install the {{ meta.packageName }} package skill, or hand the raw guide to your agent.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UButton
            color="neutral" variant="ghost" size="sm" :to="rawUrl" external target="_blank"
            icon="i-lucide-file-text" class="font-mono rounded-lg"
          >
            Raw
          </UButton>
          <UButton
            color="neutral" variant="subtle" size="sm"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="font-mono rounded-lg"
            :aria-label="copied ? 'Copied install command' : 'Copy install command'" @click="copy()"
          >
            <span class="text-xs">{{ installCmd }}</span>
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Synthesised upgrade runbook (highlighted). Covers the full major. -->
    <div v-if="doc" class="skill-prose mdxg-guide">
      <MdxgPageView
        v-for="page in doc.pages"
        :key="page.slug"
        :page="page"
        :data="doc.data"
      />
    </div>

    <!-- Changes by version: per-release breakdown, filtered by the from-selector. -->
    <section v-if="hasBreakdown" class="mt-12">
      <h2 class="text-lg font-semibold text-default mb-1">
        Changes by version
      </h2>
      <p class="text-xs text-muted mb-5 font-mono">
        {{ windowed.length }} release{{ windowed.length === 1 ? '' : 's' }} from
        {{ selectedFrom === EARLIEST ? 'the earliest' : selectedFrom }} → {{ meta.version }}
      </p>

      <div class="space-y-5">
        <div
          v-for="rel in windowed"
          :key="rel.version"
          class="border border-default rounded-lg p-4"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
            <span class="text-default font-semibold text-sm">v{{ rel.version }}</span>
            <span v-if="rel.counts.breaking" class="text-warning">{{ rel.counts.breaking }} breaking</span>
            <span v-if="rel.counts.features" class="text-muted">{{ rel.counts.features }} new</span>
            <span v-if="rel.counts.fixes" class="text-dimmed">{{ rel.counts.fixes }} fixes</span>
            <span v-if="rel.counts.improvements" class="text-dimmed">{{ rel.counts.improvements }} improvements</span>
          </div>

          <div v-if="rel.buckets.breaking.length" class="mt-3">
            <p class="font-mono text-[0.7rem] uppercase tracking-widest text-warning">
              Breaking
            </p>
            <ul class="mt-1.5 space-y-1 text-sm">
              <li v-for="(item, i) in rel.buckets.breaking" :key="`b${i}`" class="flex gap-2">
                <span class="text-warning shrink-0">↳</span><span>{{ item }}</span>
              </li>
            </ul>
          </div>

          <div v-if="rel.buckets.features.length" class="mt-3">
            <p class="font-mono text-[0.7rem] uppercase tracking-widest text-muted">
              New
            </p>
            <ul class="mt-1.5 space-y-1 text-sm text-muted">
              <li v-for="(item, i) in rel.buckets.features" :key="`f${i}`" class="flex gap-2">
                <span class="text-dimmed shrink-0">+</span><span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <footer v-if="meta.repoUrl" class="mt-10 pt-5 border-t border-default font-mono text-xs text-muted">
      Generated from
      <a :href="`${meta.repoUrl}/releases`" target="_blank" rel="noopener" class="hover:text-default underline underline-offset-2">
        {{ meta.packageName }} releases
      </a>
      ·
      <a :href="rawUrl" target="_blank" rel="noopener" class="hover:text-default underline underline-offset-2">
        raw markdown for agents
      </a>
    </footer>
  </UContainer>
</template>
