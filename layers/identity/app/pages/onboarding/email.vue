<script setup lang="ts">
import type { IdentityEmailPatchBody, IdentityMutationResponse } from '../../../shared/contracts/account'
import { signupEmailChoice } from '#shared/signup-analytics'
import { WELCOME_EMAIL_COPY } from '#shared/welcome-email-copy'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'

definePageMeta({ layout: 'auth', middleware: ['auth'] })

const { data: me, error: accountError, status: accountStatus, refresh: retryAccount } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { fetchSession } = useAuth()
const recordSignup = useSignupEvents()
onMounted(() => recordSignup({ stage: 'email', outcome: 'viewed', entry: 'onboarding' }))

const email = ref(me.value?.digest_email || me.value?.email || '')
// A stored address records a deliberate choice, including a previous opt-out.
const hasEmailChoices = computed(() => !!me.value?.onboarded_at || !!me.value?.digest_email)
const optIn = ref(hasEmailChoices.value ? !!me.value?.email_opt_in : false)
const weeklyOptIn = ref(hasEmailChoices.value ? !!me.value?.weekly_opt_in : false)
watch(me, (account, previous) => {
  if (account && !previous) {
    email.value = account.digest_email || account.email || ''
    optIn.value = hasEmailChoices.value ? account.email_opt_in : false
    weeklyOptIn.value = hasEmailChoices.value ? account.weekly_opt_in : false
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

const preview = ref<'weekly' | 'digest' | 'welcome' | null>(null)
const { data: previewHtml, status: previewStatus, error: previewError, refresh: loadPreview } = useFetch<string>(() => `/${preview.value || 'welcome'}/preview`, { immediate: false, watch: false, responseType: 'text' })
// Keep email links out of the sandboxed preview frame.
const previewDocument = computed(() => previewHtml.value?.replace(/<head\b[^>]*>/i, '$&<base target="_blank">'))
function openPreview(kind: 'weekly' | 'digest' | 'welcome') {
  preview.value = kind
  loadPreview()
}
const previewOpen = computed({
  get: () => preview.value !== null,
  set: (open: boolean) => {
    if (!open)
      preview.value = null
  },
})
const previewTitle = computed(() => preview.value === 'weekly' ? 'Preview the weekly' : preview.value === 'digest' ? 'Preview the digest' : 'Preview the welcome')
const checkboxUi = { base: 'size-6', container: 'h-6', wrapper: 'ms-3', label: 'min-h-11 cursor-pointer font-normal leading-6' }

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
          {{ WELCOME_EMAIL_COPY.missingAddress }}
        </p>
      </div>

      <div class="space-y-1">
        <UCheckbox v-model="weeklyOptIn" size="xl" :disabled="submitting" :ui="checkboxUi" label="Send me distinct trending Skills each Monday." />
        <UButton label="Preview the weekly" color="neutral" variant="link" class="min-h-11 px-0 ms-9" trailing-icon="i-lucide-arrow-up-right" @click="openPreview('weekly')" />
      </div>

      <div class="space-y-1">
        <UCheckbox v-model="optIn" size="xl" :disabled="submitting" :ui="checkboxUi" label="Send me watched changes once a month." />
        <UButton label="Preview the digest" color="neutral" variant="link" class="min-h-11 px-0 ms-9" trailing-icon="i-lucide-arrow-up-right" @click="openPreview('digest')" />
      </div>

      <div class="border-t border-default pt-3">
        <UButton label="Preview the welcome" color="neutral" variant="link" class="min-h-11 px-0" trailing-icon="i-lucide-arrow-up-right" @click="openPreview('welcome')" />
      </div>

      <p class="text-sm leading-relaxed text-muted">
        {{ WELCOME_EMAIL_COPY.emailChoices }}
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
    <UModal v-model:open="previewOpen" :title="previewTitle" :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }">
      <template #body>
        <div v-if="previewStatus === 'pending'" role="status" class="flex min-h-80 items-center justify-center text-muted">
          Loading email preview
        </div>
        <div v-else-if="previewError" role="alert" class="min-h-80 p-6">
          <p>Could not load the email preview. Try again.</p>
          <UButton label="Retry" color="neutral" variant="outline" class="mt-4 min-h-11" @click="loadPreview()" />
        </div>
        <iframe v-else-if="previewHtml" :srcdoc="previewDocument" :title="previewTitle" sandbox="allow-popups allow-popups-to-escape-sandbox" class="h-[65dvh] min-h-80 w-full border-0 bg-muted" />
      </template>
    </UModal>
  </section>
</template>
