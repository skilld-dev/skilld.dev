<script setup lang="ts">
import type {
  SkillCardAction,
  SkillCardByline,
  SkillCardLayout,
  SkillCardMetric,
  SkillCardSkill,
} from '~/types/skill-card'
import { skillRunCmd } from '#shared/skill-commands'
import { buildSkillCardView, skillCardSurface } from '~/utils/skill-card-view'
import SkillCardIdentity from './skill-card/_SkillCardIdentity.vue'
import SkillCardMetricLabel from './skill-card/_SkillCardMetric.vue'
import SkillCardRun from './skill-card/_SkillCardRun.vue'

/**
 * Every Skill embed on the site. The props say what the context needs: the
 * layout it sits in, how much provenance the page already carries, the one
 * metric worth showing and the controls it offers. Slots carry the few
 * facts only one context has, such as a Repository's dependencies.
 *
 * Each layout opens with the same identity unit, the face beside the name
 * over one quiet byline. Then at most two lines of words, then the facts and
 * the dashed run pill. Three weights in all: the name, the words, the facts.
 */
const {
  skill,
  layout = 'card',
  byline = 'full',
  metric = 'stars',
  actions,
  // Vue casts an absent boolean to false; an explicit undefined keeps the layout default.
  description = undefined,
  rank,
  note,
  trending = false,
  surface,
} = defineProps<{
  skill: SkillCardSkill
  layout?: SkillCardLayout
  byline?: SkillCardByline
  metric?: SkillCardMetric
  /** Defaults to `run` on cards and rows, and none on compact entries. */
  actions?: readonly SkillCardAction[]
  /** Defaults to on, except in compact entries. */
  description?: boolean
  /** One-based position in a ranked list. */
  rank?: number
  /** Why the Skill is here, in a curator's or editor's words. */
  note?: string | null
  trending?: boolean
  /** Analytics surface of the run copy. Defaults to `skill-<layout>`. */
  surface?: string
}>()

const slots = defineSlots<{
  /** Inline facts beside the metric, such as "Watching for changes" or a braille spark. */
  meta?: () => unknown
  /** A block under the description, such as dependencies. */
  footer?: () => unknown
  /** Extra controls before the run pill. */
  actions?: () => unknown
}>()

const resolvedSurface = skillCardSurface({ layout, surface })
const runCommand = computed(() => skillRunCmd(skill.owner, skill.repo, skill.name))
const { copy, copied } = useInstallCopy(
  runCommand,
  resolvedSurface,
  'run',
  () => ({ kind: 'skill', owner: skill.owner, name: skill.name }),
)

const view = computed(() => buildSkillCardView(
  skill,
  { layout, byline, metric, actions, description, rank, note, trending, surface },
  { copied: copied.value, copy: () => { void copy(runCommand.value) } },
))

const rankText = computed(() => view.value.rank == null ? null : String(view.value.rank).padStart(2, '0'))
const rankLead = computed(() => (view.value.rank ?? 99) <= 3)
const hasControls = computed(() => Boolean(view.value.run || view.value.like || view.value.sourceUrl || slots.actions))
const hasFacts = computed(() => Boolean(view.value.metric || slots.meta))
/** A braille spark in the meta slot already spends the entry's rose. */
const markAccent = computed(() => !slots.meta)

/**
 * Rows in one list share their metric column, so its width comes from what
 * the row can hold, not what it holds now. A count of 9 and one of 42 line up.
 */
const metricWidth = computed(() => view.value.metricKind === 'none' ? '0rem' : view.value.metricKind === 'updated' ? '6.5rem' : '3.5rem')
</script>

