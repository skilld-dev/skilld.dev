<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

interface StarredRepo {
  owner: string
  repo: string
  starredAt: number
  hasSkill: boolean
}

const { data, refresh, status } = await useFetch<{ items: StarredRepo[], syncedAt: number | null }>('/api/me/starred')

const selected = ref<Set<string>>(new Set())
function toggle(key: string) {
  if (selected.value.has(key))
    selected.value.delete(key)
  else
    selected.value.add(key)
  selected.value = new Set(selected.value)
}

const skillItems = computed(() => (data.value?.items ?? []).filter(r => r.hasSkill))

const syncing = ref(false)
async function syncStars() {
  syncing.value = true
  await $fetch('/api/me/stars/sync', { method: 'POST' }).catch(() => null)
  syncing.value = false
  await refresh()
}

const submitting = ref(false)
async function watchSelected() {
  if (!selected.value.size) {
    await navigateTo('/onboarding/cadence')
    return
  }
  submitting.value = true
  const repos = [...selected.value].map((k) => {
    const [owner, repo] = k.split('/')
    return { owner, repo }
  })
  await $fetch('/api/me/subscriptions', {
    method: 'POST',
    body: { source: 'star-import', repos },
  }).catch(() => null)
  submitting.value = false
  await navigateTo('/onboarding/cadence')
}

useSeoMeta({ title: 'Discover skills · skilld', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 sm:px-6 pt-12 pb-12 md:pt-16">
    <h1 class="font-mono text-2xl font-medium">
      Watch what you've already starred
    </h1>
    <p class="mt-2 text-sm text-muted">
      We checked your starred repos against the registry. Pick what you want to follow; you'll get a weekly digest only when SKILL.md changes.
    </p>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <UButton
        :loading="syncing"
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        label="Re-sync stars"
        @click="syncStars"
      />
      <span v-if="data?.syncedAt" class="text-xs text-muted">
        Last synced {{ new Date(data.syncedAt * 1000).toLocaleString() }}
      </span>
    </div>

    <div v-if="status === 'pending'" class="mt-6 text-sm text-muted">
      Loading your stars...
    </div>
    <div v-else-if="!skillItems.length" class="mt-6 rounded-lg border border-default p-6 text-sm text-muted">
      None of your starred repos have a SKILL.md yet. <NuxtLink to="/onboarding/cadence" class="underline">
        Skip ahead
      </NuxtLink>.
    </div>
    <ul v-else class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0">
      <li
        v-for="r in skillItems"
        :key="`${r.owner}/${r.repo}`"
      >
        <label class="flex items-start gap-3 rounded-lg border border-default p-3 cursor-pointer hover:border-[var(--ui-text-muted)]">
          <input
            type="checkbox"
            :checked="selected.has(`${r.owner}/${r.repo}`)"
            class="mt-0.5"
            @change="toggle(`${r.owner}/${r.repo}`)"
          >
          <span class="font-mono text-sm">{{ r.owner }}/{{ r.repo }}</span>
        </label>
      </li>
    </ul>

    <div class="mt-8 flex items-center justify-between">
      <NuxtLink to="/onboarding/cadence" class="text-sm text-muted hover:text-default underline">
        Skip
      </NuxtLink>
      <UButton
        :loading="submitting"
        :label="selected.size ? `Watch ${selected.size}` : 'Continue'"
        trailing-icon="i-lucide-arrow-right"
        size="sm"
        @click="watchSelected"
      />
    </div>
  </section>
</template>
