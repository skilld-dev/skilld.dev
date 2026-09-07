<script setup lang="ts">
import { skillRunCmd } from '#shared/skill-commands'

interface SkillLike {
  owner: string
  repo: string
  name: string
  registryPath: string
  slug: string
  description?: string | null
  stars?: number
  likeCount?: number
  tags?: string[]
  official?: boolean
  occurredAt?: number | null
  pushedAt?: number | null
  modifiedAt?: number | null
  /** GitHub profile name of the owner, when the owner has been synced. */
  authorName?: string | null
  /** SKILL.md on GitHub at the synced revision. */
  skillFileUrl?: string | null
}

const {
  skill,
  variant = 'grid',
  signal = 'auto',
  showDescription = true,
  showCopy = true,
  showLike = true,
  showOwnerAvatar = true,
  showOwnerPath = false,
  showTags = false,
  timestampLabel,
  timestampFormat,
} = defineProps<{
  skill: SkillLike
  variant?: 'grid' | 'list' | 'condensed'
  signal?: 'stars' | 'auto' | 'none'
  showDescription?: boolean
  showCopy?: boolean
  showLike?: boolean
  showOwnerAvatar?: boolean
  showOwnerPath?: boolean
  showTags?: boolean
  timestampLabel?: string
  timestampFormat?: 'absolute' | 'relative'
}>()

// The card copies the run command: reading a skill costs nothing, installing is a choice.
const runCmd = computed(() => skillRunCmd(skill.owner, skill.repo, skill.name))
const { copy, copied } = useInstallCopy(
  runCmd,
  variant === 'condensed' ? 'skill-card-condensed' : variant === 'list' ? 'skill-card-list' : 'skill-card',
  'run',
  () => ({ kind: 'skill', owner: skill.owner, name: skill.name }),
)

const skillPath = computed(() => {
  return skill.registryPath
})

const repoSlug = computed(() => `${skill.owner}/${skill.repo}`)
// Byline: the person first, the slug as the mono data label after it.
const authorName = computed(() => resolveAuthorName(skill.owner, skill.authorName))
const skillFileUrl = computed(() => skill.skillFileUrl ?? null)

const resolvedTimestampFormat = computed(() =>
  timestampFormat ?? (variant === 'condensed' ? 'relative' : 'absolute'),
)
const shouldShowOwnerPath = computed(() =>
  showOwnerPath && variant !== 'condensed',
)
const skillLinkAriaLabel = computed(() =>
  variant === 'condensed' ? `/${skill.name}` : `/${skill.name} by ${skill.owner}`,
)

const timestampSeconds = computed<number | null>(() => {
  if (typeof skill.occurredAt === 'number')
    return skill.occurredAt
  if (typeof skill.modifiedAt === 'number')
    return skill.modifiedAt
  if (typeof skill.pushedAt === 'number')
    return skill.pushedAt
  return null
})

const timestampDate = computed(() =>
  timestampSeconds.value != null ? new Date(timestampSeconds.value * 1000) : null,
)

const resolvedSignal = computed<'stars' | null>(() => {
  if (signal === 'none')
    return null
  const stars = skill.stars ?? 0
  return stars > 0 ? 'stars' : null
})

const linkClasses = computed(() => {
  // pr-24 reserves room for the heart and the copy button side by side.
  if (variant === 'list')
    return 'flex items-center gap-4 px-4 py-3 pr-24 transition-colors duration-200 hover:bg-elevated'
  if (variant === 'condensed')
    return `flex h-full min-h-11 flex-col rounded-lg border border-default px-3 py-2.5 transition-colors duration-200 hover:border-[var(--ui-text-muted)] ${skillFileUrl.value ? 'pr-10' : ''}`
  return 'flex h-full min-h-[8.5rem] flex-col rounded-lg border border-default p-4 pr-24 transition-colors duration-200 hover:border-[var(--ui-text-muted)]'
})

const buttonPositionClass = computed(() => {
  if (variant === 'list')
    return 'top-1/2 right-3 -translate-y-1/2'
  return variant === 'condensed' ? 'top-2 right-2' : 'top-3 right-3'
})

/**
 * The condensed variant is a single line with no reserved right padding, so a
 * second control there would sit on top of the title. Hearts ride the grid and
 * list cards, which already reserve room.
 */
const showLikeButton = computed(() => showLike && variant !== 'condensed')

const signalFadesOnHover = computed(() => showCopy && variant !== 'condensed')
</script>

