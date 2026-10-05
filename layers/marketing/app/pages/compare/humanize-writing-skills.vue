<script setup lang="ts">
const { data } = await useMarketingArticle({
  collection: 'comparisons',
  path: '/compare/humanize-writing-skills',
  canonicalPath: '/compare/humanize-writing-skills',
})
</script>

<template>
  <div class="writing-comparison">
    <MarketingArticle v-if="data" :page="data" />
  </div>
</template>

<style scoped>
@layer components {
  .writing-comparison :deep(.comparison-table) {
    max-inline-size: 100%;
    overflow-x: auto;
    margin-block: 1.25rem;
    border-radius: var(--ui-radius);
  }

  .writing-comparison :deep(.comparison-table:focus-visible) {
    outline: 3px solid var(--ui-primary);
    outline-offset: 3px;
  }

  .writing-comparison :deep(th),
  .writing-comparison :deep(td) {
    min-inline-size: 10rem;
  }
}

/* The labelled region owns scrolling instead of the prose table's utility wrapper. */
.writing-comparison :deep(.comparison-table > div) {
  overflow: visible;
  margin-block: 0;
}
</style>
