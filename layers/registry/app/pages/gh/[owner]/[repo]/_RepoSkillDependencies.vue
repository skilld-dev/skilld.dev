<script setup lang="ts">
/** The Skills one Skill in this Repository requires, as links. */
const { owner, repo, dependencies } = defineProps<{
  owner: string
  repo: string
  dependencies: readonly string[]
}>()

const visible = computed(() => dependencies.slice(0, 3))
const hidden = computed(() => dependencies.slice(3))
const hiddenLabel = computed(() => hidden.value.map(name => `/${name}`).join(', '))
</script>

<template>
  <div class="flex w-full max-w-full flex-wrap items-center gap-2">
    <span class="data-label inline-flex items-center gap-1.5">
      <UIcon name="i-lucide-workflow" class="size-3.5" aria-hidden="true" />
      Requires
    </span>
    <NuxtLink
      v-for="dependency in visible"
      :key="dependency"
      :to="repoSkillPath(owner, repo, dependency)"
      class="inline-flex min-h-8 max-w-full items-center rounded-md border border-default px-2 font-mono text-xs text-muted transition-colors hover:border-[var(--ui-text-muted)] hover:text-default"
    >
      <span class="truncate">/{{ dependency }}</span>
    </NuxtLink>
    <UTooltip v-if="hidden.length" :text="hiddenLabel">
      <span
        class="inline-flex min-h-8 items-center px-1 font-mono text-xs text-muted transition-colors hover:text-default"
        tabindex="0"
        :aria-label="`${hidden.length} more dependencies: ${hiddenLabel}`"
      >
        +{{ hidden.length }}
      </span>
    </UTooltip>
  </div>
</template>
