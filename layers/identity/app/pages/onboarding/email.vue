<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const { data: me } = await useFetch('/api/me')
const { fetchSession } = useAuth()

const email = ref(me.value?.digest_email || me.value?.email || '')
const optIn = ref(true)

const actionFailed = useActionFailure()

const submitting = ref(false)
async function finish() {
  submitting.value = true
  await $fetch('/api/me/email', {
    method: 'PATCH',
    body: { digest_email: email.value, email_opt_in: optIn.value },
  }).catch(actionFailed('save your digest email'))
  await $fetch('/api/me/onboarded', { method: 'POST' }).catch(actionFailed('finish setting up your account'))
  await fetchSession()
  submitting.value = false
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
          class="mt-1 w-full rounded border border-default bg-default px-2 py-1 font-mono text-sm"
        >
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
        label="Finish"
        trailing-icon="i-lucide-check"
        size="sm"
        @click="finish"
      />
    </div>
  </section>
</template>
