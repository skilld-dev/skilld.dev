<script setup lang="ts">
interface DeveloperSkill {
  owner: string
  repo: string
  name: string
  slug: string
  description?: string | null
  stars?: number
}

interface DeveloperSection {
  owner: string
  repo: string
  totalSkills: number
  displayName?: string | null
  description?: string | null
  skills: DeveloperSkill[]
}

defineProps<{
  section: DeveloperSection
}>()

function skillPath(skill: DeveloperSkill) {
  return repoSkillPath(skill.owner, skill.repo, skill.name)
}
</script>

<template>
  <article class="border-t border-default py-6 first:border-t-0 first:pt-0 last:pb-0">
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
      <NuxtLink
        :to="ownerHubPath(section.owner)"
        :aria-label="`${section.displayName || section.owner} profile`"
        class="shrink-0"
      >
        <img
          :src="`https://github.com/${section.owner}.png?size=96`"
          :alt="`${section.displayName || section.owner} avatar`"
          width="48"
          height="48"
          class="size-12 rounded-full bg-muted"
          loading="lazy"
          decoding="async"
        >
      </NuxtLink>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 class="text-base font-medium">
            <NuxtLink
              :to="ownerHubPath(section.owner)"
              class="inline-flex min-h-11 items-center hover:text-muted transition-colors"
            >
              {{ section.displayName || section.owner }}
            </NuxtLink>
          </h3>
          <span class="font-mono text-xs text-muted">@{{ section.owner }}</span>
          <span class="data-label">{{ section.totalSkills }} {{ section.totalSkills === 1 ? 'skill' : 'skills' }}</span>
        </div>
        <p
          v-if="section.description"
          class="mt-1 max-w-2xl text-sm text-muted leading-relaxed"
        >
          {{ section.description }}
        </p>
      </div>

      <UButton
        :to="ownerHubPath(section.owner)"
        label="View profile"
        color="neutral"
        variant="ghost"
        size="xs"
        trailing-icon="i-lucide-arrow-right"
        class="min-h-11 self-start"
      />
    </div>

    <div class="developer-skill-carousel-frame -mx-4 sm:-mx-6">
      <ul class="developer-skill-carousel flex gap-3 overflow-x-auto px-4 sm:px-6 list-none">
        <li
          v-for="skill in section.skills"
          :key="skill.slug"
          class="w-[17rem] shrink-0 snap-start sm:w-[19rem]"
        >
          <NuxtLink
            :to="skillPath(skill)"
            :aria-label="`${skill.name} by ${skill.owner}`"
            class="flex h-40 flex-col rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <div class="min-w-0">
              <p class="font-mono text-sm font-medium truncate">
                {{ skill.name }}
              </p>
              <p
                v-if="skill.description"
                class="mt-2 text-xs text-muted leading-relaxed line-clamp-3"
              >
                {{ skill.description }}
              </p>
            </div>

            <div class="mt-auto flex items-center justify-between gap-3 pt-4">
              <span class="font-mono text-xs text-muted truncate">
                {{ skill.owner }}/{{ skill.repo }}
              </span>
              <span
                v-if="skill.stars"
                class="data-label inline-flex shrink-0 items-center gap-1"
                :title="`${skill.stars.toLocaleString()} GitHub stars`"
              >
                <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                {{ formatGithubStars(skill.stars) }}
              </span>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </article>
</template>
