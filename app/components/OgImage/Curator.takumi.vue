<script setup lang="ts">
const {
  handle,
  displayName = '',
  description = '',
  avatar = '',
  collectionCount = 0,
  skillCount = 0,
} = defineProps<{
  handle: string
  displayName?: string
  description?: string
  avatar?: string
  collectionCount?: number
  skillCount?: number
}>()

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const stats = computed(() => {
  const items: string[] = []
  if (collectionCount > 0)
    items.push(`${collectionCount} collection${collectionCount !== 1 ? 's' : ''}`)
  if (skillCount > 0)
    items.push(`${skillCount} skill${skillCount !== 1 ? 's' : ''}`)
  return items.join(' · ')
})
</script>

<template>
  <OgLayout>
    <!-- Rose accent bar -->
    <div
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'oklch(0.555 0.225 17.32)',
      }"
    />
    <div class="px-15 py-14 flex flex-col justify-center gap-8 h-full">
      <OgBrand :size="36" />

      <div class="flex items-center gap-6">
        <!-- Avatar with rose ring -->
        <span
          class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
          :style="{
            width: '100px',
            height: '100px',
            border: '3px solid oklch(0.555 0.225 17.32)',
            background: 'oklch(0.22 0.012 60)',
          }"
        >
          <img
            v-if="avatar"
            :src="avatar"
            :alt="handle"
            width="96"
            height="96"
            class="w-full h-full object-cover"
          >
          <span
            v-else
            class="font-medium"
            :style="{ fontSize: '32px', color: 'oklch(0.62 0.01 60)' }"
          >
            {{ getInitials(displayName || handle) }}
          </span>
        </span>

        <div class="flex flex-col gap-1">
          <div
            v-if="displayName"
            class="text-5xl font-mono tracking-tight leading-none"
          >
            {{ displayName }}
          </div>
          <div
            class="text-4xl font-mono tracking-tight leading-none"
            :style="{ color: 'oklch(0.62 0.01 60)' }"
          >
            @{{ handle }}
          </div>
        </div>
      </div>

      <div
        v-if="description"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)', opacity: 0.7, lineClamp: 2, textOverflow: 'ellipsis' }"
      >
        {{ description }}
      </div>

      <div
        v-if="stats"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)' }"
      >
        {{ stats }}
      </div>
    </div>
  </OgLayout>
</template>
