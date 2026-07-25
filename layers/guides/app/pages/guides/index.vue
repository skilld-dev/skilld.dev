<script setup lang="ts">
interface GuideSummary {
  slug: string
  packageName: string
  version: string
  prerelease: boolean
  title: string
  counts: { breaking: number, features: number, fixes: number, improvements: number }
}

const { data: guides } = await useFetch<GuideSummary[]>('/api/npm-guides')

useSeoMeta({
  title: 'npm migration guides',
  description: 'Migration notes an agent can follow when upgrading an npm package.',
})
</script>

<template>
  <UContainer class="py-10 max-w-3xl">
    <header class="mb-8">
      <h1 class="text-2xl font-semibold">
        Migration guides
      </h1>
      <p class="mt-2 text-muted">
        Upgrade notes an agent can work through, package by package.
      </p>
    </header>

    <ul v-if="guides?.length" class="divide-y divide-default">
      <li v-for="guide in guides" :key="guide.slug">
        <NuxtLink
          :to="`/guides/npm/${guide.slug}`"
          class="flex items-center justify-between gap-3 py-3 hover:text-primary"
        >
          <span class="font-mono text-sm">{{ guide.packageName }}</span>
          <span class="flex items-center gap-2 text-sm text-muted">
            <span v-if="guide.counts.breaking" class="text-warning" :title="`${guide.counts.breaking} breaking changes`">
              {{ guide.counts.breaking }} breaking
            </span>
            <span v-if="guide.counts.features" :title="`${guide.counts.features} new features`">
              {{ guide.counts.features }} feat
            </span>
            <span v-if="guide.counts.fixes" :title="`${guide.counts.fixes} fixes`">
              {{ guide.counts.fixes }} fix
            </span>
            <UBadge v-if="guide.prerelease" color="warning" variant="subtle" size="sm">pre</UBadge>
            {{ guide.version }}
          </span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-muted">
      No guides yet.
    </p>
  </UContainer>
</template>
