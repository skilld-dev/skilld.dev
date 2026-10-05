<script setup lang="ts">
const { owner, repo, name, to, source, description } = defineProps<{
  owner: string
  repo: string
  name: string
  to: string
  source: string
  description: string
}>()

// Editorial snapshots stay with the article's pinned evidence, without a live registry join.
const skill = computed(() => ({
  owner,
  repo,
  name,
  registryPath: to,
  slug: `${owner}/${repo}/${name}`,
  description,
  skillFileUrl: source,
}))
</script>

<template>
  <div class="comparison-skill-card not-prose my-5">
    <SkillCard
      :skill="skill"
      signal="none"
      show-owner-path
      :show-copy="false"
      :show-like="false"
    />
  </div>
</template>

<style scoped>
/* Source links remain easy to reach on touch screens inside the article. */
.comparison-skill-card :deep(a[target='_blank']) {
  min-width: 44px;
  min-height: 44px;
}
</style>
