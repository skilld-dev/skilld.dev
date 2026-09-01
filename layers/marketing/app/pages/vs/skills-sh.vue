<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'pages',
  path: '/vs/skills-sh',
  canonicalPath: '/vs/skills-sh',
})
</script>

<template>
  <MarketingArticle v-if="data" :page="data" />
</template>
