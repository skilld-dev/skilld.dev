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
  description,
  skillFileUrl: source,
}))
</script>

<template>
  <div class="not-prose my-5">
    <SkillCard
      :skill="skill"
      metric="none"
      :actions="['source']"
      surface="comparison-card"
    />
  </div>
</template>
