<script setup lang="ts">
import type { SkillgenOptInResult, SkillgenRepositoryEntry } from '../../shared/contracts/skillgen'

/**
 * The account's Skillgen switches: one per public repository it maintains
 * that holds a Skill. The skill-harness Worker queues jobs only for
 * repositories switched on here, so installing the App alone runs nothing.
 *
 * Each row carries what the Worker would find, so a repository it cannot run
 * on shows its reason up front instead of after a click. The list reads
 * GitHub, so it loads in the browser after the page renders.
 */
const INSTALL_URL = 'https://github.com/apps/skilld-skillgen/installations/new'

const { data, error, status, refresh } = useFetch<{ items: SkillgenRepositoryEntry[] }>('/api/me/skillgen', { lazy: true, server: false })

type RowState = { _tag: 'Idle' } | { _tag: 'Saving' } | { _tag: 'Failed', message: string }
const rowStates = ref<Record<string, RowState>>({})
const key = (item: SkillgenRepositoryEntry) => `${item.owner}/${item.repo}`

// A repository already on stays in the ready list even if it stopped qualifying, so it can be turned off.
const ready = computed(() => data.value?.items.filter(item => item.eligibility._tag === 'Eligible' || item.optedIn) ?? [])
const blocked = computed(() => data.value?.items.filter(item => item.eligibility._tag === 'Ineligible' && !item.optedIn) ?? [])
const waiting = computed(() => ready.value.filter(item => !item.optedIn && item.eligibility._tag === 'Eligible'))
const onCount = computed(() => ready.value.filter(item => item.optedIn).length)
const turningOnAll = ref(false)

/** `useFetch` data is shallow, so a row changes by replacing the list. */
function update(item: SkillgenRepositoryEntry, patch: Partial<SkillgenRepositoryEntry>): void {
  if (data.value)
    data.value = { items: data.value.items.map(row => key(row) === key(item) ? { ...row, ...patch } : row) }
}

async function setOptIn(item: SkillgenRepositoryEntry, optedIn: boolean): Promise<void> {
  rowStates.value[key(item)] = { _tag: 'Saving' }
  await $fetch<SkillgenOptInResult>('/api/me/skillgen', { method: 'PUT', body: { owner: item.owner, repo: item.repo, optedIn } })
    .then((result) => {
      if (result._tag === 'Refused') {
        // The repository changed since the list loaded, so it moves to the blocked group with the new reason.
        update(item, { eligibility: { _tag: 'Ineligible', message: result.message } })
        rowStates.value[key(item)] = { _tag: 'Idle' }
        return
      }
      update(item, { optedIn: result.optedIn })
      rowStates.value[key(item)] = { _tag: 'Idle' }
    })
    .catch((cause: unknown) => {
      // An expected refusal arrives as a value, so this is a network or server failure.
      console.warn('[skillgen] Saving the switch failed:', cause)
      rowStates.value[key(item)] = { _tag: 'Failed', message: 'Could not save. Try again.' }
    })
}

/** Turns on every ready repository that is off, one at a time, so each keeps its own result. */
async function turnOnAll(): Promise<void> {
  turningOnAll.value = true
  for (const item of [...waiting.value])
    await setOptIn(item, true)
  turningOnAll.value = false
}

/** Joins package names as `a`, `a and b`, or `a, b and c`. */
function listSeparator(index: number, length: number): string {
  if (index >= length - 1)
    return ''
  return index === length - 2 ? ' and ' : ', '
}

function failure(item: SkillgenRepositoryEntry): string | null {
  const state = rowStates.value[key(item)]
  return state?._tag === 'Failed' ? state.message : null
}

const signInAgain = computed(() => error.value?.statusCode === 401)
</script>

