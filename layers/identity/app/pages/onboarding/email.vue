<script setup lang="ts">
import type { IdentityEmailPatchBody, IdentityMutationResponse } from '../../../shared/contracts/account'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'

definePageMeta({ middleware: ['auth'] })

const { data: me } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { fetchSession } = useAuth()

const email = ref(me.value?.digest_email || me.value?.email || '')
const optIn = ref(true)
const weeklyOptIn = ref(true)

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
const missingAddress = computed(() => (optIn.value || weeklyOptIn.value)
  && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email.value.trim()))

const submitting = computed(() => saveEmailMutation.pending.value || finishOnboardingMutation.pending.value)
async function finish() {
  if (missingAddress.value)
    return
  const saved = await saveEmailMutation.mutateSafe({
    digest_email: email.value,
    email_opt_in: optIn.value,
    weekly_opt_in: weeklyOptIn.value,
  })
  if (saved._tag === 'err')
    return

  const onboarded = await finishOnboardingMutation.mutateSafe()
  if (onboarded._tag === 'err')
    return

  await fetchSession()
  await navigateTo('/me?welcome=1')
}

useSeoMeta({ title: 'Email opt-in', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-md px-4 sm:px-6 pt-8 pb-12 md:pt-12">
    <OnboardingSteps :step="2" />
    <h1 class="mt-6 font-mono text-2xl font-medium">
      Email
    </h1>
    <p class="mt-2 text-sm text-muted">
      Choose which useful updates reach your inbox. You can change this later.
    </p>

    <div class="mt-6 space-y-4">
      <div>
        <label for="email" class="text-xs uppercase tracking-wide text-muted">Email address</label>
        <input
          id="email"
          v-model="email"
          type="email"
          :aria-invalid="missingAddress"
          :aria-describedby="missingAddress ? 'email-error' : undefined"
          autocomplete="email"
          class="mt-1 min-h-11 w-full rounded border border-default bg-default px-3 py-2 font-mono text-sm"
        >
        <p v-if="missingAddress" id="email-error" class="mt-1 text-xs text-error">
          Add an email address, or turn off both emails.
        </p>
      </div>

      <label class="flex min-h-11 items-start gap-3 cursor-pointer">
        <input v-model="weeklyOptIn" type="checkbox" class="mt-0.5 size-4 accent-primary">
        <span class="text-sm text-muted leading-relaxed">
          Send me distinct trending Skills each Monday.
        </span>
      </label>

      <label class="flex min-h-11 items-start gap-3 cursor-pointer">
        <input v-model="optIn" type="checkbox" class="mt-0.5 size-4 accent-primary">
        <span class="text-sm text-muted leading-relaxed">
          Send me watched changes once a month.
        </span>
      </label>

      <p v-if="!optIn && !weeklyOptIn" class="rounded-lg border border-default bg-elevated/50 p-3 text-xs text-muted">
        You won't receive any emails. You can opt in later from your dashboard.
      </p>
    </div>

    <div class="mt-8 flex items-center justify-between">
      <UButton
        to="/onboarding/discover"
        label="Back"
        leading-icon="i-lucide-arrow-left"
        size="sm"
        class="min-h-11"
        color="neutral"
        variant="ghost"
      />
      <UButton
        :loading="submitting"
        :disabled="missingAddress"
        label="Finish"
        trailing-icon="i-lucide-check"
        size="sm"
        class="min-h-11"
        @click="finish"
      />
    </div>
  </section>
</template>