<template>
  <div class="group relative h-full">
    <NuxtLink
      :to="skillPath"
      :aria-label="skillLinkAriaLabel"
      :class="linkClasses"
    >
      <template v-if="variant === 'list'">
        <div class="min-w-0 flex-1 flex items-center gap-3">
          <div class="flex items-center gap-2 min-w-0 shrink-0">
            <img
              v-if="showOwnerAvatar"
              :src="`https://github.com/${skill.owner}.png?size=40`"
              :alt="skill.owner"
              width="20"
              height="20"
              class="size-5 shrink-0 rounded-full"
              loading="lazy"
            >
            <p class="font-mono text-sm font-medium truncate">
              /{{ skill.name }}
            </p>
            <div
              v-if="showTags && skill.tags?.length"
              class="hidden md:flex flex-wrap gap-1 min-w-0"
            >
              <UBadge
                v-for="tag in skill.tags.slice(0, 3)"
                :key="tag"
                :label="tag"
                variant="subtle"
                color="neutral"
                size="xs"
                class="font-mono"
              />
            </div>
          </div>
          <p
            v-if="showOwnerPath"
            class="text-xs text-muted truncate"
          >
            <span v-if="authorName" class="text-toned">{{ authorName }}</span>
            <span v-if="authorName" aria-hidden="true"> · </span>
            <span class="font-mono">{{ repoSlug }}</span>
          </p>
          <p
            v-if="timestampLabel && timestampDate"
            class="hidden items-center gap-1 text-xs text-muted sm:inline-flex"
          >
            <UIcon
              name="i-lucide-calendar-days"
              class="size-3"
              aria-hidden="true"
            />
            <span>{{ timestampLabel }}</span>
            <NuxtTime
              v-if="resolvedTimestampFormat === 'relative'"
              :datetime="timestampDate"
              locale="en"
              relative
              numeric="always"
              relative-style="long"
              :title="true"
            />
            <NuxtTime
              v-else
              :datetime="timestampDate"
              locale="en"
              month="short"
              day="numeric"
              year="numeric"
              time-zone="UTC"
              :title="true"
            />
          </p>
          <p
            v-if="showDescription && skill.description"
            class="text-xs text-muted truncate hidden sm:block"
          >
            {{ skill.description }}
          </p>
        </div>
        <span
          v-if="resolvedSignal === 'stars'"
          class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
          :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
          :title="`${(skill.stars ?? 0).toLocaleString()} GitHub stars`"
        >
          <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
          {{ formatGithubStars(skill.stars ?? 0) }}
        </span>
      </template>

      <template v-else>
        <div class="flex items-start gap-2">
          <p class="font-mono text-sm font-medium truncate min-w-0 flex-1">
            /{{ skill.name }}
          </p>
          <span
            v-if="!shouldShowOwnerPath && resolvedSignal === 'stars'"
            class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
            :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
            :title="`${(skill.stars ?? 0).toLocaleString()} GitHub stars`"
          >
            <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
            {{ formatGithubStars(skill.stars ?? 0) }}
          </span>
        </div>
        <div
          v-if="shouldShowOwnerPath"
          class="mt-0.5 flex items-center gap-1.5"
        >
          <img
            v-if="showOwnerAvatar"
            :src="`https://github.com/${skill.owner}.png?size=40`"
            :alt="skill.owner"
            width="20"
            height="20"
            class="size-5 shrink-0 rounded-full"
            loading="lazy"
          >
          <p class="text-xs text-muted truncate min-w-0 flex-1">
            <span v-if="authorName" class="text-toned">{{ authorName }}</span>
            <span v-if="authorName" aria-hidden="true"> · </span>
            <span class="font-mono">{{ repoSlug }}</span>
          </p>
          <span
            v-if="resolvedSignal === 'stars'"
            class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
            :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
            :title="`${(skill.stars ?? 0).toLocaleString()} GitHub stars`"
          >
            <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
            {{ formatGithubStars(skill.stars ?? 0) }}
          </span>
        </div>
        <p
          v-if="timestampLabel && timestampDate"
          class="inline-flex items-center gap-1 text-xs text-muted"
          :class="variant === 'condensed' ? 'mt-1.5' : 'mt-2'"
        >
          <UIcon
            name="i-lucide-calendar-days"
            class="size-3"
            aria-hidden="true"
          />
          <span>{{ timestampLabel }}</span>
          <NuxtTime
            v-if="resolvedTimestampFormat === 'relative'"
            :datetime="timestampDate"
            locale="en"
            relative
            numeric="always"
            relative-style="long"
            :title="true"
          />
          <NuxtTime
            v-else
            :datetime="timestampDate"
            locale="en"
            month="short"
            day="numeric"
            year="numeric"
            time-zone="UTC"
            :title="true"
          />
        </p>
        <div
          v-if="showTags && skill.tags?.length"
          class="mt-2 flex flex-wrap gap-1"
        >
          <UBadge
            v-for="tag in skill.tags.slice(0, 3)"
            :key="tag"
            :label="tag"
            variant="subtle"
            color="neutral"
            size="xs"
            class="font-mono"
          />
        </div>
        <p
          v-if="showDescription && skill.description"
          class="text-muted leading-relaxed"
          :class="variant === 'condensed'
            ? 'mt-1.5 text-sm line-clamp-2'
            : 'mt-2 text-xs line-clamp-3'"
        >
          {{ skill.description }}
        </p>
      </template>
    </NuxtLink>

    <div
      v-if="showCopy || showLikeButton || skillFileUrl"
      class="absolute z-10 flex items-center gap-0.5"
      :class="buttonPositionClass"
    >
      <a
        v-if="skillFileUrl"
        :href="skillFileUrl"
        target="_blank"
        rel="noopener"
        aria-label="Read SKILL.md on GitHub"
        class="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-elevated hover:text-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <UIcon name="i-lucide-file-text" class="size-3.5" aria-hidden="true" />
      </a>
      <LikeButton
        v-if="showLikeButton"
        :owner="skill.owner"
        :repo="skill.repo"
        :name="skill.name"
        :count="skill.likeCount ?? 0"
        variant="card"
      />
      <UButton
        v-if="showCopy"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        size="xs"
        color="neutral"
        variant="ghost"
        class="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        :aria-label="copied ? 'Copied' : `Copy run command for /${skill.name}`"
        @click.stop.prevent="copy(runCmd)"
      />
    </div>
  </div>
</template>
