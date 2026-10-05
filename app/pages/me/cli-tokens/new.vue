<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { useTokenCreation } from '#layers/identity/app/composables/useTokenCreation'
import SetupSnippet from '#layers/marketing/app/components/_SetupSnippet.vue'

definePageMeta({ layout: 'account', middleware: ['auth'] })

const schema = z.object({
  label: z.string().trim().min(1, 'Enter a token label.').max(80, 'Use 80 characters or fewer.'),
  ttl: z.enum(['30', '90', '365']),
})
const form = reactive<z.input<typeof schema>>({ label: '', ttl: '90' })
// The composable parses the answer, so do not infer Nitro's full route union.
const { state, create } = useTokenCreation(input => $fetch<Record<string, unknown>, string>('/api/me/cli-tokens', { method: 'POST', body: input }))
const tokenEnv = computed(() => state.value._tag === 'created' ? `SKILLD_TOKEN="${state.value.token.accessToken}"` : '')
const expires = computed(() => state.value._tag === 'created'
  ? new Date(state.value.token.expiresAt * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
  : '')

async function createToken(event: FormSubmitEvent<z.output<typeof schema>>): Promise<void> {
  await create({ label: event.data.label, ttl_days: Number(event.data.ttl) })
}

useSeoMeta({ title: 'New token', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-xl py-6 sm:py-8">
    <UButton to="/me/devices" label="Devices and tokens" icon="i-lucide-arrow-left" color="neutral" variant="link" class="mb-4 min-h-11 px-0" />
    <header class="border-b border-default pb-6">
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
        New token
      </h1>
      <p class="mt-3 text-base leading-relaxed text-muted">
        Use a token for the skilld API or CLI.
      </p>
    </header>

    <UForm v-if="state._tag !== 'created'" :schema="schema" :state="form" class="mt-6 space-y-5" @submit="createToken">
      <UFormField label="Label" name="label" description="Choose a name you can recognise when you revoke it." required>
        <UInput v-model="form.label" placeholder="API script" maxlength="80" autocomplete="off" :disabled="state._tag === 'creating'" :ui="{ base: 'min-h-11' }" class="w-full" />
      </UFormField>
      <UFormField label="Expiry" name="ttl">
        <USelect
          v-model="form.ttl"
          :items="[
            { label: '30 days', value: '30' },
            { label: '90 days', value: '90' },
            { label: '365 days', value: '365' },
          ]"
          :disabled="state._tag === 'creating'"
          :ui="{ base: 'min-h-11' }"
          class="w-full"
        />
      </UFormField>
      <p v-if="state._tag === 'failed'" role="alert" class="text-sm text-error">
        Could not create the token. Try again.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" label="Create token" icon="i-lucide-key-round" :loading="state._tag === 'creating'" :disabled="state._tag === 'creating'" class="min-h-11" />
        <UButton to="/me/devices" label="Cancel" color="neutral" variant="link" class="min-h-11" />
      </div>
    </UForm>

    <div v-else class="mt-6" role="status" aria-live="polite">
      <h2 class="text-lg font-semibold">
        Token created
      </h2>
      <p class="mt-2 text-sm leading-relaxed text-muted">
        Copy it now. This token is shown once and expires {{ expires }}.
      </p>
      <p class="mt-3 text-sm text-muted">
        Save this in your .env file. Keep that file out of source control.
      </p>
      <SetupSnippet class="mt-3" :code="tokenEnv" label=".env example" format="bash" />
      <div class="mt-4 flex flex-wrap gap-3">
        <UButton to="/developers?setup=api" label="View API examples" class="min-h-11" />
        <UButton to="/me/devices" label="Manage tokens" color="neutral" variant="outline" class="min-h-11" />
      </div>
    </div>
  </section>
</template>
