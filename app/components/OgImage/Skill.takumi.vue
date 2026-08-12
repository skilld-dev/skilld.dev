<script setup lang="ts">
import { ogCount, ogInitials, ogText } from '../../utils/og-props'

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
    <div class="px-15 py-14 flex flex-col justify-center gap-10 h-full">
      <OgBrand :size="36" />

      <div v-if="safeDisplayName" class="flex flex-col max-w-full gap-4">
        <div
          class="tracking-tighter font-mono leading-none"
          :class="safeDisplayName.length > 20 ? 'text-5xl' : 'text-6xl'"
          :style="{ lineClamp: 1, textOverflow: 'ellipsis', wordBreak: 'break-all' }"
        >
          {{ safeDisplayName }}
        </div>
        <div v-if="safeOwner" class="flex items-center gap-3">
          <span
            class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
            :style="{ width: '48px', height: '48px', background: 'oklch(0.22 0.012 60)' }"
          >
            <img
              v-if="safeOwnerAvatar"
              :src="safeOwnerAvatar"
              :alt="safeOwner"
              width="48"
              height="48"
              class="w-full h-full object-cover"
            >
            <span v-else class="font-medium text-xl" :style="{ color: 'oklch(0.62 0.01 60)' }">
              {{ ownerInitials }}
            </span>
          </span>
          <span
            class="text-4xl font-mono tracking-tight leading-none"
            :style="{ color: 'oklch(0.62 0.01 60)' }"
          >
            {{ safeOwner }}{{ safeRepo !== 'skills' ? `/${safeRepo}` : '' }}
          </span>
        </div>
      </div>

      <div
        v-if="safeReason"
        class="flex flex-col gap-2"
        :style="{
          borderLeft: '3px solid oklch(0.555 0.225 17.32)',
          paddingLeft: '16px',
        }"
      >
        <span
          class="text-3xl leading-snug"
          :style="{ color: 'oklch(0.93 0.005 60)', lineClamp: 3, textOverflow: 'ellipsis' }"
        >
          &ldquo;{{ safeReason }}&rdquo;
        </span>
        <span v-if="safeReasonHandle" class="flex items-center gap-2">
          <span class="text-2xl font-mono" :style="{ color: 'oklch(0.62 0.01 60)' }">
            @{{ safeReasonHandle }}
          </span>
        </span>
      </div>
      <div
        v-else-if="safeCuratorCount > 0"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)' }"
      >
        {{ safeCuratorCount }} curator{{ safeCuratorCount !== 1 ? 's' : '' }} using this skill
      </div>
    </div>
  </OgLayout>
</template>
