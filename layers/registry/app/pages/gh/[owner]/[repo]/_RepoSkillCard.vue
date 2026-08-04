<script setup lang="ts">
interface RepoSkill {
  owner: string
  repo: string
  name: string
  description?: string | null
  dependencies?: string[]
}

const { skill } = defineProps<{
  skill: RepoSkill
}>()
</script>

<template>
  <article class="group relative flex h-full min-h-11 flex-col rounded-lg border border-default px-3 py-2.5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]">
    <NuxtLink
      :to="repoSkillPath(skill.owner, skill.repo, skill.name)"
      :aria-label="`/${skill.name}`"
      class="after:absolute after:inset-0"
    >
      <h3 class="truncate font-mono text-sm font-medium">
        /{{ skill.name }}
      </h3>
      <p
        v-if="skill.description"
        class="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted"
      >
        {{ skill.description }}
      </p>
    </NuxtLink>
    <div
      v-if="skill.dependencies?.length"
      class="relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-default pt-2"
    >
      <span class="data-label">Requires</span>
      <NuxtLink
        v-for="dependency in skill.dependencies"
        :key="dependency"
        :to="repoSkillPath(skill.owner, skill.repo, dependency)"
        class="font-mono text-xs text-muted transition-colors hover:text-default hover:underline"
      >
        /{{ dependency }}
      </NuxtLink>
    </div>
  </article>
</template>
