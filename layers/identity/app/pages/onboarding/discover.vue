<script setup lang="ts">
import type { StarsSyncResponse } from '../../utils/sync-starred-repos'
import { syncStarredRepos } from '../../utils/sync-starred-repos'

definePageMeta({ middleware: ['auth'] })

const { user } = useUserSession()

interface Skill {
  name: string
  displayName: string
  slug: string
}
interface StarredRepo {
  owner: string
  repo: string
  starredAt: number
  hasSkill: boolean
  watching: boolean
  skills: Skill[]
}
const { data, refresh, status, error } = await useFetch<{ items: StarredRepo[], syncedAt: number | null }>('/api/me/starred')

const skillItems = computed(() => (data.value?.items ?? []).filter(r => r.hasSkill))
const totalSkills = computed(() => skillItems.value.reduce((n, r) => n + r.skills.length, 0))
const selectableItems = computed(() => skillItems.value.filter(r => !r.watching))

const selected = ref<Set<string>>(new Set())
function toggle(key: string) {
  if (selected.value.has(key))
    selected.value.delete(key)
  else
    selected.value.add(key)
  selected.value = new Set(selected.value)
}
function preselectAll() {
  selected.value = new Set(selectableItems.value.map(r => `${r.owner}/${r.repo}`))
}
const allSelected = computed(() =>
  selectableItems.value.length > 0 && selectableItems.value.every(r => selected.value.has(`${r.owner}/${r.repo}`)),
)
function toggleAll() {
  if (allSelected.value)
    selected.value = new Set()
  else
    preselectAll()
}

const syncing = ref(false)
const syncError = ref<string | null>(null)
const syncProgress = ref<{ page: number, total: number, matched: number } | null>(null)

async function syncStars() {
  syncing.value = true
  syncError.value = null
  syncProgress.value = { page: 0, total: 0, matched: 0 }
  try {
    await syncStarredRepos(
      (_request, options) => $fetch<StarsSyncResponse>('/api/me/stars/sync', options),
      (r) => { syncProgress.value = { page: r.page, total: r.total, matched: r.matched } },
    )
    await refresh()
    preselectAll()
  }
  catch (e) {
    syncError.value = (e as { statusMessage?: string, message?: string }).statusMessage
      ?? (e as Error).message
      ?? 'Sync failed'
  }
  finally {
    syncing.value = false
  }
}

onMounted(() => {
  if (data.value && !data.value.syncedAt) {
    void syncStars()
    return
  }
  preselectAll()
})

const actionFailed = useActionFailure()

const submitting = ref(false)
async function watchSelected() {
  if (submitting.value || syncing.value)
    return
  if (!selected.value.size) {
    await navigateTo('/onboarding/email')
    return
  }
  submitting.value = true
  const repos = [...selected.value].map((k) => {
    const [owner, repo] = k.split('/')
    return { owner, repo }
  })
  const saved = await $fetch('/api/me/subscriptions', {
    method: 'POST',
    body: { source: 'star-import', repos },
  }).catch(actionFailed('start watching those repos'))
  submitting.value = false
  if (saved)
    await navigateTo('/onboarding/email')
}

useSeoMeta({ title: 'Discover skills', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 sm:px-6 pt-8 pb-12 md:pt-12">
    <OnboardingSteps :step="1" />
    <h1 class="mt-6 text-2xl font-semibold tracking-tight">
      Watch what you've already starred
    </h1>
    <p class="mt-2 text-sm text-muted">
      We check starred GitHub repos with "skill" in the name against the registry. Choose the ones to watch. You'll only get a digest when one changes.
    </p>
    <OwnedSkillsPrompt
      v-if="user?.login"
      :login="user.login"
      class="mt-6"
    />

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <UButton
        :loading="syncing"
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :label="data?.syncedAt ? 'Import stars again' : 'Import stars'"
        @click="syncStars"
      />
      <span v-if="syncing && syncProgress" class="text-xs text-muted">
        Page {{ syncProgress.page || '…' }} · {{ syncProgress.total }} repos cached · {{ syncProgress.matched }} match the registry
      </span>
      <span v-else-if="data?.syncedAt" class="text-xs text-muted">
        Last GitHub import {{ new Date(data.syncedAt * 1000).toLocaleString() }}
      </span>
    </div>

    <div v-if="syncError" class="mt-3 rounded border border-error/40 bg-error/5 p-2 text-xs text-error">
      {{ syncError }}
    </div>

    <div v-if="status === 'pending' || (syncing && !skillItems.length)" class="mt-6 text-sm text-muted">
      Loading your stars...
    </div>
    <div v-else-if="error" class="editorial-state mt-6" role="alert">
      <p class="text-sm text-error">
        Could not load your stars. Check your connection and try again.
      </p>
      <UButton label="Retry" color="neutral" variant="outline" class="mt-4 min-h-11" @click="refresh()" />
    </div>
    <div v-else-if="!skillItems.length" class="mt-6 rounded-lg border border-default p-4 text-sm text-muted">
      <template v-if="!data?.syncedAt">
        No star import yet. Click <strong>Import stars</strong> above, or
      </template>
      <template v-else>
        None of your starred repos with "skill" in the name are in the registry yet.
      </template>
      <NuxtLink to="/onboarding/email" class="underline">
        skip ahead
      </NuxtLink>.
    </div>
    <template v-else>
      <div class="mt-6 flex items-center justify-between">
        <span class="text-xs text-muted">
          {{ totalSkills }} {{ totalSkills === 1 ? 'skill' : 'skills' }} across {{ skillItems.length }} {{ skillItems.length === 1 ? 'repo' : 'repos' }}
        </span>
        <button
          v-if="selectableItems.length"
          type="button"
          class="min-h-11 font-mono text-sm text-muted hover:text-default underline"
          @click="toggleAll"
        >
          {{ allSelected ? 'Deselect all' : 'Select all' }}
        </button>
      </div>
      <ul class="mt-2 grid grid-cols-1 gap-2 list-none p-0">
        <li
          v-for="r in skillItems"
          :key="`${r.owner}/${r.repo}`"
        >
          <label
            class="flex items-start gap-3 rounded-lg border border-default p-3" :class="[
              r.watching ? 'opacity-70 cursor-default' : 'cursor-pointer hover:border-[var(--ui-text-muted)]',
            ]"
          >
            <input
              type="checkbox"
              :checked="r.watching || selected.has(`${r.owner}/${r.repo}`)"
              :disabled="r.watching"
              class="mt-1"
              @change="toggle(`${r.owner}/${r.repo}`)"
            >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-sm">{{ r.owner }}/{{ r.repo }}</span>
                <span v-if="r.watching" class="rounded bg-elevated px-1.5 py-0.5 text-xs text-muted">
                  Already watching
                </span>
              </div>
              <ul v-if="r.skills.length" class="mt-1.5 flex flex-wrap gap-1.5 list-none p-0">
                <li
                  v-for="s in r.skills"
                  :key="s.slug"
                  class="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-muted"
                  :title="s.name"
                >
                  {{ s.displayName }}
                </li>
              </ul>
            </div>
          </label>
        </li>
      </ul>
    </template>

    <div class="mt-8 flex items-center justify-between">
      <NuxtLink to="/onboarding/email" class="inline-flex min-h-11 items-center font-mono text-sm text-muted hover:text-default underline">
        Skip
      </NuxtLink>
      <UButton
        :loading="submitting"
        :disabled="syncing"
        :label="selected.size ? `Watch ${selected.size}` : 'Continue'"
        trailing-icon="i-lucide-arrow-right"
        size="sm"
        @click="watchSelected"
      />
    </div>
  </section>
</template>
