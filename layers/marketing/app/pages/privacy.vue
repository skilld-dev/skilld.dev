<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'pages',
  path: '/privacy',
  canonicalPath: '/privacy',
})
</script>

<template>
  <MarketingArticle v-if="data" :page="data" />
</template>
