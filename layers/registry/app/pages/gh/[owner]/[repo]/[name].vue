<script setup lang="ts">
const route = useRoute()
const owner = computed(() => String(route.params.owner ?? ''))
const repo = computed(() => String(route.params.repo ?? ''))
const name = computed(() => String(route.params.name ?? ''))

if (name.value && name.value === repo.value)
  await navigateTo(repoHubPath(owner.value, repo.value), { redirectCode: 301 })
</script>

<template>
  <SkillDetail
    :owner="owner"
    :repo="repo"
    :name="name"
  />
</template>
