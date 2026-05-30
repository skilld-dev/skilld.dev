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
const canonical = computed(() => `${url.origin}/guides/${meta.value.slug}`)

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
        { name: m.title, item: `/guides/${m.slug}` },
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

    <!-- Prose typography is defined in this component's <style> (not the global
         skill-prose), because Nuxt's per-route CSS splitting does not ship the
         global custom classes to this route in production. Self-contained styles
         travel with the route chunk and fix the standalone mdxg renderer's
         hardcoded light-mode colours (near-black text, white code blocks). -->
    <div class="mdxg-guide">
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

<style scoped>
/* Self-contained guide prose. Mirrors the global .skill-prose using --ui-* tokens
   so it stays theme- and dark-mode-aware, and remaps the standalone mdxg
   renderer's hardcoded light-mode vars onto the same tokens. :deep() is required
   because the content is rendered by the child MdxgPageView (.mdxg-page). */
.mdxg-guide {
  --mdxg-color-fg: var(--ui-text);
  --mdxg-color-muted: var(--ui-text-muted);
  --mdxg-color-bg: var(--ui-bg);
  --mdxg-color-surface: var(--ui-bg-muted);
  --mdxg-color-border: var(--ui-border);
  --mdxg-color-accent: var(--ui-primary);
  color: var(--ui-text);
  font-size: 0.9375rem;
  line-height: 1.7;
}
.mdxg-guide :deep(.mdxg-page > :first-child) { margin-top: 0; }
.mdxg-guide :deep(.mdxg-page > :last-child) { margin-bottom: 0; }
.mdxg-guide :deep(h1),
.mdxg-guide :deep(h2),
.mdxg-guide :deep(h3),
.mdxg-guide :deep(h4) {
  font-family: var(--font-sans);
  font-weight: 600;
  line-height: 1.3;
  margin: 1.75em 0 0.6em;
  color: var(--ui-text);
}
.mdxg-guide :deep(h2) { font-size: 1.25rem; }
.mdxg-guide :deep(h3) { font-size: 1.0625rem; }
.mdxg-guide :deep(h4) { font-size: 0.9375rem; }
.mdxg-guide :deep(p),
.mdxg-guide :deep(ul),
.mdxg-guide :deep(ol),
.mdxg-guide :deep(blockquote),
.mdxg-guide :deep(table) { margin: 0.9em 0; }
.mdxg-guide :deep(ul),
.mdxg-guide :deep(ol) { padding-left: 1.5em; }
.mdxg-guide :deep(ul) { list-style: disc; }
.mdxg-guide :deep(ol) { list-style: decimal; }
.mdxg-guide :deep(li) { margin: 0.3em 0; }
.mdxg-guide :deep(a) {
  color: var(--ui-color-primary-500);
  text-decoration: underline;
  text-underline-offset: 2px;
}
/* The fixed primary rose is ~3.76:1 on the dark body bg (WCAG fail); lighten in dark.
   .dark is an ancestor (on <html>), so it scopes fine without :global(). */
.dark .mdxg-guide :deep(a) { color: oklch(0.74 0.15 17.32); }
.mdxg-guide :deep(a:hover) { color: var(--ui-text); }
.mdxg-guide :deep(strong) { font-weight: 600; color: var(--ui-text); }
.mdxg-guide :deep(:not(pre) > code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border-muted);
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
}
.mdxg-guide :deep(pre) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 0.9rem 1rem;
  overflow-x: auto;
  margin: 1em 0;
}
.mdxg-guide :deep(pre code) { background: transparent; border: 0; padding: 0; font-size: inherit; }
.mdxg-guide :deep(blockquote) {
  border-left: 3px solid var(--ui-border);
  padding-left: 1em;
  color: var(--ui-text-muted);
}
.mdxg-guide :deep(table) { width: 100%; border-collapse: collapse; font-size: 0.875rem; display: block; overflow-x: auto; }
.mdxg-guide :deep(th),
.mdxg-guide :deep(td) { border: 1px solid var(--ui-border-muted); padding: 0.5rem 0.75rem; text-align: left; }
.mdxg-guide :deep(th) { background: var(--ui-bg-muted); font-weight: 600; }
.mdxg-guide :deep(hr) { border: 0; border-top: 1px solid var(--ui-border-muted); margin: 1.5em 0; }
</style>
