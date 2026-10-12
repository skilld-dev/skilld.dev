<script setup lang="ts">
import { parseReturnTo } from '#shared/return-to'

definePageMeta({ layout: 'auth', middleware: ['session'] })

const route = useRoute()
const { loginUrl } = useAuth()
const { loggedIn } = useUserSession()

const returnTo = computed(() => typeof route.query.return_to === 'string' ? parseReturnTo(route.query.return_to, '') : '')
const action = computed(() => typeof route.query.action === 'string' ? route.query.action : '')
const error = computed(() => typeof route.query.error === 'string' ? route.query.error : '')

const href = computed(() => loginUrl({ returnTo: returnTo.value, action: action.value }))
const actionMessage = computed(() => {
  if (action.value === 'like-skill')
    return 'Sign in to like this Skill.'
  if (action.value === 'watch-skill')
    return 'Sign in to watch this Repository.'
  if (action.value === 'watch-collection')
    return 'Sign in to watch this collection.'
  return ''
})

watchEffect(async () => {
  if (loggedIn.value)
    await navigateTo(returnTo.value || '/me', { replace: true })
})

useSeoMeta({
  title: 'Sign in',
  description: 'Sign in with GitHub to keep liked Skills, watch for changes, and choose your emails.',
  robots: 'noindex',
})
</script>

<template>
  <section class="mx-auto w-full max-w-md">
    <div class="rounded-lg border border-default bg-default p-6 sm:p-8">
      <h1 class="text-2xl font-semibold tracking-tight">
        Sign in to skilld
      </h1>
      <p class="mt-3 text-base text-muted leading-relaxed">
        Use your GitHub account. New here? The same step creates your account.
      </p>
      <dl class="mt-6 space-y-5 border-y border-default py-6">
        <div>
          <dt class="font-semibold">
            Your skills
          </dt>
          <dd class="mt-1 text-base text-muted">
            Like Skills to find them again in your account.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">
            Watch for changes
          </dt>
          <dd class="mt-1 text-base text-muted">
            Watch the Repositories you use and see what changed.
          </dd>
        </div>
        <div>
          <dt class="font-semibold">
            Email updates
          </dt>
          <dd class="mt-1 text-base text-muted">
            Choose the weekly, monthly watched changes, or neither.
          </dd>
        </div>
      </dl>
      <NuxtLink to="/weekly/preview" class="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-muted underline hover:text-default">
        Preview the weekly
        <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
      </NuxtLink>
      <p v-if="actionMessage" class="mt-3 text-base font-medium">
        {{ actionMessage }}
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
      <p class="mt-4 text-sm text-muted">
        We ask for your public profile and email address.
      </p>
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
