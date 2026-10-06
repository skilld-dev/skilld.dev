<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { SkillCardSkill } from '~/types/skill-card'
import TrendingPostCarousel from './TrendingPostCarousel.vue'
import TrendingPostFaces from './TrendingPostFaces.vue'
import TrendingPostQuote from './TrendingPostQuote.vue'
import TrendingStarSpark from './TrendingStarSpark.vue'

/**
 * One board entry in two lines of words: what the Skill does, then why it is
 * on the board. A row ranked by posts shows who posted and quotes the first
 * one; the faces open every post. The posts used to show as a card under
 * every row and tripled its height.
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
 * a row with posts, so it gets the braille spark beside its name. Stars ranked
 * a surge or a filler row, so those keep the star line. Two charts on one row
 * would ask the reader which one put the row here.
 *
 * A month board ranks posts older than the spark's seven days. A week of
 * blank cells draws nothing, so that row shows no spark and its faces carry
 * the evidence alone.
 */
const mentions = computed(() => {
  const days = row.reason._tag === 'posts' ? row.reason.mentionsByDay : null
  return days?.some(count => count > 0) ? days : null
})
const starLine = computed(() => row.reason._tag !== 'posts' && row.starSeries.length > 0)

/**
 * Whether the second line has anything to say. A track member says nothing
 * there: its section heading already states the order. Its description keeps
 * both lines instead.
 */
const hasReason = computed(() => row.reason._tag !== 'member' || starLine.value)

const open = ref(false)
const postsId = useId()
const postsLabel = computed(() => `${posts.value.length} ${posts.value.length === 1 ? 'post' : 'posts'} about /${row.name}`)
</script>

<template>
  <SkillCard
    :skill
    layout="row"
    :rank
    :actions
    :surface
    :description-lines="hasReason ? 1 : 2"
    @avatar-error="owner => emit('avatarError', owner)"
  >
    <template v-if="mentions" #flag>
      <BrailleSpark :counts="mentions" period="in 7 days" :show-total="false" />
    </template>
    <template v-if="hasReason" #meta>
      <template v-if="posts.length">
        <TrendingPostFaces :posts :open :controls="postsId" :label="postsLabel" @toggle="() => { open = !open }" />
        <!-- The first card repeats this post, so the line steps aside while the cards show. -->
        <TrendingPostQuote v-if="!open" :post="posts[0]!" :names="row.names" />
      </template>
      <template v-else>
        <TrendingStarSpark v-if="starLine" :points="row.starSeries" />
        <template v-if="row.reason._tag === 'reviewed'">
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
    </template>
    <!-- In the server HTML while closed, so every post the board ranked on stays readable to a crawler. -->
    <template v-if="posts.length" #aside>
      <div :id="postsId" :hidden="!open">
        <TrendingPostCarousel
          :posts="posts"
          :names="row.names"
          :label="`Posts about /${row.name}`"
        />
      </div>
    </template>
  </SkillCard>
</template>
