<script setup lang="ts">
import type { SkillgenOptInResult, SkillgenRepositoryEntry } from '../../shared/contracts/skillgen'

/**
 * The account's Skillgen switches: one per public repository it maintains
 * that holds a Skill. The skill-harness Worker queues jobs only for
 * repositories switched on here, so installing the App alone runs nothing.
 *
 * The list calls GitHub, so it loads in the browser after the page renders.
 */
const INSTALL_URL = 'https://github.com/apps/skilld-skillgen/installations/new'

const { data, error, status, refresh } = useFetch<{ items: SkillgenRepositoryEntry[] }>('/api/me/skillgen', { lazy: true, server: false })

type RowState = { _tag: 'Idle' } | { _tag: 'Saving' } | { _tag: 'Refused', message: string }
const rowStates = ref<Record<string, RowState>>({})
const key = (item: SkillgenRepositoryEntry) => `${item.owner}/${item.repo}`

async function setOptIn(item: SkillgenRepositoryEntry, optedIn: boolean): Promise<void> {
  rowStates.value[key(item)] = { _tag: 'Saving' }
  await $fetch<SkillgenOptInResult>('/api/me/skillgen', { method: 'PUT', body: { owner: item.owner, repo: item.repo, optedIn } })
    .then((result) => {
      if (result._tag === 'Refused') {
        rowStates.value[key(item)] = { _tag: 'Refused', message: result.message }
        return
      }
      item.optedIn = result.optedIn
      rowStates.value[key(item)] = { _tag: 'Idle' }
    })
    .catch((cause: unknown) => {
      // An expected refusal arrives as a value, so this is a network or server failure.
      console.warn('[skillgen] Saving the switch failed:', cause)
      rowStates.value[key(item)] = { _tag: 'Refused', message: 'Could not save. Try again.' }
    })
}

function refusedMessage(item: SkillgenRepositoryEntry): string | null {
  const state = rowStates.value[key(item)]
  return state?._tag === 'Refused' ? state.message : null
}

const signInAgain = computed(() => error.value?.statusCode === 401)
</script>

<template>
  <section aria-labelledby="skillgen-heading">
    <h2 id="skillgen-heading" class="sr-only">
      Skillgen repositories
    </h2>
    <p class="text-sm leading-relaxed text-muted">
      Skillgen opens a draft pull request after each release tag. It runs only on the repositories you turn on here.
      <NuxtLink to="/skillgen" class="text-default underline underline-offset-2 hover:text-primary">
        How Skillgen works
      </NuxtLink>
    </p>
    <p class="mt-2 text-sm leading-relaxed text-muted">
      Then install the App on the same repositories.
      <a :href="INSTALL_URL" target="_blank" rel="noopener" class="text-default underline underline-offset-2 hover:text-primary">Install Skillgen</a>
    </p>

    <div v-if="error" class="mt-5" role="alert">
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
    <p v-else-if="status !== 'success'" class="mt-5 text-sm text-muted" role="status">
      Loading your repositories from GitHub
    </p>
    <div v-else-if="data?.items.length" class="mt-5 border-y border-default">
      <ul class="list-none p-0">
        <li
          v-for="item in data.items"
          :key="key(item)"
          class="border-b border-default py-4 last:border-b-0"
        >
          <USwitch
            :model-value="item.optedIn"
            :loading="rowStates[key(item)]?._tag === 'Saving'"
            :disabled="rowStates[key(item)]?._tag === 'Saving'"
            :label="key(item)"
            :description="item.optedIn ? 'Skillgen runs on each new tag.' : 'Skillgen does not run here.'"
            :ui="{ label: 'font-mono text-sm' }"
            @update:model-value="value => setOptIn(item, value)"
          />
          <p v-if="refusedMessage(item)" class="mt-2 text-sm text-error" role="alert">
            {{ refusedMessage(item) }}
          </p>
        </li>
      </ul>
    </div>
    <p v-else class="mt-5 border-y border-default py-4 text-sm text-muted">
      None of the public repositories you maintain has a Skill on skilld yet.
    </p>
  </section>
</template>
