<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'pages',
  path: '/terms',
  canonicalPath: '/terms',
})
</script>

<template>
  <MarketingArticle v-if="data" :page="data" />
</template>
