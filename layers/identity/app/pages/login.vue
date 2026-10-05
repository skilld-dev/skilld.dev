<script setup lang="ts">
import { parseReturnTo } from '#shared/return-to'

definePageMeta({ middleware: ['session'] })

const route = useRoute()
const { loginUrl } = useAuth()
const { loggedIn } = useUserSession()

const returnTo = computed(() => typeof route.query.return_to === 'string' ? parseReturnTo(route.query.return_to, '') : '')
const action = computed(() => typeof route.query.action === 'string' ? route.query.action : '')
const error = computed(() => typeof route.query.error === 'string' ? route.query.error : '')

const href = computed(() => loginUrl({ returnTo: returnTo.value, action: action.value }))

watchEffect(async () => {
  if (loggedIn.value)
    await navigateTo(returnTo.value || '/me', { replace: true })
})

useSeoMeta({
  title: 'Sign in',
  description: 'Sign in with GitHub to like skills, build collections, and get the weekly.',
  robots: 'noindex',
})
</script>

<template>
  <section class="mx-auto max-w-md px-4 sm:px-6 pt-10 pb-12 md:pt-16">
    <div class="rounded-lg border border-default p-4 sm:p-5">
      <h1 class="text-2xl font-semibold tracking-tight">
        Sign in to skilld
      </h1>
      <p class="mt-2 text-sm text-muted leading-relaxed">
        Like skills, build collections, and get the weekly: changes to your skills, plus what devs are talking about. We ask for your public profile and email address.
      </p>
      <div class="mt-5">
        <UButton
          :to="href"
          external
          label="Continue with GitHub"
          icon="i-lucide-github"
          trailing-icon="i-lucide-arrow-right"
          size="md"
          class="min-h-11"
          block
        />
      </div>
      <p
        v-if="error"
        class="mt-4 text-sm text-error"
        role="alert"
      >
        Couldn't complete sign-in. Try again.
      </p>
    </div>
  </section>
</template>
