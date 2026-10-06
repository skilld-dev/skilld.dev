<script setup lang="ts">
import { ogCount, ogInitials, ogText, ogTextList } from '../../utils/og-props'
import { OG_DIMMED, OG_MUTED, OG_RULE, OG_SURFACE, ogLineStyle, ogTitleSize } from '../../utils/og-style'

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
const titleSize = computed(() => ogTitleSize(safeName.value, { max: 80, min: 56, lines: 2 }))

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
    <OgLines :text="safeName" :size="titleSize" face="title" />

    <OgLines v-if="safeDescription" class="mt-5" :text="safeDescription" :size="28" />

    <!-- Curator -->
    <div class="flex items-center justify-center mt-7" :style="{ gap: '12px' }">
      <span
        class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
        :style="{ width: '40px', height: '40px', background: OG_SURFACE }"
      >
        <img
          v-if="safeCuratorAvatar"
          :src="safeCuratorAvatar"
          :alt="safeCuratorHandle"
          width="40"
          height="40"
          class="w-full h-full object-cover"
        >
        <span v-else class="font-medium" :style="{ fontSize: '14px', color: OG_MUTED }">
          {{ initials }}
        </span>
      </span>
      <span class="text-3xl" :style="{ color: OG_MUTED }">
        @{{ safeCuratorHandle }} · {{ safeSkillCount }} skill{{ safeSkillCount !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Curator note -->
    <div
      v-if="truncatedReason"
      class="flex flex-col items-center mt-7"
      :style="{ width: '100%', borderTop: `2px solid ${OG_RULE}`, paddingTop: '20px', gap: '6px' }"
    >
      <OgLines :text="`“${truncatedReason}”`" :size="24" color="oklch(0.9 0.006 60)" />
      <span v-if="safeReasonSkill" class="font-mono text-xl" :style="{ color: OG_MUTED }">
        on {{ safeReasonSkill }}
      </span>
    </div>
    <div v-else-if="safeSkills.length" class="font-mono mt-6" :style="ogLineStyle(22, 1, OG_DIMMED)">
      {{ safeSkills.slice(0, 4).join(' · ') }}
    </div>
  </OgLayout>
</template>
