<script setup lang="ts">
import type { OwnedRepoScanNotice } from '../utils/owned-repo-scan'
import { identityAccountQueries } from '../queries/account'
import { ownedRepoScanFailureNotice, ownedRepoScanNotice } from '../utils/owned-repo-scan'

/**
 * Asks before skilld indexes the signed-in account's public repositories.
 * Sign-in never starts this scan; only the button does.
 */
const { login } = defineProps<{ login: string }>()

type PromptState
  = | { _tag: 'asking' }
    | { _tag: 'scanning' }
    | { _tag: 'finished', notice: OwnedRepoScanNotice }
    | { _tag: 'dismissed' }

const state = ref<PromptState>({ _tag: 'asking' })
const rpc = useNuxtRpc()

const scanMutation = useNuxtMutation({
  mutation: () => rpc.execute(identityAccountQueries.scanOwnedRepos()),
})

async function addSkills() {
  state.value = { _tag: 'scanning' }
  const outcome = await scanMutation.mutateSafe()
  state.value = {
    _tag: 'finished',
    notice: outcome._tag === 'ok' ? ownedRepoScanNotice(outcome.data) : ownedRepoScanFailureNotice(outcome.error),
  }
}

const route = useRoute()
const { loginUrl } = useAuth()
const signInPath = computed(() => loginUrl({ returnTo: route.fullPath }))
</script>

<template>
  <section
    v-if="state._tag !== 'dismissed'"
    class="rounded-lg border border-default p-4"
    aria-labelledby="owned-skills-prompt-heading"
  >
    <h2 id="owned-skills-prompt-heading" class="text-base font-semibold text-pretty">
      Add Skills from your public repositories to skilld.dev?
    </h2>
    <p class="mt-2 text-sm leading-relaxed text-muted text-pretty">
      skilld checks your public GitHub repositories for SKILL.md files. Each Skill it finds gets a public page. Nothing is added until you choose.
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
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton
          v-if="state.notice._tag === 'added'"
          :to="`/@${login}`"
          label="View your Skills"
          icon="i-lucide-user-round"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
        />
        <UButton
          v-else-if="state.notice._tag === 'retry'"
          label="Try again"
          icon="i-lucide-refresh-cw"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
          @click="addSkills"
        />
        <UButton
          v-else-if="state.notice._tag === 'sign_in'"
          :to="signInPath"
          external
          label="Sign in with GitHub"
          icon="i-lucide-github"
          size="sm"
          color="neutral"
          variant="outline"
          class="min-h-11"
        />
      </div>
    </div>

    <div v-else class="mt-4 flex flex-wrap items-center gap-2">
      <UButton
        label="Add my Skills"
        icon="i-lucide-scan-search"
        size="sm"
        class="min-h-11"
        :loading="state._tag === 'scanning'"
        @click="addSkills"
      />
      <UButton
        v-if="state._tag === 'asking'"
        label="Not now"
        size="sm"
        color="neutral"
        variant="ghost"
        class="min-h-11"
        @click="state = { _tag: 'dismissed' }"
      />
      <span v-else class="text-xs text-muted" role="status" aria-live="polite">
        Checking your public repositories. This can take a minute.
      </span>
    </div>
  </section>
</template>
