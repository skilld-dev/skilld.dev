<script setup lang="ts">
import type { OwnedRepoScanNotice } from '../utils/owned-repo-scan'
import { identityAccountQueries, identityAccountQueryOptions } from '../queries/account'
import { ownedRepoScanFailureNotice, ownedRepoScanNotice } from '../utils/owned-repo-scan'

/**
 * Show the saved public-repository setting, not an assumed scan outcome.
 */
const { login } = defineProps<{ login: string }>()

type PromptState
  = | { _tag: 'indexing' }
    | { _tag: 'scanning' }
    | { _tag: 'finished', notice: OwnedRepoScanNotice }
    | { _tag: 'turned_off' }
    | { _tag: 'turn_off_failed' }

const state = ref<PromptState>({ _tag: 'indexing' })
const rpc = useNuxtRpc()
const { data: me, status: accountStatus, error: accountError, refresh: retryAccount } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const indexingOff = computed(() => state.value._tag === 'turned_off' || me.value?.repo_indexing === false)

const scanMutation = useNuxtMutation({
  mutation: () => rpc.execute(identityAccountQueries.scanOwnedRepos()),
})

const privacyMutation = useNuxtMutation({
  mutation: () => rpc.execute(identityAccountQueries.savePrivacy(), { repo_indexing: false }),
})

async function checkNow() {
  if (!me.value || accountError.value || indexingOff.value || state.value._tag === 'scanning' || privacyMutation.pending.value)
    return
  state.value = { _tag: 'scanning' }
  const outcome = await scanMutation.mutateSafe()
  state.value = {
    _tag: 'finished',
    notice: outcome._tag === 'ok' ? ownedRepoScanNotice(outcome.data) : ownedRepoScanFailureNotice(outcome.error),
  }
}

async function turnOff() {
  if (!me.value || accountError.value || indexingOff.value || state.value._tag === 'scanning' || privacyMutation.pending.value)
    return
  const outcome = await privacyMutation.mutateSafe()
  if (outcome._tag === 'ok') {
    state.value = { _tag: 'turned_off' }
    // A confirmed save updates the shared static account cache for later mounts.
    setQueryData(serializeNuxtRpcKey(identityAccountQueries.me().key), { ...me.value, repo_indexing: false })
  }
  else {
    state.value = { _tag: 'turn_off_failed' }
  }
}

const route = useRoute()
const { loginUrl } = useAuth()
const signInPath = computed(() => loginUrl({ returnTo: route.fullPath }))
</script>

<template>
  <section
    class="rounded-lg border border-default p-4"
    aria-labelledby="owned-skills-prompt-heading"
  >
    <h2 id="owned-skills-prompt-heading" class="text-base font-semibold text-pretty">
      Your public repository settings
    </h2>
    <p class="mt-2 text-sm leading-relaxed text-muted text-pretty">
      When indexing is on, skilld checks your public GitHub repositories for SKILL.md files. Each Skill it finds gets a public page. You can turn indexing off here.
    </p>

    <p v-if="accountStatus === 'pending' || accountStatus === 'idle'" class="mt-4 text-sm text-muted" role="status">
      Loading your repository settings.
    </p>
    <div v-else-if="accountError || !me" class="mt-4">
      <p role="alert" class="text-sm text-muted">
        Could not load your repository settings. Try again.
      </p>
      <UButton label="Retry" color="neutral" variant="outline" class="mt-3 min-h-11" @click="retryAccount()" />
    </div>
    <p v-else-if="indexingOff" class="mt-4 flex items-start gap-2 text-sm text-muted" role="status" aria-live="polite">
      <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Indexing is off. Skills already added stay until you remove the SKILL.md file, or ask us to.
    </p>

    <template v-else>
      <p v-if="state._tag === 'turn_off_failed'" class="mt-4 text-sm text-muted" role="alert">
        Could not turn off indexing. Indexing is still on. Try again.
      </p>
      <div v-if="state._tag === 'finished'" class="mt-4" role="status" aria-live="polite">
        <p
          class="flex items-start gap-2 text-sm"
          :class="state.notice._tag === 'added' ? 'text-default' : 'text-muted'"
        >
          <UIcon
            :name="state.notice._tag === 'added' ? 'i-lucide-check' : state.notice._tag === 'none_found' ? 'i-lucide-info' : 'i-lucide-circle-alert'"
            class="mt-0.5 size-4 shrink-0"
            :class="state.notice._tag === 'added' ? 'text-primary' : ''"
            aria-hidden="true"
          />
          {{ state.notice.message }}
        </p>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <UButton
          v-if="state._tag === 'finished' && state.notice._tag === 'added'"
          :to="`/@${login}`"
          label="View your Skills"
          icon="i-lucide-user-round"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
        />
        <UButton
          v-else-if="state._tag === 'finished' && state.notice._tag === 'sign_in'"
          :to="signInPath"
          external
          label="Sign in with GitHub"
          icon="i-lucide-github"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
        />
        <UButton
          v-else
          :label="state._tag === 'finished' ? 'Try again' : 'Check now'"
          :icon="state._tag === 'finished' ? 'i-lucide-refresh-cw' : 'i-lucide-scan-search'"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
          :loading="state._tag === 'scanning'"
          :disabled="privacyMutation.pending.value"
          @click="checkNow"
        />
        <UButton
          label="Turn this off"
          size="sm"
          color="neutral"
          variant="ghost"
          class="min-h-11"
          :loading="privacyMutation.pending.value"
          :disabled="state._tag === 'scanning'"
          @click="turnOff"
        />
        <span v-if="state._tag === 'scanning'" class="text-xs text-muted" role="status" aria-live="polite">
          Checking your public repositories. This can take a minute.
        </span>
      </div>
    </template>
  </section>
</template>
