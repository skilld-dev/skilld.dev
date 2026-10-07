<script setup lang="ts">
import type { SkillFileTreeNode as TreeNode } from '../utils/skill-file-tree'
import { formatByteSize } from '../utils/skill-context-cost'
import { fileIcon, isInlineRenderable, splitFileLabel } from '../utils/skill-file-tree'

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

const open = ref(props.node.kind === 'dir' && props.node.initiallyOpen)

// Opening a file from a link or the breadcrumb reveals it in the tree.
watch(() => props.activePath, (active) => {
  if (props.node.kind === 'dir' && active.startsWith(`${props.node.path}/`))
    open.value = true
}, { immediate: true })

function countFiles(node: TreeNode): number {
  return node.kind === 'file' ? 1 : node.children.reduce((sum, child) => sum + countFiles(child), 0)
}
const folderFileCount = computed(() => props.node.kind === 'dir' ? countFiles(props.node) : 0)

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

// A plain click opens the file in the viewer. Modified clicks keep the
// browser default, so cmd-click still opens the file link in a new tab.
function onFileClick(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    return
  event.preventDefault()
  emit('select', props.node.path)
}

const label = computed(() => splitFileLabel(props.node.name))

const inlineRenderable = computed(() =>
  props.node.kind === 'file' && !!props.node.asset && isInlineRenderable(props.node.asset.type),
)
</script>

<template>
  <li>
    <template v-if="node.kind === 'dir'">
      <button
        type="button"
        class="tree-row"
        :aria-expanded="open"
        :aria-controls="`${idPrefix}-${node.path}`"
        :title="node.path"
        @click="open = !open"
      >
        <SkillFileIcon
          :name="open ? 'default-folder-opened' : 'default-folder'"
          class="size-4 shrink-0"
        />
        <span
          class="tree-label"
          :style="{ '--label-tail': `${label.tail.length}ch` }"
        >
          <span class="tree-label-head">{{ label.head }}</span>
          <span v-if="label.tail">{{ label.tail }}</span>
        </span>
        <span
          class="tree-size"
        >{{ folderFileCount }} {{ folderFileCount === 1 ? 'file' : 'files' }}</span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3 text-muted transition-transform shrink-0"
          :class="{ 'rotate-90': open }"
          aria-hidden="true"
        />
      </button>
      <ul
        v-show="open"
        :id="`${idPrefix}-${node.path}`"
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
      <!--
        A plain anchor, so a click swaps the document in place. A router link
        would first navigate to the file view page. The href still opens that
        page in a new tab.
      -->
      <a
        v-if="node.asset?.type === 'markdown'"
        :href="node.path === 'SKILL.md' ? registryPath : `${repoSkillPath(owner, repo, name)}/-/${node.path}`"
        rel="nofollow"
        class="tree-row file"
        :class="{ active: isActive }"
        :aria-current="isActive ? 'true' : undefined"
        :title="node.path"
        @click="onFileClick"
      >
        <SkillFileIcon
          :name="fileIcon(node.name)"
          class="size-4 shrink-0"
        />
        <span
          class="tree-label"
          :style="{ '--label-tail': `${label.tail.length}ch` }"
        >
          <span class="tree-label-head">{{ label.head }}</span>
          <span v-if="label.tail">{{ label.tail }}</span>
        </span>
        <span
          v-if="node.asset?.size"
          class="tree-size"
        >{{ formatByteSize(node.asset.size) }}</span>
      </a>
      <button
        v-else-if="inlineRenderable"
        type="button"
        class="tree-row file"
        :class="{ active: isActive }"
        :aria-current="isActive ? 'true' : undefined"
        :title="node.path"
        @click="onFileClick"
      >
        <SkillFileIcon
          :name="fileIcon(node.name)"
          class="size-4 shrink-0"
        />
        <span
          class="tree-label"
          :style="{ '--label-tail': `${label.tail.length}ch` }"
        >
          <span class="tree-label-head">{{ label.head }}</span>
          <span v-if="label.tail">{{ label.tail }}</span>
        </span>
        <span
          v-if="node.asset?.size"
          class="tree-size"
        >{{ formatByteSize(node.asset.size) }}</span>
      </button>
      <a
        v-else
        :href="githubUrl"
        target="_blank"
        rel="noopener nofollow"
        class="tree-row file"
        :title="node.path"
      >
        <SkillFileIcon
          :name="fileIcon(node.name)"
          class="size-4 shrink-0"
        />
        <span
          class="tree-label"
          :style="{ '--label-tail': `${label.tail.length}ch` }"
        >
          <span class="tree-label-head">{{ label.head }}</span>
          <span v-if="label.tail">{{ label.tail }}</span>
        </span>
        <span
          v-if="node.asset?.size"
          class="tree-size"
        >{{ formatByteSize(node.asset.size) }}</span>
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
  padding-left: 0.375rem;
  border-left: 1px dashed var(--ui-border);
  /* Puts the guide line under the parent folder icon. */
  margin-left: 0.9375rem;
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
.tree-size {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}
.tree-label {
  display: flex;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  container-type: inline-size;
}
/* The tree is monospace. Rounding the head down to whole characters puts the
   ellipsis flush against the tail, with no part-character gap between them. */
.tree-label-head {
  min-width: 0;
  max-width: round(down, calc(100cqw - var(--label-tail)), 1ch);
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
