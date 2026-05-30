<script setup lang="ts">
import type { MdxgDocument } from '~~/modules/mdxg/src/runtime/types'
import { useClipboard } from '@vueuse/core'

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

const description = computed(() =>
  `How to migrate ${meta.value.packageName} to ${meta.value.version}: breaking changes, new features, and a step-by-step upgrade an AI agent can follow.`,
)

useSeoMeta({
  title: () => meta.value.title,
  description,
  ogTitle: () => meta.value.title,
  ogDescription: description,
})
</script>

<template>
  <UContainer v-if="data" class="py-10 max-w-3xl">
    <header class="mb-8">
      <NuxtLink to="/guides" class="text-sm text-muted hover:text-default">
        ← Migration guides
      </NuxtLink>
      <div class="mt-3 flex items-center gap-2 text-sm text-muted font-mono">
        <span>{{ meta.packageName }}</span>
        <UBadge v-if="meta.prerelease" color="warning" variant="subtle" size="sm">
          {{ meta.tag }}
        </UBadge>
        <span v-if="meta.fromVersion">{{ meta.fromVersion }} → {{ meta.version }}</span>
        <span v-else>{{ meta.version }}</span>
      </div>
    </header>

    <!-- Install CTA: this guide's package skill keeps an agent current. -->
    <UCard class="mb-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-medium">
            Give your agent this upgrade
          </p>
          <p class="text-sm text-muted">
            Install the {{ meta.packageName }} package skill, or hand the raw guide to your agent.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UButton color="neutral" variant="subtle" :to="rawUrl" external target="_blank" icon="i-lucide-file-text">
            Raw markdown
          </UButton>
          <UButton color="primary" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" @click="copy()">
            <span class="font-mono text-xs">{{ installCmd }}</span>
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Flat article render (one h1, no viewer chrome) for clean SEO + a11y. -->
    <div class="mdxg-guide">
      <MdxgPageView
        v-for="page in data.document.pages"
        :key="page.slug"
        :page="page"
        :data="data.document.data"
      />
    </div>
  </UContainer>
</template>
