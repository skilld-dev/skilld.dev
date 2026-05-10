<script setup lang="ts">
interface SkillLike {
  owner: string
  repo: string
  name: string
  slug: string
  description?: string | null
  installs?: number
  stars?: number
  tags?: string[]
  official?: boolean
  occurredAt?: number | null
  pushedAt?: number | null
  modifiedAt?: number | null
}

const {
  skill,
  variant = 'grid',
  signal = 'auto',
  showDescription = true,
  showCopy = true,
  showOwnerAvatar = true,
  showOwnerPath = false,
  showTags = false,
  timestampLabel,
  timestampFormat = 'absolute',
} = defineProps<{
  skill: SkillLike
  variant?: 'grid' | 'list' | 'compact'
  signal?: 'installs' | 'stars' | 'auto' | 'none'
  showDescription?: boolean
  showCopy?: boolean
  showOwnerAvatar?: boolean
  showOwnerPath?: boolean
  showTags?: boolean
  timestampLabel?: string
  timestampFormat?: 'absolute' | 'relative'
}>()

const installCmd = computed(() => gitInstallCmd(skill.owner, skill.repo, skill.name))
const { copy, copied } = useInstallCopy(
  installCmd,
  variant === 'compact' ? 'skill-card-compact' : variant === 'list' ? 'skill-card-list' : 'skill-card',
  () => ({ kind: 'skill', owner: skill.owner, name: skill.name }),
)

const skillPath = computed(() => {
  return repoSkillPath(skill.owner, skill.repo, skill.name)
})

const ownerPath = computed(() =>
  `${skill.owner}${skill.repo !== 'skills' ? `/${skill.repo}` : ''}`,
)

function formatStars(n: number): string {
  if (n >= 10000)
    return `${Math.round(n / 1000)}k`
  if (n >= 1000)
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toLocaleString()
}

function formatCount(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toLocaleString()
}

function formatTimestamp(epochSeconds: number): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(epochSeconds * 1000))
}

