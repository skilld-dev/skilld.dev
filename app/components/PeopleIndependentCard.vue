<script setup lang="ts">
import type { IndependentDev } from '../../server/api/people/independent.get'

defineProps<{ dev: IndependentDev }>()

const avatarFailed = ref(false)
</script>

<template>
  <NuxtLink
    :to="ownerHubPath(dev.owner)"
    :aria-label="`${dev.displayName}, ${dev.skillCount} skills`"
    class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
  >
    <div class="flex items-start gap-3">
      <img
        v-if="!avatarFailed"
        :src="dev.avatar"
        :alt="`Avatar for ${dev.displayName}`"
        width="40"
        height="40"
        loading="lazy"
        decoding="async"
        class="size-10 rounded-full bg-muted"
        @error="avatarFailed = true"
      >
      <div
        v-else
        class="flex size-10 items-center justify-center rounded-full bg-muted"
      >
        <UIcon
          name="i-lucide-user"
          class="size-5 text-muted"
          aria-hidden="true"
        />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium truncate">
          {{ dev.displayName }}
        </p>
        <p class="font-mono text-xs text-muted inline-flex items-center gap-1">
          <UIcon
            name="i-lucide-github"
            class="size-3 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">@{{ dev.owner }}</span>
        </p>
      </div>
    </div>

    <div class="mt-3 flex items-center gap-3">
      <span class="data-label">{{ dev.skillCount }} {{ dev.skillCount === 1 ? 'skill' : 'skills' }}</span>
      <span
        v-if="dev.lastSyncedAt"
        class="data-label ml-auto"
      >
        {{ useTimeAgo(dev.lastSyncedAt * 1000).value }}
      </span>
    </div>
  </NuxtLink>
</template>
