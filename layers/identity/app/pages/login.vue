<script setup lang="ts">
const route = useRoute()
const { loginUrl } = useAuth()
const { loggedIn } = useUserSession()

const returnTo = computed(() => typeof route.query.return_to === 'string' ? route.query.return_to : '')
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
  <section class="mx-auto max-w-md px-4 sm:px-6 pt-16 pb-12 md:pt-24">
    <div class="rounded-lg border border-default p-6 sm:p-8 text-center">
      <UIcon name="i-lucide-github" class="mx-auto size-8 text-muted" aria-hidden="true" />
      <h1 class="mt-3 font-mono text-lg font-medium">
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
          size="sm"
          block
        />
      </div>
      <p
        v-if="error"
        class="mt-3 text-xs text-error"
      >
        Couldn't complete sign-in. Try again.
      </p>
    </div>
  </section>
</template>
