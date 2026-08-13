<script setup lang="ts">
import type { MdxgPage } from '../types'
import { computed, ref } from 'vue'
import { MarkdownDocument } from '#components'
import { useMdxgCodeCopy } from '../composables/useMdxgCodeCopy'

const props = defineProps<{
  page: MdxgPage
}>()

const root = ref<HTMLElement | null>(null)
const trigger = computed(() => props.page.slug)
useMdxgCodeCopy(root, trigger)
</script>

<template>
  <article ref="root" class="mdxg-page">
    <MarkdownDocument :value="page.document" />
  </article>
</template>
