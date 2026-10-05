<script setup lang="ts">
import { ogCount, ogInitials, ogText, ogTextList } from '../../utils/og-props'

// Declared as the wire types the OG image URL can deliver, not as the types the
// template wants. A login such as `24601` arrives as a number.
const props = defineProps<{
  name: string | number | null
  description?: string | number | null
  curatorHandle: string | number | null
  curatorName?: string | number | null
  curatorAvatar?: string | number | null
  skillCount?: string | number | null
  skills?: unknown
  reason?: string | number | null
  reasonSkill?: string | number | null
}>()

const safeName = computed(() => ogText(props.name))
const safeDescription = computed(() => ogText(props.description))
const safeCuratorHandle = computed(() => ogText(props.curatorHandle))
const safeCuratorAvatar = computed(() => ogText(props.curatorAvatar))
const safeReasonSkill = computed(() => ogText(props.reasonSkill))
const safeSkillCount = computed(() => ogCount(props.skillCount))
const safeSkills = computed(() => ogTextList(props.skills))
const initials = computed(() => ogInitials(ogText(props.curatorName) || safeCuratorHandle.value))

const truncatedReason = computed(() => {
  const reason = ogText(props.reason)
  if (!reason)
    return ''
  const collapsed = reason.replace(/\s+/g, ' ').trim()
  return collapsed.length <= 140 ? collapsed : `${collapsed.slice(0, 139).replace(/\s+\S*$/, '')}…`
})
</script>

<template>
  <OgLayout>
    <div class="px-15 py-14 flex flex-col justify-center gap-8 h-full">
      <OgBrand :size="36" />

      <div class="flex flex-col gap-3">
        <div
          class="text-6xl tracking-tighter font-mono leading-none"
          :style="{ lineClamp: 1, textOverflow: 'ellipsis' }"
        >
          {{ safeName }}
        </div>

        <div
          v-if="safeDescription"
          class="text-3xl"
          :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 2, textOverflow: 'ellipsis' }"
        >
          {{ safeDescription }}
        </div>
      </div>

      <!-- Curator -->
      <div class="flex items-center gap-3">
        <span
          class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
          :style="{ width: '40px', height: '40px', background: 'oklch(0.22 0.012 60)' }"
        >
          <img
            v-if="safeCuratorAvatar"
            :src="safeCuratorAvatar"
            :alt="safeCuratorHandle"
            width="40"
            height="40"
            class="w-full h-full object-cover"
          >
          <span
            v-else
            class="font-medium"
            :style="{ fontSize: '14px', color: 'oklch(0.62 0.01 60)' }"
          >
            {{ initials }}
          </span>
        </span>
        <span class="text-3xl font-mono" :style="{ color: 'oklch(0.62 0.01 60)' }">
          @{{ safeCuratorHandle }}
        </span>
        <span class="text-3xl" :style="{ color: 'oklch(0.62 0.01 60)' }">
          · {{ safeSkillCount }} skill{{ safeSkillCount !== 1 ? 's' : '' }}
        </span>
      </div>

      <!-- Curator note -->
      <div
        v-if="truncatedReason"
        class="flex flex-col gap-2"
        :style="{
          borderLeft: '3px solid oklch(0.36 0.012 60)',
          paddingLeft: '16px',
        }"
      >
        <span
          class="text-2xl leading-snug"
          :style="{ color: 'oklch(0.93 0.005 60)', lineClamp: 3, textOverflow: 'ellipsis' }"
        >
          &ldquo;{{ truncatedReason }}&rdquo;
        </span>
        <span
          v-if="safeReasonSkill"
          class="font-mono text-xl"
          :style="{ color: 'oklch(0.62 0.01 60)' }"
        >
          on {{ safeReasonSkill }}
        </span>
      </div>

      <div
        v-else-if="safeSkills.length"
        class="font-mono text-2xl"
        :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 1, textOverflow: 'ellipsis' }"
      >
        {{ safeSkills.slice(0, 4).join(' · ') }}
      </div>
    </div>
  </OgLayout>
</template>
