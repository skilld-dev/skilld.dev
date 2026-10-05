<script setup lang="ts">
import { ogText } from '../../utils/og-props'

// Declared as the wire types the OG image URL can deliver, not as the types the
// template wants. A numeric-looking title arrives as a number.
const props = defineProps<{
  title?: string | number | null
  description?: string | number | null
}>()

const safeTitle = computed(() => ogText(props.title))
const safeDescription = computed(() => ogText(props.description))
</script>

<template>
  <OgLayout>
    <div class="px-15 py-14 flex flex-col justify-center gap-10 h-full">
      <OgBrand :size="36" />

      <div class="flex flex-col max-w-full gap-3">
        <div
          class="text-6xl tracking-tighter font-mono leading-none"
          :style="{ lineClamp: 2, textOverflow: 'ellipsis' }"
        >
          {{ safeTitle }}
        </div>
      </div>

      <div
        v-if="safeDescription"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 2, textOverflow: 'ellipsis' }"
      >
        {{ safeDescription }}
      </div>
    </div>
  </OgLayout>
</template>