function formatRelative(epochSeconds: number): string {
  const diff = Date.now() - epochSeconds * 1000
  const days = Math.floor(diff / 86_400_000)
  if (days < 1)
    return 'today'
  if (days < 2)
    return 'yesterday'
  if (days < 30)
    return `${days}d ago`
  if (days < 365)
    return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

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

const formattedTimestamp = computed(() => {
  if (timestampSeconds.value == null)
    return null
  return timestampFormat === 'relative'
    ? formatRelative(timestampSeconds.value)
    : formatTimestamp(timestampSeconds.value)
})

const resolvedSignal = computed<'installs' | 'stars' | null>(() => {
  if (signal === 'none')
    return null
  const installs = skill.installs ?? 0
  const stars = skill.stars ?? 0
  if (signal === 'installs')
    return installs > 0 ? 'installs' : null
  if (signal === 'stars')
    return stars > 0 ? 'stars' : null
  if (installs > 0)
    return 'installs'
  if (stars > 0)
    return 'stars'
  return null
})

const linkClasses = computed(() => {
  if (variant === 'list')
    return 'flex items-center gap-4 px-4 py-3 pr-12 transition-colors duration-200 hover:bg-elevated'
  if (variant === 'compact')
    return 'flex h-full flex-col rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]'
  return 'flex h-full min-h-[8.5rem] flex-col rounded-lg border border-default p-4 pr-12 transition-colors duration-200 hover:border-[var(--ui-text-muted)]'
})

const buttonPositionClass = computed(() =>
  variant === 'list' ? 'top-1/2 right-3 -translate-y-1/2' : 'top-3 right-3',
)

const signalFadesOnHover = computed(() => showCopy && variant !== 'compact')
</script>

<template>
  <div class="group relative h-full">
    <NuxtLink
      :to="skillPath"
      :aria-label="`${skill.name} by ${skill.owner}`"
      :class="linkClasses"
    >
      <template v-if="variant === 'list'">
        <div class="min-w-0 flex-1 flex items-center gap-3">
          <div class="flex items-center gap-2 min-w-0 shrink-0">
            <img
              v-if="showOwnerAvatar"
              :src="`https://github.com/${skill.owner}.png?size=32`"
              :alt="skill.owner"
              width="16"
              height="16"
              class="size-4 shrink-0 rounded-full"
              loading="lazy"
            >
            <p class="font-mono text-sm font-medium truncate">
              {{ skill.name }}
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
            {{ ownerPath }}
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
            <time
              :datetime="timestampDate.toISOString()"
              :title="timestampDate.toISOString()"
            >
              {{ timestampLabel }} {{ formattedTimestamp }}
            </time>
          </p>
          <p
            v-if="showDescription && skill.description"
            class="text-xs text-muted truncate hidden sm:block"
          >
            {{ skill.description }}
          </p>
        </div>
        <span
          v-if="resolvedSignal === 'installs'"
          class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
          :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
          :title="`${(skill.installs ?? 0).toLocaleString()} weekly installs`"
        >
          <UIcon name="i-lucide-arrow-down-to-line" class="size-3" aria-hidden="true" />
          {{ formatCount(skill.installs ?? 0) }}
        </span>
        <span
          v-else-if="resolvedSignal === 'stars'"
          class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
          :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
          :title="`${(skill.stars ?? 0).toLocaleString()} GitHub stars`"
        >
          <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
          {{ formatStars(skill.stars ?? 0) }}
        </span>
      </template>

      <template v-else>
        <div class="flex items-start gap-2">
          <p class="font-mono text-sm font-medium truncate min-w-0 flex-1">
            {{ skill.name }}
          </p>
          <span
            v-if="!showOwnerPath && resolvedSignal === 'installs'"
            class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
            :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
            :title="`${(skill.installs ?? 0).toLocaleString()} weekly installs`"
          >
            <UIcon name="i-lucide-arrow-down-to-line" class="size-3" aria-hidden="true" />
            {{ formatCount(skill.installs ?? 0) }}
          </span>
          <span
            v-else-if="!showOwnerPath && resolvedSignal === 'stars'"
            class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
            :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
            :title="`${(skill.stars ?? 0).toLocaleString()} GitHub stars`"
          >
            <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
            {{ formatStars(skill.stars ?? 0) }}
          </span>
        </div>
        <div
          v-if="showOwnerPath"
          class="mt-0.5 flex items-center gap-1.5"
        >
          <img
            v-if="showOwnerAvatar"
            :src="`https://github.com/${skill.owner}.png?size=32`"
            :alt="skill.owner"
            width="16"
            height="16"
            class="size-4 shrink-0 rounded-full"
            loading="lazy"
          >
          <p class="text-xs text-muted truncate min-w-0 flex-1">
            {{ ownerPath }}
          </p>
          <span
            v-if="resolvedSignal === 'installs'"
            class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
            :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
            :title="`${(skill.installs ?? 0).toLocaleString()} weekly installs`"
          >
            <UIcon name="i-lucide-arrow-down-to-line" class="size-3" aria-hidden="true" />
            {{ formatCount(skill.installs ?? 0) }}
          </span>
          <span
            v-else-if="resolvedSignal === 'stars'"
            class="data-label shrink-0 inline-flex items-center gap-1 transition-opacity"
            :class="signalFadesOnHover ? 'group-hover:opacity-0' : ''"
            :title="`${(skill.stars ?? 0).toLocaleString()} GitHub stars`"
          >
            <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
            {{ formatStars(skill.stars ?? 0) }}
          </span>
        </div>
        <p
          v-if="timestampLabel && timestampDate"
          class="mt-2 inline-flex items-center gap-1 text-xs text-muted"
        >
          <UIcon
            name="i-lucide-calendar-days"
            class="size-3"
            aria-hidden="true"
          />
          <time
            :datetime="timestampDate.toISOString()"
            :title="timestampDate.toISOString()"
          >
            {{ timestampLabel }} {{ formattedTimestamp }}
          </time>
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
          v-if="showDescription && variant !== 'compact' && skill.description"
          class="mt-2 text-xs text-muted leading-relaxed line-clamp-3"
        >
          {{ skill.description }}
        </p>
      </template>
    </NuxtLink>

    <UButton
      v-if="showCopy"
      :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      size="xs"
      color="neutral"
      variant="ghost"
      class="absolute z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      :class="buttonPositionClass"
      :aria-label="copied ? 'Copied' : `Copy install command for ${skill.name}`"
      @click.stop.prevent="copy(installCmd)"
    />
  </div>
</template>
