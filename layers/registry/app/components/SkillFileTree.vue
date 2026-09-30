<script setup lang="ts">
import { buildSkillFileTree } from '../utils/skill-file-tree'

interface SkillAsset {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

const props = defineProps<{
  assets: SkillAsset[]
  owner: string
  repo: string
  name: string
  registryPath: string
  branch: string
  // Path inside the skill folder of the doc currently rendered in the viewer.
  // Empty string means SKILL.md (root of the skill folder).
  activePath?: string
  // Path of the source SKILL.md inside the repo, used to build GitHub URLs
  // for non-markdown leaves.
  skillPath?: string | null
  // Byte size of SKILL.md, which `assets` never carries.
  skillMdSize?: number
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const nodes = computed(() => buildSkillFileTree(props.assets, props.skillMdSize ?? 0))

const skillDir = computed(() => props.skillPath?.replace(/\/SKILL\.md$/, '') ?? '')

/**
 * The skill page renders this tree twice, once floating and once inline, so a
 * folder id built from the path alone appeared on both. Duplicate ids are
 * invalid, and `aria-controls` resolves to the first match, which pointed the
 * second tree's buttons at the first tree's lists.
 */
const treeId = useId()
</script>

<template>
  <ul class="skill-file-tree">
    <SkillFileTreeNode
      v-for="node in nodes"
      :key="node.path"
      :node="node"
      :owner="owner"
      :repo="repo"
      :name="name"
      :registry-path="registryPath"
      :branch="branch"
      :skill-dir="skillDir"
      :id-prefix="treeId"
      :active-path="activePath ?? ''"
      @select="(p) => emit('select', p)"
    />
  </ul>
</template>

<style scoped>
.skill-file-tree {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-mono);
}
</style>
