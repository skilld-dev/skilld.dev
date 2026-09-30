<script setup lang="ts">
import { normalizeSkillAssetFilePath } from '#shared/skill-asset-path'

// The Skill page with one file open in the viewer. SkillDetail sets the
// title, noindex, and canonical for it.
const route = useRoute()
const owner = computed(() => String(route.params.owner ?? ''))
const repo = computed(() => String(route.params.repo ?? ''))
const name = computed(() => String(route.params.name ?? ''))
const file = computed(() => {
  const raw = route.params.file
  return normalizeSkillAssetFilePath({
    owner: owner.value,
    repo: repo.value,
    name: name.value,
    filePath: Array.isArray(raw) ? raw.join('/') : String(raw ?? ''),
  })
})
</script>

<template>
  <SkillDetail
    :owner="owner"
    :repo="repo"
    :name="name"
    :file="file"
  />
</template>
