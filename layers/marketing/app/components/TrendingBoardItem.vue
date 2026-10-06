<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { SkillCardSkill } from '~/types/skill-card'
import TrendingPostCarousel from './TrendingPostCarousel.vue'
import TrendingStarSpark from './TrendingStarSpark.vue'

/**
 * One board entry: the Skill as a SkillCard row, then the posts about it as
 * testimony under its words. The row says why it is on the board in its meta
 * line, and only that once.
 */
const { row, rank, surface = 'trending-row' } = defineProps<{
  row: TrendingBoardRow
  /** One-based position on the board. */
  rank: number
  /** Analytics surface for the run pill. */
  surface?: string
}>()

const emit = defineEmits<{
  /** The owner's avatar failed, which means the GitHub account is gone. */
  avatarError: [owner: string]
}>()

const skill = computed<SkillCardSkill>(() => ({
  owner: row.owner,
  repo: row.repo,
  name: row.name,
  registryPath: row.to,
  description: row.description,
  stars: row.stars,
}))

/** Only where the row stands for exactly one Skill; see `singleSkill`. */
const actions = computed(() => row.skill ? ['run' as const] : [])

const posts = computed(() => (row.reason._tag === 'posts' ? row.reason.posts : []))

/**
 * Each row draws the signal that ranked it, and only that one. Mentions ranked
 * a row with posts, so it gets the braille spark. Stars ranked a surge or a
 * filler row, so those keep the star line. Two charts on one line would ask the
 * reader which one put the row here.
 *
 * A month board ranks posts older than the spark's seven days. A week of
 * blank cells draws nothing beside a bare zero, so that row shows no spark and
 * its posts carry their own dates.
 */
const isSocial = computed(() => row.reason._tag === 'posts')
const mentions = computed(() => {
  const days = row.reason._tag === 'posts' ? row.reason.mentionsByDay : null
  return days?.some(count => count > 0) ? days : null
})
const starLine = computed(() => !isSocial.value && row.starSeries.length > 0)
/**
 * Whether the meta line has anything to say. A track member says nothing
 * there: its section heading already states the order.
 */
const hasSignal = computed(() => {
  if (row.reason._tag === 'member')
    return false
  return !isSocial.value || mentions.value !== null
})
</script>

<template>
  <SkillCard
    :skill
    layout="row"
    :rank
    :actions
    :surface
    @avatar-error="owner => emit('avatarError', owner)"
  >
    <template v-if="hasSignal || starLine" #meta>
      <TrendingStarSpark v-if="starLine" :points="row.starSeries" />
      <BrailleSpark v-if="mentions" :counts="mentions" period="in 7 days" />
      <template v-else-if="row.reason._tag === 'reviewed'">
        <span>{{ `${row.reason.skillCount.toLocaleString()} ${row.reason.skillCount === 1 ? 'skill' : 'skills'}` }}</span>
        <span v-if="row.reason.updated">Updated {{ row.reason.updated }}</span>
      </template>
      <!--
        The two reasons with no post say why the row is here in words, since
        nothing beside them does. A surge has only its stars; filler has to
        say what ranked it, or a starred repository passes for a trending one.
      -->
      <span v-else-if="row.reason._tag === 'surge'" class="text-default">
        {{ `Star surge: +${row.reason.gain.toLocaleString()} stars in a day` }}<template v-if="row.reason.when">, {{ row.reason.when }}</template>
      </span>
      <span v-else-if="row.reason._tag === 'filler'">Ranked by GitHub stars</span>
    </template>
    <template v-if="posts.length" #aside>
      <TrendingPostCarousel
        :posts="posts"
        :names="row.names"
        :label="`Posts about /${row.name}`"
      />
    </template>
  </SkillCard>
</template>
