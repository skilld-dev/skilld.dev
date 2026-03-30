<script setup lang="ts">
const { curator } = defineProps<{
  curator: {
    name: string
    handle: string
    avatar: string
    bio?: string
    stacks: string[]
    collections: number
    skillCount?: number
    updated?: string
  }
}>()
</script>

<template>
  <NuxtLink
    :to="`/people/${curator.handle}`"
    class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
  >
    <div class="flex items-start gap-3">
      <img
        :src="curator.avatar"
        :alt="curator.name"
        width="36"
        height="36"
        loading="lazy"
        decoding="async"
        class="size-9 rounded-full"
      >
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium truncate">
          {{ curator.name }}
        </p>
        <p class="font-mono text-xs text-muted">
          @{{ curator.handle }}
        </p>
      </div>
    </div>

    <p
      v-if="curator.bio"
      class="mt-3 text-xs text-muted leading-relaxed line-clamp-2"
    >
      {{ curator.bio }}
    </p>

    <div class="mt-3 flex items-center gap-3">
      <span
        v-if="curator.skillCount"
        class="data-label"
      >{{ curator.skillCount }} skills</span>
      <span class="data-label">{{ curator.collections }} {{ curator.collections === 1 ? 'collection' : 'collections' }}</span>
      <span
        v-if="curator.updated"
        class="data-label ml-auto"
      >{{ curator.updated }}</span>
    </div>

    <div class="mt-3 flex flex-wrap gap-1">
      <UBadge
        v-for="stack in curator.stacks.slice(0, 3)"
        :key="stack"
        :label="stack"
        variant="subtle"
        color="neutral"
        size="xs"
      />
      <UBadge
        v-if="curator.stacks.length > 3"
        :label="`+${curator.stacks.length - 3}`"
        variant="subtle"
        color="neutral"
        size="xs"
      />
    </div>
  </NuxtLink>
</template>
