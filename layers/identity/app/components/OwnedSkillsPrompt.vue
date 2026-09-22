<script setup lang="ts">
import type { OwnedRepoScanNotice } from '../utils/owned-repo-scan'
import { identityAccountQueries } from '../queries/account'
import { ownedRepoScanFailureNotice, ownedRepoScanNotice } from '../utils/owned-repo-scan'

/**
 * Tells the signed-in account that its public repositories are indexed, and
 * offers the switch that stops it.
 *
 * Sign-in already ran the scan, because SKILL.md files in a public repository
 * are already public and indexing them is how the registry grows. So this is a
 * notice with a way out, not a question.
 */
const { login } = defineProps<{ login: string }>()

type PromptState
  = | { _tag: 'indexing' }
    | { _tag: 'scanning' }
    | { _tag: 'finished', notice: OwnedRepoScanNotice }
    | { _tag: 'turned_off' }

const state = ref<PromptState>({ _tag: 'indexing' })
const rpc = useNuxtRpc()

const scanMutation = useNuxtMutation({
  mutation: () => rpc.execute(identityAccountQueries.scanOwnedRepos()),
})

const privacyMutation = useNuxtMutation({
  mutation: () => rpc.execute(identityAccountQueries.savePrivacy(), { repo_indexing: false }),
})

async function checkNow() {
  state.value = { _tag: 'scanning' }
  const outcome = await scanMutation.mutateSafe()
  state.value = {
    _tag: 'finished',
    notice: outcome._tag === 'ok' ? ownedRepoScanNotice(outcome.data) : ownedRepoScanFailureNotice(outcome.error),
  }
}

async function turnOff() {
  const outcome = await privacyMutation.mutateSafe()
  if (outcome._tag === 'ok')
    state.value = { _tag: 'turned_off' }
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
      Your public repositories are in skilld.dev
    </h2>
    <p class="mt-2 text-sm leading-relaxed text-muted text-pretty">
      skilld checks your public GitHub repositories for SKILL.md files. Each Skill it finds gets a public page. If you would rather it did not, turn it off here.
    </p>

    <p v-if="state._tag === 'turned_off'" class="mt-4 flex items-start gap-2 text-sm text-muted" role="status" aria-live="polite">
      <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Indexing is off. Skills already added stay until you remove the SKILL.md file, or ask us to.
    </p>

    <template v-else>
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
          @click="checkNow"
        />
        <UButton
          label="Turn this off"
          size="sm"
          color="neutral"
          variant="ghost"
          class="min-h-11"
          :loading="privacyMutation.pending.value"
          @click="turnOff"
        />
        <span v-if="state._tag === 'scanning'" class="text-xs text-muted" role="status" aria-live="polite">
          Checking your public repositories. This can take a minute.
        </span>
      </div>
    </template>
  </section>
</template>
