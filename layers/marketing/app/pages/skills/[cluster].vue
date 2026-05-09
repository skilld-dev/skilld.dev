<script setup lang="ts">
interface ClusterSkill {
  owner: string
  name: string
  repo: string
  displayName: string
  description: string | null
  installs: number
  stars: number
  modifiedAt: number | null
  slug: string
}

interface ClusterDetailResponse {
  cluster: {
    slug: string
    label: string
    icon: string
    userVoice: string
  }
  items: ClusterSkill[]
  total: number
  page: number
  pages: number
}

const route = useRoute()
const clusterSlug = computed(() => route.params.cluster as string)

const { data, error } = await useFetch<ClusterDetailResponse>(
  () => `/api/clusters/${clusterSlug.value}`,
)

if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Unknown cluster' })
}

const cluster = computed(() => data.value!.cluster)
const skills = computed(() => data.value!.items)
const total = computed(() => data.value!.total)

const title = computed(() => `${cluster.value.label} · skilld`)
const description = computed(
  () => `${cluster.value.userVoice} ${total.value} curated skills.`,
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

defineOgImage('Page.takumi', {
  title: cluster.value.label,
  description: cluster.value.userVoice,
}, { alt: `${cluster.value.label} on skilld` })

function formatInstalls(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000)
    return `${Math.round(n / 1_000)}k`
  return String(n)
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16">
    <NuxtLink to="/" class="font-mono text-xs text-muted hover:text-default">
      ← Home
    </NuxtLink>

    <div class="mt-4 flex items-center gap-3">
      <UIcon :name="cluster.icon" class="size-5 text-muted" />
      <h1 class="font-mono text-2xl sm:text-3xl font-medium tracking-tight">
        {{ cluster.label }}
      </h1>
    </div>
    <p class="mt-3 text-sm text-muted max-w-xl leading-relaxed">
      {{ cluster.userVoice }}
    </p>
    <p class="mt-2 font-mono text-xs text-muted">
      {{ total }} {{ total === 1 ? 'skill' : 'skills' }}
    </p>

    <USeparator class="my-8" />

    <ul
      v-if="skills.length"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
    >
      <li
        v-for="s in skills"
        :key="`${s.owner}/${s.name}`"
        class="rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]"
      >
        <NuxtLink :to="`/gh/${s.owner}/${s.repo}/${s.name}`" class="block">
          <div class="flex items-start gap-2">
            <img
              :src="`https://github.com/${s.owner}.png?size=80`"
              :alt="`${s.owner} avatar`"
              class="size-5 rounded shrink-0 mt-0.5 border border-default"
              width="20"
              height="20"
              loading="lazy"
            >
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-medium truncate">
                {{ s.displayName }}
              </p>
              <p class="font-mono text-xs text-muted truncate">
                {{ s.owner }}/{{ s.repo }}
              </p>
            </div>
          </div>
          <p
            v-if="s.description"
            class="mt-2 text-xs text-muted line-clamp-3"
          >
            {{ s.description }}
          </p>
          <p v-if="s.installs > 0" class="mt-2 font-mono text-xs text-muted">
            ~{{ formatInstalls(s.installs) }} installs
          </p>
        </NuxtLink>
      </li>
    </ul>

    <p v-else class="text-sm text-muted">
      No skills here yet.
    </p>
  </div>
</template>
