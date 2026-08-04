<script setup lang="ts">
interface RepoSkill {
  owner: string
  repo: string
  name: string
  description?: string | null
  dependencies?: string[]
  modifiedAt?: number | null
  firstSeenAt?: number | null
}

const { skill } = defineProps<{
  skill: RepoSkill
}>()

interface FormattedDate {
  label: string
  title: string
}

function formatDate(timestamp: number | null | undefined): FormattedDate | null {
  if (!timestamp)
    return null

  const date = new Date(timestamp * 1000)
  if (!Number.isFinite(date.getTime()))
    return null

  return {
    label: new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date),
    title: new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date),
  }
}

const addedAt = computed(() => formatDate(skill.firstSeenAt))
const modifiedAt = computed(() => {
  const formatted = formatDate(skill.modifiedAt)
  return formatted?.label === addedAt.value?.label ? null : formatted
})
const visibleDependencies = computed(() => skill.dependencies?.slice(0, 3) ?? [])
const hiddenDependencies = computed(() => skill.dependencies?.slice(3) ?? [])
const hiddenDependenciesLabel = computed(() => hiddenDependencies.value.map(name => `/${name}`).join(', '))
</script>

<template>
  <article class="group relative flex h-full min-h-36 flex-col rounded-xl border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]">
    <NuxtLink
      :to="repoSkillPath(skill.owner, skill.repo, skill.name)"
      :aria-label="`/${skill.name}`"
      class="block flex-1 after:absolute after:inset-0"
    >
      <h3 class="truncate font-mono text-base font-medium">
        /{{ skill.name }}
      </h3>
      <p
        v-if="skill.description"
        class="mt-2 line-clamp-3 text-sm leading-relaxed text-muted"
      >
        {{ skill.description }}
      </p>
    </NuxtLink>
    <div
      v-if="addedAt || modifiedAt || skill.dependencies?.length"
      class="pointer-events-none relative z-10 mt-4 flex flex-col items-start gap-3 border-t border-default pt-3"
    >
      <div
        v-if="addedAt || modifiedAt"
        class="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <span
          v-if="addedAt"
          class="data-label inline-flex items-center gap-1.5"
          :title="`First indexed ${addedAt.title}`"
        >
          <UIcon
            name="i-lucide-calendar-plus"
            class="size-3.5"
            aria-hidden="true"
          />
          Added {{ addedAt.label }}
        </span>
        <span
          v-if="modifiedAt"
          class="data-label inline-flex items-center gap-1.5"
          :title="`Last updated ${modifiedAt.title}`"
        >
          <UIcon
            name="i-lucide-clock"
            class="size-3.5"
            aria-hidden="true"
          />
          Updated {{ modifiedAt.label }}
        </span>
      </div>
      <div
        v-if="skill.dependencies?.length"
        class="flex w-full max-w-full flex-wrap items-center gap-2"
      >
        <span class="data-label inline-flex items-center gap-1.5">
          <UIcon
            name="i-lucide-workflow"
            class="size-3.5"
            aria-hidden="true"
          />
          Requires
        </span>
        <NuxtLink
          v-for="dependency in visibleDependencies"
          :key="dependency"
          :to="repoSkillPath(skill.owner, skill.repo, dependency)"
          class="pointer-events-auto inline-flex min-h-8 max-w-full items-center rounded-md border border-default px-2 font-mono text-xs text-muted transition-colors hover:border-[var(--ui-text-muted)] hover:text-default"
        >
          <span class="truncate">/{{ dependency }}</span>
        </NuxtLink>
        <UTooltip
          v-if="hiddenDependencies.length"
          :text="hiddenDependenciesLabel"
        >
          <span
            class="pointer-events-auto inline-flex min-h-8 items-center px-1 font-mono text-xs text-muted transition-colors hover:text-default"
            tabindex="0"
            :aria-label="`${hiddenDependencies.length} more dependencies: ${hiddenDependenciesLabel}`"
          >
            +{{ hiddenDependencies.length }}
          </span>
        </UTooltip>
      </div>
    </div>
  </article>
</template>
