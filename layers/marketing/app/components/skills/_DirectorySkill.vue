<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { skillRunCmd } from '#shared/skill-commands'

const { skill, metric, trending } = defineProps<{
  skill: {
    owner: string
    repo: string
    name: string
    registryPath: string
    description?: string | null
    authorName?: string | null
    skillFileUrl?: string | null
    stars?: number
    likeCount?: number
    official?: boolean
  }
  metric: 'stars' | 'likes'
  trending: boolean
}>()

const author = computed(() => resolveAuthorName(skill.owner, skill.authorName))
const command = computed(() => skillRunCmd(skill.owner, skill.repo, skill.name))
const { copy, copied } = useInstallCopy(command, 'skills-directory', 'run', () => ({
  kind: 'skill',
  owner: skill.owner,
  name: skill.name,
}))
const copyError = ref<string | null>(null)

async function copyCommand() {
  const result = await copy()
  copyError.value = result._tag === 'error' ? result.message : null
}
</script>

<template>
  <li class="py-5">
    <div class="flex items-start gap-3 sm:gap-4">
      <img
        :src="githubAvatarProxyUrl(skill.owner, 64)"
        alt=""
        width="32"
        height="32"
        loading="lazy"
        decoding="async"
        class="mt-1 size-8 shrink-0 rounded-full bg-muted"
      >
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2">
          <NuxtLink
            :to="skill.registryPath"
            :aria-label="`/${skill.name} by ${author ?? skill.owner}`"
            class="inline-flex min-h-11 min-w-0 items-center gap-2 font-mono text-base font-medium text-highlighted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span class="break-all">/{{ skill.name }}</span>
            <UIcon v-if="skill.official" name="i-lucide-badge-check" class="size-4 shrink-0 text-muted" aria-label="Official publisher" />
          </NuxtLink>
          <span v-if="trending" class="shrink-0">
            <span class="trending-fire" aria-hidden="true">🔥</span>
            <span class="sr-only">Trending</span>
          </span>
        </div>
        <p class="break-words text-sm text-muted">
          <span v-if="author" class="mr-2 text-toned">{{ author }}</span>
          <span class="font-mono">{{ skill.owner }}/{{ skill.repo }}</span>
        </p>
        <p v-if="skill.description" class="mt-2 line-clamp-3 max-w-prose text-base leading-relaxed text-toned">
          {{ skill.description }}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            v-if="skill.skillFileUrl"
            :href="skill.skillFileUrl"
            target="_blank"
            rel="noopener"
            aria-label="Read SKILL.md on GitHub"
            class="inline-flex min-h-11 items-center gap-1.5 font-mono text-sm text-muted hover:text-default focus-visible:outline-2 focus-visible:outline-primary"
          >
            <UIcon name="i-lucide-file-text" class="size-4" aria-hidden="true" />
            SKILL.md
          </a>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copied' : 'Copy run command'"
            :aria-label="copied ? 'Copied' : `Copy run command for /${skill.name}`"
            color="neutral"
            variant="ghost"
            class="min-h-11 font-mono"
            @click="copyCommand"
          />
          <span v-if="metric === 'likes'" class="ml-auto inline-flex items-center gap-1.5 font-mono text-sm text-muted tabular-nums">
            <UIcon name="i-lucide-heart" class="size-3.5" aria-hidden="true" />
            {{ skill.likeCount ?? 0 }} <span class="sr-only">Likes</span>
          </span>
          <span v-else-if="skill.stars" class="ml-auto inline-flex items-center gap-1.5 font-mono text-sm text-muted tabular-nums">
            <UIcon name="i-lucide-star" class="size-3.5" aria-hidden="true" />
            {{ formatGithubStars(skill.stars) }} <span class="sr-only">Stars</span>
          </span>
        </div>
        <p v-if="copyError" role="alert" class="mt-2 text-sm text-error">
          {{ copyError }}
        </p>
        <span class="sr-only" aria-live="polite">{{ copied ? 'Copied' : '' }}</span>
      </div>
    </div>
  </li>
</template>
