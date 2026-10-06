<script setup lang="ts">
import { ogText } from '../../utils/og-props'
import { ogTitleSize } from '../../utils/og-style'

// Declared as the wire types the OG image URL can deliver, not as the types the
// template wants. A numeric-looking title arrives as a number.
const props = defineProps<{
  title?: string | number | null
  description?: string | number | null
}>()

const safeTitle = computed(() => ogText(props.title))
const safeDescription = computed(() => ogText(props.description))
const titleSize = computed(() => ogTitleSize(safeTitle.value, { max: 84, min: 60, lines: 2 }))
</script>

<template>
  <OgLayout>
    <OgLines :text="safeTitle" :size="titleSize" face="title" />
    <OgLines v-if="safeDescription" class="mt-7" :text="safeDescription" :size="30" />
  </OgLayout>
</template>
