<script setup lang="ts">
import type { MdxgPage } from '../types'
import { computed, ref } from 'vue'
import { MDCRenderer } from '#components'
import { useMdxgCodeCopy } from '../composables/useMdxgCodeCopy'

const props = defineProps<{
  page: MdxgPage
  // Forwarded to MDCRenderer for substitution context.
  data?: Record<string, unknown>
  // Render Prose components instead of plain HTML tags.
  prose?: boolean
}>()

const root = ref<HTMLElement | null>(null)
const trigger = computed(() => props.page.slug)
useMdxgCodeCopy(root, trigger)
</script>

<template>
  <article ref="root" class="mdxg-page">
    <MDCRenderer :body="page.body" :data="data ?? {}" :prose="prose" />
  </article>
</template>
