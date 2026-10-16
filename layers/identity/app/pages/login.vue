<script setup lang="ts">
import { useMediaQuery, useMounted, usePreferredReducedMotion } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { parseReturnTo } from '#shared/return-to'

definePageMeta({ layout: 'auth', middleware: ['session'], authWide: true })

const route = useRoute()
const { loginUrl } = useAuth()
const { loggedIn } = useUserSession()

const returnTo = computed(() => typeof route.query.return_to === 'string' ? parseReturnTo(route.query.return_to, '') : '')
const action = computed(() => typeof route.query.action === 'string' ? route.query.action : '')
const error = computed(() => typeof route.query.error === 'string' ? route.query.error : '')
const signup = computed(() => route.query.mode === 'signup')
const switchTo = computed(() => ({ path: route.path, query: { ...route.query, mode: signup.value ? 'signin' : 'signup' } }))
const mounted = useMounted()
const largeScreen = useMediaQuery('(min-width: 1024px)')
const reducedMotion = usePreferredReducedMotion()
const sideMotion = computed(() => mounted.value && largeScreen.value
  ? {
      initial: { opacity: 0, width: 0, height: 'auto', marginLeft: 0, marginTop: 0 },
      animate: { opacity: 1, width: 320, height: 'auto', marginLeft: 20, marginTop: 0 },
      exit: { opacity: 0, width: 0, height: 'auto', marginLeft: 0, marginTop: 0 },
    }
  : {
      initial: { opacity: 0, width: 'auto', height: 0, marginLeft: 0, marginTop: 0 },
      animate: { opacity: 1, width: 'auto', height: 'auto', marginLeft: 0, marginTop: 20 },
      exit: { opacity: 0, width: 'auto', height: 0, marginLeft: 0, marginTop: 0 },
    })

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
  if (!loggedIn.value || error.value)
    return

  // Public pages can still offer anonymous Like or Watch links after another
  // tab signs in. Keep the intent on the sealed OAuth replay path instead of
  // returning to the Skill without applying it. Failed replays stay retryable.
  if (returnTo.value && ['like-skill', 'watch-skill', 'watch-collection'].includes(action.value)) {
    await navigateTo(href.value, { external: true, replace: true })
    return
  }
  await navigateTo(returnTo.value || '/me', { replace: true })
})

useSeoMeta({
  title: () => signup.value ? 'Sign up' : 'Sign in',
  description: 'Sign in with GitHub to keep liked Skills, watch for changes, and choose your emails.',
  robots: 'noindex',
})
</script>

<template>
  <section class="mx-auto w-full max-w-md lg:flex lg:max-w-[51rem] lg:items-stretch lg:justify-center">
    <div class="flex w-full flex-col overflow-hidden rounded-lg border border-accented bg-elevated lg:max-w-md lg:shrink-0">
      <div :key="signup ? 'signup' : 'signin'" class="auth-content-in flex-1 px-6 pt-7 pb-3 sm:px-8 sm:pt-8">
        <h1 class="text-2xl font-semibold leading-tight tracking-tight text-highlighted text-balance">
          {{ signup ? 'Sign Up with GitHub' : 'Sign In with GitHub' }}
        </h1>
        <p class="mt-3 text-sm text-muted leading-relaxed">
          {{ actionMessage || 'Keep your liked Skills and watched Repositories together.' }}
        </p>
        <div class="mt-6">
          <UButton
            :to="href"
            external
            icon="i-lucide-github"
            trailing-icon="i-lucide-arrow-right"
            size="lg"
            class="min-h-12"
            block
          >
            Continue with GitHub
          </UButton>
        </div>
        <p
          v-if="error"
          class="mt-4 text-sm text-error"
          role="alert"
        >
          Couldn't complete sign-in. Try again.
        </p>
        <p class="mt-3 flex flex-wrap items-center gap-x-1 text-xs text-muted">
          {{ signup ? 'Already have an account?' : 'New to skilld?' }}
          <NuxtLink :to="switchTo" class="inline-flex min-h-11 items-center font-medium text-highlighted transition-colors hover:text-primary hover:underline underline-offset-4">
            {{ signup ? 'Sign in' : 'Sign up' }}
          </NuxtLink>
        </p>
      </div>
      <p class="flex items-start gap-2 border-t border-default bg-muted/30 px-6 py-4 text-xs text-muted leading-relaxed sm:px-8">
        <UIcon name="i-lucide-lock-keyhole" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>We ask for your public profile and email address.</span>
      </p>
    </div>
    <AnimatePresence :initial="false">
      <Motion
        v-if="signup"
        key="signup-benefits"
        :initial="sideMotion.initial"
        :animate="sideMotion.animate"
        :exit="sideMotion.exit"
        :transition="{ duration: reducedMotion === 'reduce' ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }"
        class="overflow-hidden lg:shrink-0"
      >
        <aside class="h-full w-full rounded-lg border border-default bg-elevated/70 p-6 lg:w-80" aria-labelledby="account-benefits-heading">
          <h2 id="account-benefits-heading" class="mb-5 text-lg font-semibold tracking-tight text-highlighted">
            Keep updated.
          </h2>
          <dl class="space-y-4">
            <div class="relative pl-7">
              <UIcon name="i-lucide-heart" class="absolute top-0.5 left-0 size-4 text-muted" aria-hidden="true" />
              <dt class="text-sm font-semibold text-highlighted">
                Your skills
              </dt>
              <dd class="mt-1 text-sm text-muted leading-5">
                Like Skills to find them again in your account.
              </dd>
            </div>
            <div class="relative pl-7">
              <UIcon name="i-lucide-bell" class="absolute top-0.5 left-0 size-4 text-muted" aria-hidden="true" />
              <dt class="text-sm font-semibold text-highlighted">
                Watch for changes
              </dt>
              <dd class="mt-1 text-sm text-muted leading-5">
                Watch the Repositories you use and see what changed.
              </dd>
            </div>
            <div class="relative pl-7">
              <UIcon name="i-lucide-mail" class="absolute top-0.5 left-0 size-4 text-muted" aria-hidden="true" />
              <dt class="text-sm font-semibold text-highlighted">
                Email updates
              </dt>
              <dd class="mt-1 text-sm text-muted leading-5">
                Choose the weekly, monthly watched changes, or neither.
              </dd>
            </div>
          </dl>
        </aside>
      </Motion>
    </AnimatePresence>
  </section>
</template>

<style scoped>
@keyframes auth-content-in {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: none; }
}
.auth-content-in {
  animation: auth-content-in 0.28s cubic-bezier(0.4, 0, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .auth-content-in { animation: none; }
}
</style>