<template>
  <!-- Card: a tile in a grid, or one embed in an article. -->
  <article v-if="view.layout === 'card'" class="skill-card skill-card--card">
    <div class="flex min-w-0 items-start gap-3">
      <span v-if="rankText" class="skill-card__rank" :class="{ 'skill-card__rank--lead': rankLead }" aria-hidden="true">{{ rankText }}</span>
      <SkillCardIdentity :view :size="32" :accent="markAccent" wrap class="min-w-0 flex-1" />
    </div>

    <p v-if="view.note" class="skill-card__note mt-3 line-clamp-2">
      {{ view.note }}
    </p>
    <p v-if="view.description" class="skill-card__description" :class="view.note ? 'mt-1 line-clamp-1' : 'mt-3 line-clamp-2'">
      {{ view.description }}
    </p>

    <div v-if="$slots.footer" class="skill-card__raise mt-3">
      <slot name="footer" />
    </div>

    <div v-if="hasFacts || hasControls" class="skill-card__bar">
      <p v-if="hasFacts" class="skill-card__facts">
        <SkillCardMetricLabel v-if="view.metric" :metric="view.metric" />
        <span v-if="$slots.meta" class="skill-card__meta skill-card__raise"><slot name="meta" /></span>
      </p>
      <div v-if="hasControls" class="skill-card__controls">
        <slot name="actions" />
        <a
          v-if="view.sourceUrl"
          :href="view.sourceUrl"
          target="_blank"
          rel="noopener"
          class="skill-card__source"
        >SKILL.md<span class="sr-only"> on GitHub</span><UIcon name="i-lucide-arrow-up-right" class="size-3" aria-hidden="true" /></a>
        <LikeButton
          v-if="view.like"
          :owner="view.owner"
          :repo="view.repo"
          :name="view.name"
          :count="view.like.count"
          variant="inline"
        />
        <SkillCardRun v-if="view.run" :run="view.run" :title="view.title" />
      </div>
    </div>
  </article>

  <!--
    Row: one entry of a ledger. Wide, it reads in three zones: who, what and
    the facts. Narrow, it stacks like a card without the border, so the words
    get the whole width.
  -->
  <div v-else-if="view.layout === 'row'" class="skill-card skill-card--row-shell">
    <div class="skill-card--row" :class="{ 'skill-card--ranked': rankText }" :style="{ '--skill-card-metric': metricWidth }">
      <span v-if="rankText" class="skill-card__rank skill-card__row-rank" :class="{ 'skill-card__rank--lead': rankLead }" aria-hidden="true">{{ rankText }}</span>
      <SkillCardIdentity :view :size="36" :accent="markAccent" wrap class="skill-card__row-id" />

      <div v-if="view.note || view.description || $slots.footer" class="skill-card__row-body">
        <p v-if="view.note" class="skill-card__note line-clamp-2">
          {{ view.note }}
        </p>
        <p v-if="view.description" class="skill-card__description" :class="view.note ? 'mt-0.5 line-clamp-1' : 'line-clamp-2'">
          {{ view.description }}
        </p>
        <div v-if="$slots.footer" class="skill-card__raise mt-2">
          <slot name="footer" />
        </div>
      </div>

      <p v-if="$slots.meta" class="skill-card__meta skill-card__raise skill-card__row-meta">
        <slot name="meta" />
      </p>

      <div v-if="view.metricKind !== 'none' || hasControls" class="skill-card__row-end">
        <span v-if="view.metricKind !== 'none'" class="skill-card__row-metric">
          <SkillCardMetricLabel v-if="view.metric" :metric="view.metric" short />
        </span>
        <div v-if="hasControls" class="skill-card__controls">
          <slot name="actions" />
          <a
            v-if="view.sourceUrl"
            :href="view.sourceUrl"
            target="_blank"
            rel="noopener"
            class="skill-card__source"
          >SKILL.md<span class="sr-only"> on GitHub</span><UIcon name="i-lucide-arrow-up-right" class="size-3" aria-hidden="true" /></a>
          <LikeButton
            v-if="view.like"
            :owner="view.owner"
            :repo="view.repo"
            :name="view.name"
            :count="view.like.count"
            variant="inline"
          />
          <SkillCardRun v-if="view.run" :run="view.run" :title="view.title" />
        </div>
      </div>
    </div>
  </div>

  <!-- Compact: the identity unit alone, with the metric in its byline. -->
  <div v-else class="skill-card skill-card--compact" :class="{ 'skill-card--face': view.byline === 'full' }">
    <span v-if="rankText" class="skill-card__rank" aria-hidden="true">{{ rankText }}</span>
    <div class="min-w-0 flex-1">
      <SkillCardIdentity :view :size="28" :accent="markAccent" terse>
        <SkillCardMetricLabel v-if="view.metric" :metric="view.metric" short />
        <span v-if="$slots.meta" class="skill-card__meta skill-card__raise"><slot name="meta" /></span>
      </SkillCardIdentity>
      <p v-if="view.note" class="skill-card__note skill-card__compact-line line-clamp-2">
        {{ view.note }}
      </p>
      <p v-if="view.description" class="skill-card__description skill-card__compact-line line-clamp-2">
        {{ view.description }}
      </p>
      <div v-if="$slots.footer" class="skill-card__raise mt-1.5">
        <slot name="footer" />
      </div>
    </div>
    <div v-if="hasControls" class="skill-card__controls self-center">
      <slot name="actions" />
      <LikeButton
        v-if="view.like"
        :owner="view.owner"
        :repo="view.repo"
        :name="view.name"
        :count="view.like.count"
        variant="inline"
      />
      <SkillCardRun v-if="view.run" :run="view.run" :title="view.title" />
    </div>
  </div>
</template>

<style scoped>
.skill-card {
  position: relative;
  min-inline-size: 0;
}

.skill-card__raise,
.skill-card__controls {
  position: relative;
  z-index: 1;
}

.skill-card__rank {
  flex: none;
  min-inline-size: 1.25rem;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}

