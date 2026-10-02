<script setup lang="ts">
import { useTokenCreation } from '#layers/identity/app/composables/useTokenCreation'
import { apiSnippets } from '../utils/developer-setup'
import SetupSnippet from './_SetupSnippet.vue'

const { state: auth, loginUrl } = useAuth()
const { state, create } = useTokenCreation(input => $fetch('/api/me/cli-tokens', { method: 'POST', body: input }))
const tokenEnv = computed(() => state.value._tag === 'created'
  ? `SKILLD_TOKEN="${state.value.token.accessToken}"`
  : apiSnippets.tokenEnv)
const expires = computed(() => state.value._tag === 'created'
  ? new Date(state.value.token.expiresAt * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
  : '')
</script>

<template>
  <div>
    <p class="mt-2 text-sm leading-relaxed text-muted">
      Public operations need no token. Create one for account operations, such as watching a Repository.
      The same skilld token works in scripts and the CLI.
    </p>
    <p class="mt-2 text-sm leading-relaxed text-muted">
      Guests get 60 requests per minute per IP. Sign in or send a skilld token for 600 per account.
      These limits apply per Cloudflare location. If you reach a limit, wait 60 seconds, then retry.
    </p>
    <template v-if="state._tag !== 'created'">
      <p class="mt-2 text-sm text-muted">
        Label: API script. Expires in 90 days.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <UButton
          v-if="auth._tag === 'anonymous'"
          :to="loginUrl({ returnTo: '/developers?setup=api' })"
          external
          label="Sign in to create a token"
          icon="i-simple-icons-github"
          class="min-h-11"
        />
        <UButton
          v-else
          type="button"
          label="Create token"
          icon="i-lucide-key-round"
          :loading="state._tag === 'creating' || auth._tag === 'pending'"
          :disabled="auth._tag !== 'signed-in' || state._tag === 'creating'"
          class="min-h-11"
          @click="create({ label: 'API script', ttl_days: 90 })"
        />
        <UButton to="/me/devices" label="Manage tokens" color="neutral" variant="link" class="min-h-11 px-0 text-sm" />
      </div>
    </template>
    <p v-if="state._tag === 'failed'" role="alert" class="mt-3 text-sm text-error">
      Could not create the token. Try again.
    </p>
    <p class="mt-3 text-sm text-muted" role="status" aria-live="polite">
      <template v-if="state._tag === 'created'">
        Token created. Copy it now. It is shown once and expires {{ expires }}.
      </template>
      <template v-else-if="state._tag === 'creating'">
        Creating your token.
      </template>
      <template v-else>
        Save this in your .env file. Keep that file out of source control.
      </template>
    </p>
    <SetupSnippet class="mt-3" :code="tokenEnv" label=".env example" format="bash" />
    <UButton
      v-if="state._tag === 'created'"
      to="/me/devices"
      label="Manage tokens"
      color="neutral"
      variant="link"
      class="mt-2 min-h-11 px-0 text-sm"
    />
  </div>
</template>
