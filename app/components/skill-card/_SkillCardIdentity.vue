<script setup lang="ts">
import type { SkillCardView } from '~/types/skill-card'

/**
 * Who and what, as one unit: the face, then the name over one quiet byline.
 * Cards, rows and compact entries all open with it, at three sizes, so a
 * Skill reads the same wherever it sits.
 */
const { view, size, terse = false, accent = true, wrap = false } = defineProps<{
  view: SkillCardView
  /** Avatar size in CSS pixels. */
  size: 28 | 32 | 36
  /** The person alone, without the Repository, where the entry is too narrow for both. */
  terse?: boolean
  /** Ink the trending mark rose. Off where the entry already spends its rose, such as a braille spark. */
  accent?: boolean
  /** Let a long name wrap instead of truncating, where the entry has the height for it. */
  wrap?: boolean
}>()

const emit = defineEmits<{
  /** The avatar failed, which means the GitHub account is gone. */
  avatarError: []
}>()

const avatar = useTemplateRef<HTMLImageElement>('avatar')

// An avatar can fail before this card hydrates, such as in a row that
// hydrates only once it scrolls into view. Its error event then fired with no
// listener, so the mount reads the image instead.
onMounted(() => {
  const image = avatar.value
  if (image?.complete && image.naturalWidth === 0)
    emit('avatarError')
})

/** The author names the owner, so the byline needs only the Repository after it. */
const where = computed(() => view.author ? view.repo : view.source)
</script>

<template>
  <div class="skill-id" :class="[`skill-id--${size}`, wrap && 'skill-id--wrap']">
    <img
      v-if="view.byline === 'full'"
      ref="avatar"
      :src="view.avatar(size)"
      alt=""
      :width="size"
      :height="size"
      class="skill-id__avatar"
      loading="lazy"
      decoding="async"
      @error="emit('avatarError')"
    >
    <div class="skill-id__text">
      <p class="skill-id__name-line">
        <NuxtLink :to="view.href" :aria-label="view.label" class="skill-id__name">
          {{ view.title }}
        </NuxtLink>
        <span v-if="view.trending" class="skill-id__flag"><TrendingMark :accent /><span class="sr-only">Trending</span></span>
        <UBadge v-if="view.official" label="Official" variant="subtle" color="neutral" size="xs" class="skill-id__flag font-mono" />
        <span v-if="$slots.flag" class="skill-id__flag"><slot name="flag" /></span>
      </p>
      <p v-if="view.byline !== 'none' || $slots.default" class="skill-id__byline" :title="view.byline === 'full' ? view.source : undefined">
        <template v-if="view.byline === 'full' && terse">
          <span class="skill-id__person">{{ view.author ?? view.owner }}</span>
        </template>
        <template v-else-if="view.byline === 'full'">
          <template v-if="view.author">
            <span class="skill-id__person">{{ view.author }}</span>
            <span class="skill-id__sep" aria-hidden="true">·</span>
          </template>
          <span class="skill-id__where">{{ where }}</span>
        </template>
        <span v-else-if="view.byline === 'repo'" class="skill-id__where">{{ view.repo }}</span>
        <slot />
      </p>
    </div>
  </div>
</template>

<style scoped>
.skill-id {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.75rem;
}

.skill-id__avatar {
  flex: none;
  inline-size: var(--skill-id-size);
  block-size: var(--skill-id-size);
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--ui-bg-muted);
}

.skill-id--28 {
  --skill-id-size: 1.75rem;
  gap: 0.625rem;
}

.skill-id--32 {
  --skill-id-size: 2rem;
}

.skill-id--36 {
  --skill-id-size: 2.25rem;
}

.skill-id__text {
  min-inline-size: 0;
  flex: 1;
}

.skill-id__name-line {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.5rem;
}

/* The one strong thing in the entry. Stretched over it, so the entry is one link. */
.skill-id__name {
  min-inline-size: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}

.skill-id__name::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.skill-id--wrap .skill-id__name {
  white-space: normal;
  overflow-wrap: anywhere;
}

.skill-id--28 .skill-id__name {
  font-size: 0.8125rem;
}

.skill-id__flag {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex: none;
  align-items: center;
}

/* One quiet line: the person a step up from the place, both under the name. */
.skill-id__byline {
  display: flex;
  min-inline-size: 0;
  align-items: baseline;
  gap: 0.375rem;
  margin-block-start: 0.0625rem;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.skill-id__person {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-text-toned);
}

.skill-id__sep {
  color: var(--ui-text-dimmed);
}

.skill-id__where {
  min-inline-size: 0;
  flex-shrink: 1000;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  text-overflow: ellipsis;
}
</style>
