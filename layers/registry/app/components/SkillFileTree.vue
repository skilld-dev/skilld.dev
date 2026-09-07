<script setup lang="ts">
import type { SkillFileTreeNode } from '../utils/skill-file-tree'

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
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

// SKILL.md sits implicitly at the root and is never present in `assets`.
// We surface it as a synthetic file so the tree mirrors what's on disk.
const skillMdAsset: SkillAsset = { path: 'SKILL.md', size: 0, type: 'markdown' }

const nodes = computed<SkillFileTreeNode[]>(() => {
  const root: SkillFileTreeNode = { kind: 'dir', path: '', name: '', children: [] }
  const all: SkillAsset[] = [skillMdAsset, ...props.assets]
  for (const asset of all) {
    const parts = asset.path.split('/').filter(Boolean)
    let cur = root
    parts.forEach((segment, i) => {
      const isLeaf = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      if (isLeaf) {
        cur.children!.push({ kind: 'file', path, name: segment, asset })
      }
      else {
        let next = cur.children!.find(n => n.kind === 'dir' && n.name === segment)
        if (!next) {
          next = { kind: 'dir', path, name: segment, children: [] }
          cur.children!.push(next)
        }
        cur = next
      }
    })
  }
  sortTree(root.children!)
  return root.children!
})

function sortTree(list: SkillFileTreeNode[]) {
  list.sort((a, b) => {
    // SKILL.md is the canonical entry; pin it to the top regardless of kind.
    if (a.path === 'SKILL.md')
      return -1
    if (b.path === 'SKILL.md')
      return 1
    if (a.kind !== b.kind)
      return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const n of list) {
    if (n.kind === 'dir' && n.children)
      sortTree(n.children)
  }
}

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
  <ul class="skill-file-tree" role="tree">
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
