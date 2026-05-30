<script setup lang="ts">
import type { MdxgDocument } from '~~/modules/mdxg/src/runtime/types'
import { useClipboard } from '@vueuse/core'

interface BucketCounts {
  breaking: number
  features: number
  fixes: number
  improvements: number
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
  supersedes: string[]
  generatedAt: string
}

const route = useRoute()
const slug = computed(() => {
  const s = route.params.slug
  return Array.isArray(s) ? s.join('/') : String(s ?? '')
})

const { data, error } = await useFetch<{ meta: GuideMeta, document: MdxgDocument }>(
  () => `/api/npm-guides/${slug.value}`,
)

if (error.value || !data.value)
  throw createError({ statusCode: 404, statusMessage: 'Guide not found', fatal: true })

const meta = computed(() => data.value!.meta)
const installCmd = computed(() => `npx skilld add npm:${meta.value.packageName}`)
const rawUrl = computed(() => `/api/npm-guides-raw/${slug.value}`)

const { copy, copied } = useClipboard({ source: installCmd })

// Surface the bucketed change counts as a change8-style summary strip. Breaking
// changes are the decision signal, so they lead and carry semantic colour; the
// rest stay quiet. A guide with no actionable changes says so plainly.
const changeSummary = computed(() => {
  const c = meta.value.counts
  return [
    { n: c.breaking, label: c.breaking === 1 ? 'breaking change' : 'breaking changes', tone: 'breaking' as const },
    { n: c.features, label: c.features === 1 ? 'new API' : 'new APIs', tone: 'feature' as const },
    { n: c.fixes, label: 'fixes', tone: 'muted' as const },
    { n: c.improvements, label: 'improvements', tone: 'muted' as const },
  ].filter(item => item.n > 0)
})
const noActionableChanges = computed(() => meta.value.counts.breaking + meta.value.counts.features === 0)

const releasedDate = computed(() => {
  const iso = meta.value.releasedAt
  if (!iso)
    return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})

const description = computed(() =>
  `How to migrate ${meta.value.packageName} to ${meta.value.version}: ${meta.value.counts.breaking} breaking changes, ${meta.value.counts.features} new APIs, and a step-by-step upgrade an AI agent can follow.`,
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
  // releasedAt is often null in the dataset; fall back so the tag isn't dropped.
  articlePublishedTime: () => meta.value.releasedAt ?? meta.value.generatedAt,
})

useHead({
  link: [{ rel: 'canonical', href: canonical }],
})

// Structured data: TechArticle for the guide + HowTo for the upgrade, so search
// engines (and agents) can read the migration as a discrete procedure.
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

      <!-- Identity + provenance row, quiet mono chrome. -->
      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
        <span class="text-default">{{ meta.packageName }}</span>
        <span v-if="meta.fromVersion" aria-label="upgrade range">{{ meta.fromVersion }} → {{ meta.version }}</span>
        <span v-else>{{ meta.version }}</span>
        <UBadge v-if="meta.prerelease" color="warning" variant="subtle" size="sm">
          {{ meta.tag }}
        </UBadge>
        <span v-if="releasedDate" class="text-dimmed">released {{ releasedDate }}</span>
      </div>

      <!-- Change summary: the decision signal, breaking changes first. -->
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
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
        <span v-if="noActionableChanges" class="text-muted">No code changes required</span>
      </div>
    </header>

    <!-- Install CTA: this guide's package skill keeps an agent current. Quiet,
         bordered, mono — the install command is the artefact, not a loud button. -->
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
            color="neutral"
            variant="ghost"
            size="sm"
            :to="rawUrl"
            external
            target="_blank"
            icon="i-lucide-file-text"
            class="font-mono rounded-lg"
          >
            Raw
          </UButton>
          <UButton
            color="neutral"
            variant="subtle"
            size="sm"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            class="font-mono rounded-lg"
            :aria-label="copied ? 'Copied install command' : 'Copy install command'"
            @click="copy()"
          >
            <span class="text-xs">{{ installCmd }}</span>
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- skill-prose (global, in entry.css) supplies typography; the .mdxg-guide
         rule in main.css remaps the standalone mdxg renderer's hardcoded
         light-mode vars onto --ui-* tokens. Both must be GLOBAL: Nuxt does not
         inject this layer page's route CSS chunk in production. -->
    <div class="skill-prose mdxg-guide">
      <MdxgPageView
        v-for="page in data.document.pages"
        :key="page.slug"
        :page="page"
        :data="data.document.data"
      />
    </div>

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
