<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { githubAvatarProxyUrl } from '#shared/image-proxy'

/**
 * The sign-in control in the site header.
 *
 * Every public page renders it before the session is known, so the header
 * slot holds one fixed width through all three states: a placeholder while
 * the session loads, `Sign in`, or the avatar menu. The header items to its
 * left never move when the session lands.
 */
const { variant = 'bar' } = defineProps<{
  /** `bar` sits in the desktop header row; `menu` fills the mobile menu. */
  variant?: 'bar' | 'menu'
}>()

const { state, logout, isLoading } = useAuth()

const route = useRoute()
const signInTo = computed(() => route.path === '/login' ? route.fullPath : { path: '/login', query: { return_to: route.fullPath } })

const accountItems = computed<DropdownMenuItem[]>(() => {
  if (state.value._tag !== 'signed-in')
    return []
  return [
    { label: `@${state.value.user.login}`, icon: 'i-lucide-user', to: '/me' },
    { label: 'Sign out', disabled: isLoading.value, icon: 'i-lucide-log-out', onSelect: () => { void logout() } },
  ]
})
</script>

<template>
  <div
    v-if="variant === 'bar'"
    class="hidden w-24 shrink-0 items-center justify-end lg:flex"
    :aria-busy="state._tag === 'pending'"
  >
    <USkeleton
      v-if="state._tag === 'pending'"
      class="h-8 w-full"
    />
    <UButton
      v-else-if="state._tag === 'anonymous'"
      :to="signInTo"
      label="Sign in"
      color="neutral"
      variant="ghost"
      size="sm"
    />
    <!-- Lazy: only a signed-in visitor sees the menu, and the session loads after hydration. -->
    <LazyUDropdownMenu
      v-else
      :items="accountItems"
      :content="{ align: 'end' }"
      :ui="{ item: 'font-mono text-xs' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="size-11 justify-center p-0"
        :aria-label="`Signed in as @${state.user.login}`"
      >
        <!-- Mount after hydration so an early image failure reaches the fallback. -->
        <ClientOnly>
          <UAvatar
            :src="githubAvatarProxyUrl(state.user.login, 64)"
            :alt="state.user.login"
            size="xs"
            class="size-7"
          />
          <template #fallback>
            <span class="inline-flex size-7 items-center justify-center rounded-full bg-elevated text-xs">
              {{ state.user.login.charAt(0) }}
            </span>
          </template>
        </ClientOnly>
      </UButton>
    </LazyUDropdownMenu>
  </div>

  <div
    v-else
    class="flex flex-col gap-1"
    :aria-busy="state._tag === 'pending'"
  >
    <USkeleton
      v-if="state._tag === 'pending'"
      class="h-11 w-full"
    />
    <UButton
      v-else-if="state._tag === 'anonymous'"
      :to="signInTo"
      label="Sign in"
      color="neutral"
      variant="ghost"
      block
      class="min-h-11 justify-start"
    />
    <template v-else>
      <UButton
        to="/me"
        :label="`@${state.user.login}`"
        icon="i-lucide-user"
        color="neutral"
        variant="ghost"
        block
        class="min-h-11 justify-start"
      />
      <UButton
        label="Sign out"
        icon="i-lucide-log-out"
        color="neutral"
        variant="ghost"
        block
        class="min-h-11 justify-start"
        :loading="isLoading"
        @click="() => { void logout() }"
      />
    </template>
  </div>
</template>
