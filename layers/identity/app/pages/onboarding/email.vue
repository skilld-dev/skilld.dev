<script setup lang="ts">
import type { IdentityEmailPatchBody, IdentityMutationResponse } from '../../../shared/contracts/account'
import { signupEmailChoice } from '#shared/signup-analytics'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'

definePageMeta({ layout: 'auth', middleware: ['auth'] })

const { data: me, error: accountError, status: accountStatus, refresh: retryAccount } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { fetchSession } = useAuth()
const recordSignup = useSignupEvents()
onMounted(() => recordSignup({ stage: 'email', outcome: 'viewed', entry: 'onboarding' }))

const email = ref(me.value?.digest_email || me.value?.email || '')
// A stored address records a deliberate choice, including a previous opt-out.
const hasEmailChoices = computed(() => !!me.value?.onboarded_at || !!me.value?.digest_email)
const optIn = ref(hasEmailChoices.value ? !!me.value?.email_opt_in : true)
const weeklyOptIn = ref(hasEmailChoices.value ? !!me.value?.weekly_opt_in : true)
watch(me, (account, previous) => {
  if (account && !previous) {
    email.value = account.digest_email || account.email || ''
    optIn.value = hasEmailChoices.value ? account.email_opt_in : true
    weeklyOptIn.value = hasEmailChoices.value ? account.weekly_opt_in : true
  }
})

const actionFailed = useActionFailure()
const rpc = useNuxtRpc()

const saveEmailMutation = useNuxtMutation<IdentityEmailPatchBody, IdentityMutationResponse>({
  mutation: body => rpc.execute(identityAccountQueries.saveEmail(), body),
  invalidates: ['identity:me'],
  onError: actionFailed('save your digest email'),
  onMutate: () => actionFailed.clear('save your digest email'),
})

const finishOnboardingMutation = useNuxtMutation<void, IdentityMutationResponse>({
  mutation: () => rpc.execute(identityAccountQueries.finishOnboarding()),
  invalidates: ['identity:me'],
  onError: actionFailed('finish setting up your account'),
  onMutate: () => actionFailed.clear('finish setting up your account'),
})

// Opting in needs somewhere to send the digest, so the address is required
// exactly when the box is ticked.
const missingAddress = computed(() => (optIn.value || weeklyOptIn.value)
  && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email.value.trim()))

const submitting = computed(() => saveEmailMutation.pending.value || finishOnboardingMutation.pending.value)
async function finish() {
  if (!me.value || missingAddress.value || submitting.value)
    return
  const saved = await saveEmailMutation.mutateSafe({
    digest_email: email.value,
    email_opt_in: optIn.value,
    weekly_opt_in: weeklyOptIn.value,
  })
  if (saved._tag === 'err') {
    recordSignup({ stage: 'email', outcome: 'failed', entry: 'onboarding' })
    return
  }

  const onboarded = await finishOnboardingMutation.mutateSafe()
  if (onboarded._tag === 'err') {
    recordSignup({ stage: 'email', outcome: 'completion-failed', entry: 'onboarding' })
    return
  }

  recordSignup({ stage: 'email', outcome: 'saved', entry: 'onboarding', choice: signupEmailChoice(weeklyOptIn.value, optIn.value) })

  await fetchSession()
  await navigateTo('/me?welcome=1')
}

useSeoMeta({ title: 'Email opt-in', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto w-full max-w-md">
    <OnboardingSteps :step="2" />
    <h1 class="mt-6 text-2xl font-semibold tracking-tight">
      Email
    </h1>
    <p class="mt-2 text-sm text-muted">
      Choose which useful updates reach your inbox. You can change this later.
    </p>

    <div v-if="!me" class="editorial-state mt-6" :role="accountError ? 'alert' : 'status'">
      <p class="text-sm" :class="accountError ? 'text-error' : 'text-muted'">
        {{ accountError ? 'Could not load your account. Try again.' : 'Loading your account' }}
      </p>
      <UButton v-if="accountError" label="Retry" color="neutral" variant="outline" class="mt-4 min-h-11" :loading="accountStatus === 'pending'" @click="retryAccount()" />
    </div>
    <form v-else id="email-onboarding-form" novalidate class="mt-6 space-y-4" @submit.prevent="finish">
      <div>
        <label for="email" class="font-mono text-sm text-muted">Email address</label>
        <input
          id="email"
          v-model="email"
          type="email"
          :aria-invalid="missingAddress"
          :aria-describedby="missingAddress ? 'email-error' : undefined"
          autocomplete="email"
          :disabled="submitting"
          class="mt-2 min-h-11 w-full rounded-lg border border-default bg-default px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-primary"
        >
        <p v-if="missingAddress" id="email-error" class="mt-1 text-xs text-error">
          Add an email address, or turn off both emails.
        </p>
      </div>

      <label class="flex min-h-11 items-start gap-3 cursor-pointer">
        <input v-model="weeklyOptIn" type="checkbox" :disabled="submitting" class="mt-0.5 size-4 accent-primary">
        <span class="text-sm text-muted leading-relaxed">
          Send me distinct trending Skills each Monday.
        </span>
      </label>

      <label class="flex min-h-11 items-start gap-3 cursor-pointer">
        <input v-model="optIn" type="checkbox" :disabled="submitting" class="mt-0.5 size-4 accent-primary">
        <span class="text-sm text-muted leading-relaxed">
          Send me watched changes once a month.
        </span>
      </label>

      <p v-if="!optIn && !weeklyOptIn" class="rounded-lg border border-default bg-elevated/50 p-3 text-xs text-muted">
        You won't receive any emails. You can opt in later from your dashboard.
      </p>
    </form>

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
        :disabled="!me || missingAddress"
        label="Finish"
        trailing-icon="i-lucide-check"
        size="sm"
        class="min-h-11"
        type="submit"
        form="email-onboarding-form"
      />
    </div>
  </section>
</template>