<template>
  <section aria-labelledby="skillgen-heading">
    <h2 id="skillgen-heading" class="sr-only">
      Skillgen repositories
    </h2>
    <p class="max-w-2xl text-sm leading-relaxed text-muted">
      Skillgen opens a draft pull request after each release tag. It runs only on the repositories you turn on here. Then
      <a :href="INSTALL_URL" target="_blank" rel="noopener" class="text-default underline underline-offset-2 hover:text-primary">install the App</a>
      on the same repositories.
      <NuxtLink to="/skillgen" class="text-default underline underline-offset-2 hover:text-primary">
        How Skillgen works
      </NuxtLink>
    </p>

    <div v-if="error" class="mt-6" role="alert">
      <p class="text-sm text-error">
        {{ signInAgain ? 'Your GitHub access ended. Sign in with GitHub again.' : 'Could not load your repositories from GitHub. Try again.' }}
      </p>
      <UButton
        v-if="signInAgain"
        :to="{ path: '/login', query: { return_to: '/me?view=skillgen' } }"
        label="Sign in with GitHub"
        icon="i-lucide-github"
        class="mt-3 min-h-11"
      />
      <UButton v-else label="Retry" color="neutral" variant="outline" class="mt-3 min-h-11" :loading="status === 'pending'" @click="refresh()" />
    </div>
    <p v-else-if="status !== 'success'" class="mt-6 text-sm text-muted" role="status">
      Checking your repositories on GitHub
    </p>
    <p v-else-if="!data?.items.length" class="mt-6 border-y border-default py-4 text-sm text-muted">
      None of the public repositories you maintain has a Skill on skilld yet.
    </p>
    <template v-else>
      <div v-if="ready.length" class="mt-8">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3">
          <h3 class="section-label">
            Ready
          </h3>
          <div class="flex items-center gap-3">
            <span class="data-label">{{ onCount }} of {{ ready.length }} on</span>
            <UButton
              v-if="waiting.length"
              :label="`Turn on all (${waiting.length})`"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-h-11"
              :loading="turningOnAll"
              @click="turnOnAll"
            />
          </div>
        </div>
        <ul class="list-none p-0">
          <li
            v-for="item in ready"
            :key="key(item)"
            class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-default py-4"
          >
            <div class="min-w-0">
              <NuxtLink :to="`/gh/${item.owner}/${item.repo}`" class="break-words font-mono text-sm text-default hover:text-primary">
                {{ key(item) }}
              </NuxtLink>
              <p v-if="item.eligibility._tag === 'Eligible'" class="mt-1 text-sm leading-relaxed text-muted">
                {{ item.optedIn ? 'Updates' : 'Can update' }}
                <template v-for="(name, index) in item.eligibility.packages" :key="name">
                  <code class="font-mono text-xs text-default">{{ name }}</code>{{ listSeparator(index, item.eligibility.packages.length) }}
                </template>
                {{ item.optedIn ? 'on each new tag.' : 'when you turn it on.' }}
              </p>
              <p v-else class="mt-1 text-sm leading-relaxed text-muted">
                {{ item.eligibility.message }} Turn it off, or fix the repository.
              </p>
            </div>
            <USwitch
              :model-value="item.optedIn"
              :loading="rowStates[key(item)]?._tag === 'Saving'"
              :disabled="rowStates[key(item)]?._tag === 'Saving' || (!item.optedIn && item.eligibility._tag !== 'Eligible')"
              :aria-label="`Skillgen for ${key(item)}`"
              @update:model-value="value => setOptIn(item, value)"
            />
            <p v-if="failure(item)" class="col-span-2 mt-2 text-sm text-error" role="alert">
              {{ failure(item) }}
            </p>
          </li>
        </ul>
      </div>

      <div v-if="blocked.length" class="mt-10">
        <div class="flex items-center justify-between gap-3 border-b border-default pb-3">
          <h3 class="section-label">
            Needs a change
          </h3>
          <span class="data-label">{{ blocked.length }}</span>
        </div>
        <ul class="list-none p-0">
          <li
            v-for="item in blocked"
            :key="key(item)"
            class="border-b border-default py-4"
          >
            <NuxtLink :to="`/gh/${item.owner}/${item.repo}`" class="break-words font-mono text-sm text-default hover:text-primary">
              {{ key(item) }}
            </NuxtLink>
            <p class="mt-1 flex gap-2 text-sm leading-relaxed text-muted">
              <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span class="min-w-0">{{ item.eligibility._tag === 'Ineligible' ? item.eligibility.message : '' }}</span>
            </p>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
