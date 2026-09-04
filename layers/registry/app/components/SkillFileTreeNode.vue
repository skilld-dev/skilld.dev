<script setup lang="ts">
import type { SkillFileTreeNode as TreeNode } from '../utils/skill-file-tree'
import { fileIcon, isInlineRenderable, shouldAutoExpandFolder } from '../utils/skill-file-tree'

const props = defineProps<{
  node: TreeNode
  owner: string
  repo: string
  name: string
  registryPath: string
  branch: string
  skillDir: string
  /** Unique per tree instance, so two trees on one page cannot share an id. */
  idPrefix: string
  activePath: string
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const open = ref(shouldAutoExpandFolder(props.node))

const isActive = computed(() => {
  if (props.node.kind !== 'file')
    return false
  const a = props.activePath
  return a === props.node.path || (a === '' && props.node.path === 'SKILL.md')
})

const githubUrl = computed(() => {
  if (props.node.kind !== 'file')
    return ''
  return `https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${props.skillDir}/${props.node.path}`
})

function onMarkdownClick(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    return
  event.preventDefault()
  emit('select', props.node.path)
}

const inlineRenderable = computed(() =>
  props.node.kind === 'file' && !!props.node.asset && isInlineRenderable(props.node.asset.type),
)

function onInlineClick(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    return
  event.preventDefault()
  emit('select', props.node.path)
}
</script>

<template>
  <li
    role="treeitem"
    :aria-expanded="node.kind === 'dir' ? open : undefined"
  >
    <template v-if="node.kind === 'dir'">
      <button
        type="button"
        class="tree-row"
        :aria-controls="`${idPrefix}-${node.path}`"
        @click="open = !open"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3 text-muted transition-transform shrink-0"
          :class="{ 'rotate-90': open }"
          aria-hidden="true"
        />
        <UIcon
          :name="open ? 'i-vscode-icons-default-folder-opened' : 'i-vscode-icons-default-folder'"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span class="tree-label">{{ node.name }}</span>
      </button>
      <ul
        v-show="open"
        :id="`${idPrefix}-${node.path}`"
        role="group"
        class="tree-children"
      >
        <SkillFileTreeNode
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :owner="owner"
          :repo="repo"
          :name="name"
          :registry-path="registryPath"
          :branch="branch"
          :skill-dir="skillDir"
          :id-prefix="idPrefix"
          :active-path="activePath"
          @select="(p) => emit('select', p)"
        />
      </ul>
    </template>
    <template v-else>
      <NuxtLink
        v-if="node.asset?.type === 'markdown'"
        :to="node.path === 'SKILL.md' ? registryPath : `${repoSkillPath(owner, repo, name)}/-/${node.path}`"
        rel="nofollow"
        class="tree-row file"
        :class="{ active: isActive }"
        :title="node.path"
        @click="onMarkdownClick"
      >
        <span class="tree-spacer" aria-hidden="true" />
        <UIcon
          :name="fileIcon(node.name)"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span class="tree-label">{{ node.name }}</span>
      </NuxtLink>
      <button
        v-else-if="inlineRenderable"
        type="button"
        class="tree-row file"
        :class="{ active: isActive }"
        :title="node.path"
        @click="onInlineClick"
      >
        <span class="tree-spacer" aria-hidden="true" />
        <UIcon
          :name="fileIcon(node.name)"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span class="tree-label">{{ node.name }}</span>
      </button>
      <a
        v-else
        :href="githubUrl"
        target="_blank"
        rel="noopener nofollow"
        class="tree-row file"
        :title="node.path"
      >
        <span class="tree-spacer" aria-hidden="true" />
        <UIcon
          :name="fileIcon(node.name)"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span class="tree-label">{{ node.name }}</span>
        <UIcon
          name="i-lucide-external-link"
          class="size-3 shrink-0 text-muted/60"
          aria-hidden="true"
        />
      </a>
    </template>
  </li>
</template>

<style scoped>
.tree-children {
  list-style: none;
  margin: 0;
  padding-left: 0.875rem;
  border-left: 1px dashed var(--ui-border);
  margin-left: 0.4375rem;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--ui-text-muted);
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: background-color 200ms, color 200ms;
}
.tree-row:hover {
  background: color-mix(in oklch, var(--ui-bg-muted) 60%, transparent);
  color: var(--ui-text);
}
.tree-row.file {
  text-decoration: none;
}
.tree-row.active {
  color: var(--ui-text);
  background: var(--ui-bg-muted);
  font-weight: 500;
}
.tree-spacer {
  width: 0.75rem;
  flex-shrink: 0;
}
.tree-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
