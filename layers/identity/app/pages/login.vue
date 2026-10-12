<script setup lang="ts">
import { parseReturnTo } from '#shared/return-to'

definePageMeta({ layout: 'auth', middleware: ['session'], authWide: true })

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
  <section class="mx-auto grid w-full max-w-md gap-5 lg:max-w-[51rem] lg:grid-cols-[minmax(0,448px)_320px] lg:items-start lg:justify-center">
    <div class="w-full rounded-lg border border-accented bg-elevated p-6 sm:p-8">
      <h1 class="text-3xl font-semibold leading-tight tracking-tight text-highlighted text-balance">
        {{ actionMessage ? 'Sign in to skilld' : 'Find Skills from your GitHub stars' }}
      </h1>
      <p class="mt-3 text-sm text-muted leading-relaxed">
        Use your GitHub account. New here? The same step creates your account.
      </p>
      <p v-if="actionMessage" class="mt-6 text-base font-medium">
        {{ actionMessage }}
      </p>
      <div class="mt-8">
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
      <p class="mt-6 flex items-start gap-2 border-t border-default pt-5 text-xs text-muted leading-relaxed">
        <UIcon name="i-lucide-lock-keyhole" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>We ask for your public profile and email address.</span>
      </p>
      <p
        v-if="error"
        class="mt-4 text-sm text-error"
        role="alert"
      >
        Couldn't complete sign-in. Try again.
      </p>
    </div>
    <aside class="w-full rounded-lg border border-default bg-muted/60 p-6 sm:p-8" aria-labelledby="account-benefits-heading">
      <h2 id="account-benefits-heading" class="mb-6 flex items-center gap-2.5 text-lg font-semibold tracking-tight text-highlighted">
        <UIcon name="i-lucide-git-branch" class="size-5 shrink-0" aria-hidden="true" />
        Keep updated.
      </h2>
      <dl class="space-y-5">
        <div class="relative pl-7">
          <UIcon name="i-lucide-heart" class="absolute top-0.5 left-0 size-4 text-muted" aria-hidden="true" />
          <dt class="text-sm font-semibold text-highlighted">
            Your skills
          </dt>
          <dd class="mt-1 text-sm text-muted leading-relaxed">
            Like Skills to find them again in your account.
          </dd>
        </div>
        <div class="relative pl-7">
          <UIcon name="i-lucide-bell" class="absolute top-0.5 left-0 size-4 text-muted" aria-hidden="true" />
          <dt class="text-sm font-semibold text-highlighted">
            Watch for changes
          </dt>
          <dd class="mt-1 text-sm text-muted leading-relaxed">
            Watch the Repositories you use and see what changed.
          </dd>
        </div>
        <div class="relative pl-7">
          <UIcon name="i-lucide-mail" class="absolute top-0.5 left-0 size-4 text-muted" aria-hidden="true" />
          <dt class="text-sm font-semibold text-highlighted">
            Email updates
          </dt>
          <dd class="mt-1 text-sm text-muted leading-relaxed">
            Choose the weekly, monthly watched changes, or neither.
          </dd>
        </div>
      </dl>
      <NuxtLink to="/weekly/preview" external class="mt-5 inline-flex min-h-11 items-center gap-2 font-mono text-xs text-default underline underline-offset-4 transition-colors hover:text-primary">
        Preview the weekly
        <UIcon name="i-lucide-arrow-right" class="size-4" aria-hidden="true" />
      </NuxtLink>
      <NuxtLink to="/digest/preview" external class="inline-flex min-h-11 items-center gap-2 font-mono text-xs text-default underline underline-offset-4 transition-colors hover:text-primary">
        See an example digest
        <UIcon name="i-lucide-arrow-up-right" class="size-4" aria-hidden="true" />
      </NuxtLink>
    </aside>
  </section>
</template>
