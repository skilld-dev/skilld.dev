<script setup lang="ts">
const route = useRoute()
const login = computed(() => String(route.params.login))

const { user } = useUserSession()
const isOwner = computed(() => user.value?.login?.toLowerCase() === login.value.toLowerCase())

const { data: collectionsData } = await useFetch(
  () => `/api/collections/by-author/${login.value}`,
  { key: () => `author-collections-${login.value}` },
)
const collections = computed(() => collectionsData.value?.items ?? [])

const { data: skillsData, refresh: refreshSkills } = await useFetch(
  () => `/api/users/${login.value}/skills`,
  { key: () => `author-skills-${login.value}` },
)
const skills = computed(() => skillsData.value?.items ?? [])

const scanning = ref(false)
const scanResult = ref<{ reposFound: number, reposSynced: number, reposFailed: number } | null>(null)
const scanError = ref<string | null>(null)

async function scanRepos() {
  scanning.value = true
  scanError.value = null
  scanResult.value = null
  try {
    const res = await $fetch<{ reposFound: number, reposSynced: number, reposFailed: number }>(
      '/api/me/repos/scan',
      { method: 'POST', body: {} },
    )
    scanResult.value = res
    await refreshSkills()
  }
  catch (err: unknown) {
    const e = err as { data?: { message?: string }, message?: string }
    scanError.value = e?.data?.message ?? e?.message ?? 'Scan failed'
  }
  finally {
    scanning.value = false
  }
}

async function unpublish(owner: string, repo: string) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Unpublish ${owner}/${repo}? This removes all skills from this repo.`))
    return
  await $fetch(`/api/me/skills/${owner}/${repo}`, { method: 'DELETE' })
  await refreshSkills()
}

useSeoMeta({
  title: () => `@${login.value} · skilld`,
  description: () => `Skills and collections by @${login.value}`,
})

defineOgImage('Curator.takumi', {
  handle: () => login.value,
  avatar: () => `https://github.com/${login.value}.png?size=128`,
  collectionCount: () => collections.value.length,
  skillCount: () => skills.value.length,
  skills: () => skills.value.slice(0, 4).map(skill => skill.display_name || skill.name),
}, { alt: () => `@${login.value} skill profile on skilld` })
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">
    <h1 class="font-mono text-2xl font-medium tracking-tight">
      @{{ login }}
    </h1>
    <p class="mt-2 text-sm text-muted">
      Skill author profile.
    </p>

    <USeparator class="my-8" />

    <div class="flex items-center justify-between mb-4">
      <h2 class="section-label">
        Skills
      </h2>
      <UButton
        v-if="isOwner"
        size="xs"
        color="neutral"
        variant="outline"
        :loading="scanning"
        @click="scanRepos"
      >
        {{ skills.length ? 'Rescan repos' : 'Scan my repos' }}
      </UButton>
    </div>

    <p v-if="scanResult" class="mb-4 text-xs text-muted">
      Found {{ scanResult.reposFound }} repos, indexed {{ scanResult.reposSynced }}{{ scanResult.reposFailed ? `, ${scanResult.reposFailed} failed` : '' }}.
    </p>
    <p v-if="scanError" class="mb-4 text-xs text-red-500">
      {{ scanError }}
    </p>

    <ul
      v-if="skills.length"
      class="space-y-3 list-none p-0 mb-10"
    >
      <li
        v-for="s in skills"
        :key="`${s.owner}/${s.repo}/${s.name}`"
        class="rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <NuxtLink
              :to="`/gh/${s.owner}/${s.repo}/${s.name}`"
              class="block"
            >
              <h3 class="font-mono text-sm font-medium truncate">
                {{ s.display_name || s.name }}
              </h3>
              <p class="mt-0.5 font-mono text-xs text-muted truncate">
                {{ s.owner }}/{{ s.repo }}
              </p>
              <p
                v-if="s.description"
                class="mt-1 text-xs text-muted line-clamp-2"
              >
                {{ s.description }}
              </p>
            </NuxtLink>
          </div>
          <UButton
            v-if="isOwner"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="unpublish(s.owner, s.repo)"
          >
            Unpublish
          </UButton>
        </div>
      </li>
    </ul>
    <p v-else class="mb-10 text-sm text-muted">
      {{ isOwner ? 'No skills indexed yet. Click “Scan my repos” to find SKILL.md files in your public repos.' : 'No skills yet.' }}
    </p>

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
