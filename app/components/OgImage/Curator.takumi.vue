<script setup lang="ts">
import { ogCount, ogInitials, ogText, ogTextList } from '../../utils/og-props'

// Declared as the wire types the OG image URL can deliver, not as the types the
// template wants. A login such as `24601` arrives as a number.
const props = defineProps<{
  handle: string | number | null
  displayName?: string | number | null
  description?: string | number | null
  avatar?: string | number | null
  collectionCount?: string | number | null
  skillCount?: string | number | null
  skills?: unknown
}>()

const safeHandle = computed(() => ogText(props.handle))
const safeDisplayName = computed(() => ogText(props.displayName))
const safeDescription = computed(() => ogText(props.description))
const safeAvatar = computed(() => ogText(props.avatar))
const initials = computed(() => ogInitials(safeDisplayName.value || safeHandle.value))
const safeSkills = computed(() => ogTextList(props.skills))

const stats = computed(() => {
  const collectionCount = ogCount(props.collectionCount)
  const skillCount = ogCount(props.skillCount)
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
    <div class="px-15 py-14 flex flex-col justify-center gap-8 h-full">
      <OgBrand :size="36" />

      <div class="flex items-center gap-6">
        <!-- Avatar with a stone ring: the lockup dot is the card's one rose element -->
        <span
          class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
          :style="{
            width: '100px',
            height: '100px',
            border: '3px solid oklch(0.36 0.012 60)',
            background: 'oklch(0.22 0.012 60)',
          }"
        >
          <img
            v-if="safeAvatar"
            :src="safeAvatar"
            :alt="safeHandle"
            width="96"
            height="96"
            class="w-full h-full object-cover"
          >
          <span
            v-else
            class="font-medium"
            :style="{ fontSize: '32px', color: 'oklch(0.62 0.01 60)' }"
          >
            {{ initials }}
          </span>
        </span>

        <div class="flex flex-col gap-1">
          <div
            v-if="safeDisplayName"
            class="text-5xl font-mono tracking-tight leading-none"
          >
            {{ safeDisplayName }}
          </div>
          <div
            class="text-4xl font-mono tracking-tight leading-none"
            :style="{ color: 'oklch(0.62 0.01 60)' }"
          >
            @{{ safeHandle }}
          </div>
        </div>
      </div>

      <div
        v-if="safeDescription"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)', opacity: 0.7, lineClamp: 2, textOverflow: 'ellipsis' }"
      >
        {{ safeDescription }}
      </div>

      <div
        v-if="stats"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)' }"
      >
        {{ stats }}
      </div>

      <div
        v-if="safeSkills.length"
        class="font-mono text-2xl"
        :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 1, textOverflow: 'ellipsis' }"
      >
        {{ safeSkills.slice(0, 3).join(' · ') }}
      </div>
    </div>
  </OgLayout>
</template>
