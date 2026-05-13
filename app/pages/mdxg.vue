<script setup lang="ts">
import type { MdxgDocument } from '../../modules/mdxg/src/runtime/types'

const { data } = await useFetch<MdxgDocument>('/api/mdxg-demo')
</script>

<template>
  <main class="p-6 max-w-7xl mx-auto">
    <MdxgViewer v-if="data" :document="data" sync-hash />
    <p v-else>
      Loading…
    </p>
  </main>
</template>
