<script setup lang="ts">
const route = useRoute()
const login = computed(() => String(route.params.login))

const { data: collectionsData } = await useFetch(
  () => `/api/collections/by-author/${login.value}`,
  { key: () => `author-collections-${login.value}` },
)

const collections = computed(() => collectionsData.value?.items ?? [])

useSeoMeta({
  title: () => `@${login.value} · skilld`,
  description: () => `Skill collections by @${login.value}`,
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">
    <h1 class="font-mono text-2xl font-medium tracking-tight">
      @{{ login }}
    </h1>
    <p class="mt-2 text-sm text-muted">
      Collection author profile.
    </p>

    <USeparator class="my-8" />

    <h2 class="section-label mb-4">
      Collections
    </h2>
    <ul
      v-if="collections.length"
      class="space-y-3 list-none p-0"
    >
      <li
        v-for="c in collections"
        :key="c.slug"
      >
        <NuxtLink
          :to="`/@${login}/${c.slug}`"
          class="block rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]"
        >
          <h3 class="font-mono text-sm font-medium">
            {{ c.name }}
          </h3>
          <p
            v-if="c.preamble"
            class="mt-1 text-xs text-muted line-clamp-2"
          >
            {{ c.preamble }}
          </p>
          <p class="mt-2 font-mono text-xs text-muted">
            {{ c.skillCount }} {{ c.skillCount === 1 ? 'skill' : 'skills' }}
          </p>
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      No collections yet.
    </p>
  </div>
</template>