/* The first three are a step darker, never rose, as on the trending board. */
.skill-card__rank--lead {
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

/* The words: the curator's note in body ink, the Skill's own description muted. */
.skill-card__note,
.skill-card__description {
  max-inline-size: 70ch;
  font-size: 0.8125rem;
  line-height: 1.25rem;
  text-wrap: pretty;
}

.skill-card__note {
  color: var(--ui-text);
}

.skill-card__description {
  color: var(--ui-text-muted);
}

/* The facts: mono, small, tabular. */
.skill-card__facts {
  display: flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
}

.skill-card__meta {
  display: inline-flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--ui-text-muted);
}

.skill-card__controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
}

/* The source link spells its name: an icon alone said nothing. */
.skill-card__source {
  display: inline-flex;
  min-block-size: 1.75rem;
  align-items: center;
  gap: 0.25rem;
  padding-inline: 0.375rem;
  border-radius: var(--ui-radius);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  transition: color 200ms ease-out, background-color 200ms ease-out;
}

@media (hover: hover) {
  .skill-card__source:hover {
    background: var(--ui-bg-muted);
    color: var(--ui-text);
  }
}

@media (pointer: coarse) {
  .skill-card__source {
    min-block-size: 2.75rem;
  }
}

/* ---- card ---- */
.skill-card--card {
  display: flex;
  block-size: 100%;
  flex-direction: column;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  padding: 1rem;
  transition: border-color 200ms ease-out;
}

@media (hover: hover) {
  .skill-card--card:hover {
    border-color: var(--ui-border-accented);
  }
}

.skill-card__bar {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-block-start: auto;
  padding-block-start: 0.875rem;
}

.skill-card__bar .skill-card__controls {
  margin-inline-start: auto;
}

/* ---- row ---- */
.skill-card--row-shell {
  container: skill-card-row / inline-size;
}

/*
 * Narrow first, stacked like a card without its border: the identity, the
 * words at full width, then one line of facts with the run pill at its end.
 */
.skill-card--row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'id'
    'body'
    'meta'
    'end';
  align-items: center;
  padding: 0.875rem 0.5rem;
  transition: background-color 200ms ease-out;
}

.skill-card--ranked {
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    'rank id'
    'body body'
    'meta meta'
    'end end';
  column-gap: 0.75rem;
}

@media (hover: hover) {
  .skill-card--row:hover {
    background: var(--ui-bg-elevated);
  }
}

.skill-card__row-rank {
  grid-area: rank;
}

.skill-card__row-id {
  grid-area: id;
}

.skill-card__row-body {
  grid-area: body;
  min-inline-size: 0;
  margin-block-start: 0.625rem;
}

.skill-card__row-meta {
  grid-area: meta;
  margin-block-start: 0.5rem;
}

.skill-card__row-end {
  grid-area: end;
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-block-start: 0.5rem;
}

.skill-card__row-end .skill-card__controls {
  margin-inline-start: auto;
}

.skill-card__row-metric {
  display: inline-flex;
}

/*
 * Wide: three zones, who, what and the facts. The facts column has fixed
 * parts, so every row in a list lines up.
 */
@container skill-card-row (min-width: 40rem) {
  .skill-card--row {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.5fr) auto;
    grid-template-areas:
      'id body end'
      'id meta end';
    grid-template-rows: auto 1fr;
    column-gap: 1.5rem;
    align-items: start;
  }

  .skill-card--ranked {
    grid-template-columns: 1.25rem minmax(0, 1.1fr) minmax(0, 1.5fr) auto;
    grid-template-areas:
      'rank id body end'
      'rank id meta end';
    column-gap: 1rem;
  }

  .skill-card__row-rank {
    padding-block-start: 0.5rem;
  }

  .skill-card__row-body {
    margin-block-start: 0.125rem;
  }

  .skill-card__row-meta {
    margin-block-start: 0.375rem;
  }

  .skill-card__row-end {
    margin-block-start: 0.125rem;
  }

  .skill-card__row-metric {
    justify-content: flex-end;
    min-inline-size: var(--skill-card-metric);
  }
}

/* ---- compact ---- */
.skill-card--compact {
  display: flex;
  min-block-size: 2.75rem;
  align-items: flex-start;
  gap: 0.625rem;
  margin-inline: -0.5rem;
  padding: 0.5rem;
  border-radius: var(--ui-radius);
  transition: background-color 200ms ease-out;
}

@media (hover: hover) {
  .skill-card--compact:hover {
    background: var(--ui-bg-elevated);
  }
}

.skill-card--compact > .skill-card__rank {
  padding-block-start: 0.25rem;
}

/* Under the name, not under the face. */
.skill-card--face .skill-card__compact-line {
  padding-inline-start: 2.375rem;
}

.skill-card__compact-line {
  margin-block-start: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.125rem;
}

@media (prefers-reduced-motion: reduce) {
  .skill-card--card,
  .skill-card--row,
  .skill-card--compact,
  .skill-card__source {
    transition: none;
  }
}

@media (forced-colors: active) {
  .skill-card--card {
    border-color: CanvasText;
  }
}
</style>
