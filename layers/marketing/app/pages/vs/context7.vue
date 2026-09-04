<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'pages',
  path: '/vs/context7',
  canonicalPath: '/vs/context7',
})
</script>

<template>
  <MarketingArticle v-if="data" :page="data" />
</template>
