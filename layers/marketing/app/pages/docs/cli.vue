<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'pages',
  path: '/docs/cli',
  canonicalPath: '/docs/cli',
})
</script>

<template>
  <MarketingArticle v-if="data" :page="data" />
</template>
