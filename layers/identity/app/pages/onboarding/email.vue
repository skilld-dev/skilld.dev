<script setup lang="ts">
import type { IdentityEmailPatchBody, IdentityMutationResponse } from '../../../shared/contracts/account'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'

definePageMeta({ middleware: ['auth'] })

const { data: me } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { fetchSession } = useAuth()

const email = ref(me.value?.digest_email || me.value?.email || '')
const optIn = ref(true)

const actionFailed = useActionFailure()
const rpc = useNuxtRpc()

const saveEmailMutation = useNuxtMutation<IdentityEmailPatchBody, IdentityMutationResponse>({
  mutation: body => rpc.execute(identityAccountQueries.saveEmail(), body),
  invalidates: ['identity:me'],
  onError: actionFailed('save your digest email'),
})

const finishOnboardingMutation = useNuxtMutation<void, IdentityMutationResponse>({
  mutation: () => rpc.execute(identityAccountQueries.finishOnboarding()),
  invalidates: ['identity:me'],
  onError: actionFailed('finish setting up your account'),
})

// Opting in needs somewhere to send the digest, so the address is required
// exactly when the box is ticked.
const missingAddress = computed(() => optIn.value && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email.value.trim()))

const submitting = computed(() => saveEmailMutation.pending.value || finishOnboardingMutation.pending.value)
async function finish() {
  if (missingAddress.value)
    return
  const saved = await saveEmailMutation.mutateSafe({
    digest_email: email.value,
    email_opt_in: optIn.value,
  })
  if (saved._tag === 'err')
    return

  const onboarded = await finishOnboardingMutation.mutateSafe()
  if (onboarded._tag === 'err')
    return

  await fetchSession()
  await navigateTo('/me?welcome=1')
}

useSeoMeta({ title: 'Email opt-in · skilld', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-md px-4 sm:px-6 pt-8 pb-12 md:pt-12">
    <OnboardingSteps :step="3" />
    <h1 class="mt-6 font-mono text-2xl font-medium">
      Email
    </h1>
    <p class="mt-2 text-sm text-muted">
      Tell us where to send change digests. You can update this later from your dashboard.
    </p>

    <div class="mt-6 space-y-4">
      <div>
        <label for="email" class="text-xs uppercase tracking-wide text-muted">Digest email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          :aria-invalid="missingAddress"
          :aria-describedby="missingAddress ? 'email-error' : undefined"
          class="mt-1 w-full rounded border border-default bg-default px-2 py-1 font-mono text-sm"
        >
        <p v-if="missingAddress" id="email-error" class="mt-1 text-xs text-error">
          Add an email address, or untick the box below to skip digests.
        </p>
      </div>

      <label class="flex items-start gap-3 cursor-pointer">
        <input v-model="optIn" type="checkbox" class="mt-0.5">
        <span class="text-sm text-muted leading-relaxed">
          Email me when a watched repo changes.
        </span>
      </label>

      <p v-if="!optIn" class="rounded-lg border border-default bg-elevated/50 p-3 text-xs text-muted">
        You won't receive any emails. You can opt in later from your dashboard.
      </p>
    </div>

    <div class="mt-8 flex items-center justify-between">
      <UButton
        to="/onboarding/cadence"
        label="Back"
        leading-icon="i-lucide-arrow-left"
        size="sm"
        color="neutral"
        variant="ghost"
      />
      <UButton
        :loading="submitting"
        :disabled="missingAddress"
        label="Finish"
        trailing-icon="i-lucide-check"
        size="sm"
        @click="finish"
      />
    </div>
  </section>
</template>
