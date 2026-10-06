<script setup lang="ts">
import { ogCount, ogInitials, ogText, ogTextList } from '../../utils/og-props'
import { OG_DIMMED, OG_MUTED, OG_RULE, OG_SURFACE, ogLineStyle, ogTitleSize, ogTitleStyle } from '../../utils/og-style'

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

// Without a display name, the handle is the title.
const heading = computed(() => safeDisplayName.value || `@${safeHandle.value}`)
const titleSize = computed(() => ogTitleSize(heading.value, { max: 72, min: 48 }))

const meta = computed(() => {
  const collectionCount = ogCount(props.collectionCount)
  const skillCount = ogCount(props.skillCount)
  const items: string[] = safeDisplayName.value ? [`@${safeHandle.value}`] : []
  if (collectionCount > 0)
    items.push(`${collectionCount} collection${collectionCount !== 1 ? 's' : ''}`)
  if (skillCount > 0)
    items.push(`${skillCount} skill${skillCount !== 1 ? 's' : ''}`)
  return items.join(' · ')
})
</script>

<template>
  <OgLayout>
    <!-- A stone ring: the lockup dot is the card's one rose element. -->
    <span
      class="flex items-center justify-center rounded-full overflow-hidden shrink-0 mb-6"
      :style="{ width: '96px', height: '96px', border: `3px solid ${OG_RULE}`, background: OG_SURFACE }"
    >
      <img
        v-if="safeAvatar"
        :src="safeAvatar"
        :alt="safeHandle"
        width="90"
        height="90"
        class="w-full h-full object-cover"
      >
      <span v-else class="font-medium" :style="{ fontSize: '32px', color: OG_MUTED }">
        {{ initials }}
      </span>
    </span>

    <div :style="{ ...ogTitleStyle(titleSize, 1), wordBreak: 'break-all' }">
      {{ heading }}
    </div>

    <div v-if="meta" class="mt-4" :style="ogLineStyle(28, 1)">
      {{ meta }}
    </div>

    <OgLines v-if="safeDescription" class="mt-5" :text="safeDescription" :size="26" :color="OG_DIMMED" />

    <div v-if="safeSkills.length" class="font-mono mt-5" :style="ogLineStyle(22, 1, OG_DIMMED)">
      {{ safeSkills.slice(0, 3).join(' · ') }}
    </div>
  </OgLayout>
</template>
