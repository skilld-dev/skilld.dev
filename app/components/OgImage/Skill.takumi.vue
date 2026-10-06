<script setup lang="ts">
import { ogCount, ogInitials, ogText } from '../../utils/og-props'
import { OG_MUTED, OG_RULE, OG_SURFACE, ogLineStyle, ogTitleSize, ogTitleStyle } from '../../utils/og-style'

// Declared as the wire types the OG image URL can deliver, not as the types the
// template wants. An owner such as `24601` arrives as a number.
const props = defineProps<{
  name?: string | number | null
  displayName?: string | number | null
  owner?: string | number | null
  ownerAvatar?: string | number | null
  repo?: string | number | null
  curatorCount?: string | number | null
  reason?: string | number | null
  reasonHandle?: string | number | null
}>()

const safeName = computed(() => ogText(props.name))
const safeDisplayName = computed(() => ogText(props.displayName) || safeName.value)
const safeOwner = computed(() => ogText(props.owner))
const safeOwnerAvatar = computed(() => ogText(props.ownerAvatar))
const ownerInitials = computed(() => ogInitials(safeOwner.value))
const safeRepo = computed(() => ogText(props.repo) || 'skills')
const safeReason = computed(() => ogText(props.reason))
const safeReasonHandle = computed(() => ogText(props.reasonHandle))
const safeCuratorCount = computed(() => ogCount(props.curatorCount))
// A Skill name often has no space to wrap at, so it shrinks to one line.
const titleSize = computed(() => ogTitleSize(safeDisplayName.value, { max: 84, min: 40 }))
</script>

<template>
  <OgLayout>
    <div v-if="safeDisplayName" :style="{ ...ogTitleStyle(titleSize, 1), wordBreak: 'break-all' }">
      {{ safeDisplayName }}
    </div>

    <div v-if="safeOwner" class="flex items-center justify-center mt-7" :style="{ gap: '14px' }">
      <span
        class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
        :style="{ width: '44px', height: '44px', background: OG_SURFACE }"
      >
        <img
          v-if="safeOwnerAvatar"
          :src="safeOwnerAvatar"
          :alt="safeOwner"
          width="44"
          height="44"
          class="w-full h-full object-cover"
        >
        <span v-else class="font-medium text-xl" :style="{ color: OG_MUTED }">
          {{ ownerInitials }}
        </span>
      </span>
      <span class="font-mono text-3xl tracking-tight" :style="{ color: OG_MUTED }">
        {{ safeOwner }}{{ safeRepo !== 'skills' ? `/${safeRepo}` : '' }}
      </span>
    </div>

    <div
      v-if="safeReason"
      class="flex flex-col items-center mt-8"
      :style="{ width: '100%', borderTop: `2px solid ${OG_RULE}`, paddingTop: '24px', gap: '8px' }"
    >
      <OgLines :text="`“${safeReason}”`" :size="28" color="oklch(0.9 0.006 60)" />
      <span v-if="safeReasonHandle" class="font-mono text-2xl" :style="{ color: OG_MUTED }">
        @{{ safeReasonHandle }}
      </span>
    </div>
    <div v-else-if="safeCuratorCount > 0" class="mt-6" :style="ogLineStyle(28, 1)">
      {{ safeCuratorCount }} curator{{ safeCuratorCount !== 1 ? 's' : '' }} using this skill
    </div>
  </OgLayout>
</template>
