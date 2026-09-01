<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'pages',
  path: '/verify',
  canonicalPath: '/verify',
})
</script>

<template>
  <MarketingArticle v-if="data" :page="data" />
</template>
