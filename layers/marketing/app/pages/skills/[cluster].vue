<script setup lang="ts">
import type { ClusterCard } from '#layers/registry/server/api/clusters/index.get'
import type { TrackTalkedResponse } from '#layers/registry/server/presenters/track-talked'
import type { TrackMemberInput } from '#shared/track-board'
import { setResponseHeaders } from 'h3'
import { comparisonLinkForTrack } from '#shared/comparison-navigation'
import {
  MIN_TALKED_SKILLS,
  resolveTrackRange,
  TRACK_RANGES,
  trackBoard,
  trackRangeMeta,
  trackRangePath,
} from '#shared/track-board'
import BoardRangeSwitch from '../../components/BoardRangeSwitch.vue'
import BoardRankedList from '../../components/BoardRankedList.vue'
import BoardShell from '../../components/BoardShell.vue'
import { resolveClusterViewState } from '../../utils/cluster-view-state'

interface ClusterSkill extends TrackMemberInput {
  modifiedAt: number | null
  slug: string
}

interface ClusterDetailResponse {
  cluster: {
    slug: string
    label: string
    /** How the track reads before "skills" in a board heading. */
    noun: string
    icon: string
    userVoice: string
    /** Keyword-shaped <title>; the H1 keeps `label`. */
    seoTitle: string
    seoDescription: string
    /** Preamble inherited from the collection merged into this track. */
    curatorNote: string | null
  }
  items: ClusterSkill[]
  total: number
  page: number
  pages: number
}

const { state: auth } = useAuth()
/** Someone already getting the weekly is never shown an invitation to get it. */
const receivingWeekly = computed(() => auth.value._tag === 'signed-in' && auth.value.user.onboarded === true)

const route = useRoute()
const clusterSlug = computed(() => route.params.cluster as string)
const comparisonLink = computed(() => comparisonLinkForTrack(clusterSlug.value))
/**
 * Parsed once, at the boundary. An unrecognised `?range=` is the week board
 * rather than an error.
 */
const range = computed(() => resolveTrackRange(route.query.range))
const rangeOptions = computed(() => TRACK_RANGES.map(option => ({
  ...option,
  path: trackRangePath(clusterSlug.value, option.id),
})))

// Blocking, not lazy. `useLazyFetch` does not hold SSR, so the server rendered
// this page with `data === null`: every track served the fallback title and,
// once the thin-track guard landed, `noindex` as well. Only the client filled
// in the real title after hydration, which is exactly what a crawler never
// runs. This page exists to rank, so it has to be right in the server response.
//
// All three at once: none reads another. The talked list and the track list
// are secondary. If either fails, the members still render.
const [
  { data, error, status, refresh },
  { data: talked, error: talkedError },
  { data: tracks },
] = await Promise.all([
  useFetch<ClusterDetailResponse>(() => `/api/clusters/${clusterSlug.value}`),
  useFetch<TrackTalkedResponse>(() => `/api/clusters/${clusterSlug.value}/talked`, {
    query: { range },
  }),
  useFetch<{ items: ClusterCard[] }>('/api/clusters'),
])

// A board that lost its posts must not enter a shared cache, which would keep
// serving it without them.
if (import.meta.server && talkedError.value) {
  const event = useRequestEvent()
  if (event)
    setResponseHeaders(event, { 'cloudflare-cdn-cache-control': 'no-store', 'cache-control': 'private, no-store' })
}

const clusterView = computed(() => resolveClusterViewState({
  data: data.value,
  error: error.value,
  status: status.value,
}))

watch(clusterView, (view) => {
  if (view._tag === 'not-found')
    showError(createError({ statusCode: 404, statusMessage: 'Unknown track' }))
}, { immediate: true })

const clusterData = computed(() =>
  clusterView.value._tag === 'ready' ? clusterView.value.data : null,
)
const skills = computed(() => clusterData.value?.items ?? [])
const total = computed(() => clusterData.value?.total ?? 0)

/**
 * Owners whose avatar failed to load, which means the GitHub account is gone.
 * Same rule as the trending board: a row we cannot put a face to has dead
 * provenance, and it leaves the board.
 */
const missingAvatars = ref(new Set<string>())
function onAvatarError(owner: string) {
  missingAvatars.value = new Set(missingAvatars.value).add(owner)
}

/** The talked payload's clock, so every post dates the same on server and client. */
const clock = computed(() => talked.value?.computedAt ?? 0)

const board = computed(() => trackBoard({
  noun: clusterData.value?.cluster.noun ?? 'track',
  range: range.value,
  talked: (talked.value?.skills ?? []).filter(skill => !missingAvatars.value.has(skill.owner)),
  members: skills.value.filter(skill => !missingAvatars.value.has(skill.owner)),
  clockSeconds: clock.value,
}))

const period = computed(() => trackRangeMeta(range.value).period)
const hasTalkedSection = computed(() => board.value.sections[0]?._tag === 'talked')

/**
 * Why the board shows no posts, when devs did talk about a few of its Skills.
 * Silence would read as nobody posting at all.
 */
const quietLine = computed(() => {
  const count = board.value.talkedCount
  if (hasTalkedSection.value || count === 0)
    return null
  return `Devs talked about ${count} of these skills ${period.value}. A list ranked by devs starts at ${MIN_TALKED_SKILLS}.`
})

/** The dates the talked section covers, stated so a stale board shows as stale. */
const rangeWindow = computed(() => {
  if (!clock.value)
    return null
  const end = new Date(clock.value * 1000)
  const start = new Date(end.getTime() - trackRangeMeta(range.value).windowHours * 3_600_000)
  const day = (d: Date) => d.getUTCDate()
  const month = (d: Date) => d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
  const year = end.getUTCFullYear()
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${day(end)} ${month(end)} ${year}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year}`
})

/** Star-ranked rows render in pages, so a long track does not ship every row up front. */
const STARS_STEP = 15
const visibleStars = ref(STARS_STEP)
function showMoreStars() {
  visibleStars.value += STARS_STEP
}

/**
 * Every track with Skills behind it, for the sidebar. The track list is a
 * navigation aid: if it fails to load, the board still renders without it.
 */
const allTracks = computed(() => tracks.value?.items ?? [])
const otherTracks = computed(() => allTracks.value.filter(track => track.slug !== clusterSlug.value))

const isEmpty = computed(() => board.value.sections.length === 0)
const showWeeklyCta = computed(() => !receivingWeekly.value && !isEmpty.value)

// The <title> is keyword-shaped ("Agent Skills for UI and Design") while the
// H1 below keeps the editorial label. VISION principle 6 grants that carve-out
// for search surfaces only; it never reaches product UI. The skill count is
// appended rather than baked into seoDescription so the copy stays honest when
// a track is thin.
// No ` · skilld` suffix here: a global titleTemplate already appends it, and
// adding one produced "... · skilld · skilld".
const title = computed(() =>
  clusterData.value
    ? clusterData.value.cluster.seoTitle
    : 'Agent skills by track',
)
const description = computed(
  () => clusterData.value
    ? `${clusterData.value.cluster.seoDescription} ${total.value} curated skills.`
    : 'Browse curated agent skills grouped by the work you are doing.',
)

// The 2026-06 suppression came from publishing pages before they had anything
// on them. A track admitted ahead of its curation is exactly that shape, so
// it stays out of the index until a curator has filled it. Under the threshold
// the page still renders and still serves internal nav; it just does not ask
// Google to rank an empty list.
const MIN_INDEXABLE_SKILLS = 3

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  robots: () => (total.value >= MIN_INDEXABLE_SKILLS ? 'index,follow' : 'noindex,follow'),
})

// Every range points at the bare track URL. The month board reorders the same
// members, and a second indexable copy of each track would split its ranking.
useHead({
  link: [{
    rel: 'canonical',
    href: computed(() => `https://skilld.dev/skills/${clusterSlug.value}`),
  }],
})

defineOgImage('Page.takumi', {
  title: () => clusterData.value?.cluster.label ?? 'Agent skills',
  description: () => clusterData.value?.cluster.userVoice ?? 'Browse skills by track.',
}, { alt: () => `${clusterData.value?.cluster.label ?? 'Agent skills'} on skilld` })
</script>

<template>
  <div>
    <section
      v-if="clusterView._tag === 'loading'"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-busy="true"
      aria-label="Loading track skills"
    >
      <div class="editorial-state">
        <USkeleton class="h-4 w-28" />
        <USkeleton class="mt-4 h-10 w-72 max-w-full" />
        <USkeleton class="mt-4 h-4 w-full max-w-xl" />
      </div>
    </section>

    <section
      v-else-if="clusterView._tag === 'error'"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="cluster-error-heading"
    >
      <div class="editorial-state" role="alert">
        <h1 id="cluster-error-heading" class="text-xl font-semibold">
          Couldn't load this track.
        </h1>
        <p class="mt-2 text-base text-muted">
          Check your connection and try again.
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <UButton
            label="Retry"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="() => refresh()"
          />
          <UButton
            to="/skills"
            label="Browse tracks"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </section>

    <BoardShell
      v-else-if="clusterData"
      heading-id="cluster-heading"
      surface="track"
      :show-weekly-cta="showWeeklyCta"
      :cta-pending="auth._tag === 'pending'"
    >
      <template #header>
        <h1 id="cluster-heading" class="text-3xl font-semibold tracking-tight text-balance">
          {{ clusterData.cluster.label }}
        </h1>
        <p class="mt-2 text-sm text-muted">
          {{ clusterData.cluster.userVoice }}
        </p>
        <UButton
          v-if="comparisonLink"
          :to="comparisonLink.to"
          :label="comparisonLink.label"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
        />
      </template>

      <template #sidebar>
        <BoardRangeSwitch :options="rangeOptions" :current="range" />
      </template>

      <!-- Wide screens only. Narrow ones list the other tracks under the board. -->
      <template v-if="allTracks.length" #sidebar-end>
        <h2 id="track-nav-heading" class="track-nav-heading">
          Tracks
        </h2>
        <nav class="track-nav" aria-labelledby="track-nav-heading">
          <NuxtLink
            v-for="track in allTracks"
            :key="track.slug"
            :to="`/skills/${track.slug}`"
            class="track-link"
            :class="{ 'track-link--current': track.slug === clusterSlug }"
            :aria-current="track.slug === clusterSlug ? 'page' : undefined"
          >
            <span>{{ track.label }}</span>
            <span class="track-link__hint">{{ `${track.skillCount.toLocaleString()} ${track.skillCount === 1 ? 'skill' : 'skills'}` }}</span>
          </NuxtLink>
        </nav>
      </template>

      <p class="data-label mb-3 flex min-h-7 items-center">
        {{ `${total.toLocaleString()} ${total === 1 ? 'skill' : 'skills'}` }}
      </p>
      <p v-if="talkedError" class="mb-3 text-sm text-muted" role="status">
        Couldn't load the posts for this range. No list below is ranked by devs.
      </p>
      <p v-else-if="quietLine" class="mb-6 text-sm text-muted">
        {{ quietLine }}
      </p>

      <div v-if="isEmpty" class="editorial-state" role="status">
        <p class="font-medium">
          No skills here yet.
        </p>
        <p class="mt-1 text-base text-muted">
          Try another track. This one has no skills listed yet.
        </p>
        <UButton
          to="/skills"
          label="Browse tracks"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
        />
      </div>

      <section
        v-for="(section, index) in board.sections"
        :key="section.id"
        class="track-section"
        :aria-labelledby="section.id"
      >
        <h2 :id="section.id" class="text-xl font-semibold tracking-tight text-balance">
          {{ section.heading }}
        </h2>
        <template v-if="section._tag === 'talked'">
          <p class="mt-1 text-sm text-muted">
            Ranked by how many separate devs talked about each one.
          </p>
          <p v-if="rangeWindow" class="data-label mt-1">
            {{ rangeWindow }}
          </p>
        </template>
        <p
          v-else-if="section._tag === 'picked' && clusterData.cluster.curatorNote"
          class="mt-1 max-w-2xl text-sm leading-relaxed text-muted text-pretty"
        >
          {{ clusterData.cluster.curatorNote }}
        </p>

        <div class="mt-4">
          <BoardRankedList
            :rows="section._tag === 'stars' ? section.rows.slice(0, visibleStars) : section.rows"
            surface="track-row"
            :show-weekly-cta="index === 0 && showWeeklyCta"
            :cta-pending="auth._tag === 'pending'"
            @avatar-error="onAvatarError"
          />
        </div>

        <div
          v-if="section._tag === 'stars' && section.rows.length > visibleStars"
          class="mt-6 flex justify-center"
        >
          <UButton
            :label="`Show ${Math.min(STARS_STEP, section.rows.length - visibleStars)} more`"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-chevron-down"
            class="min-h-11"
            @click="showMoreStars"
          />
        </div>
      </section>

      <!-- The sidebar's track list, for narrow screens, which have no sidebar. -->
      <section
        v-if="otherTracks.length"
        class="track-section lg:hidden"
        aria-labelledby="track-list-heading"
      >
        <h2 id="track-list-heading" class="text-xl font-semibold tracking-tight">
          Other tracks
        </h2>
        <ul class="mt-4 flex list-none flex-wrap gap-2 p-0">
          <li v-for="track in otherTracks" :key="track.slug">
            <UButton
              :to="`/skills/${track.slug}`"
              :label="track.label"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-h-11"
            />
          </li>
        </ul>
      </section>
    </BoardShell>
  </div>
</template>

<style scoped>
.track-section + .track-section {
  margin-block-start: 3rem;
}

/* Wide screens only: narrow screens list the tracks under the board. */
.track-nav-heading,
.track-nav {
  display: none;
}

@media (min-width: 64rem) {
  /* Set like the range heading above it, so the rail reads as one column. */
  .track-nav-heading {
    display: flex;
    align-items: center;
    min-block-size: 1.75rem;
    margin-block: 2rem 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: var(--ui-text);
  }

  .track-nav {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .track-link {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--ui-radius);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--ui-text-toned);
    transition: background-color 200ms;
  }

  @media (hover: hover) {
    .track-link:hover {
      background: var(--ui-bg-elevated);
    }
  }

  /* Marked like the current range: a raised surface, no accent. */
  .track-link--current {
    background: var(--ui-bg-elevated);
    color: var(--ui-text-highlighted);
  }

  .track-link__hint {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 400;
    line-height: 1rem;
    color: var(--ui-text-muted);
  }
}
</style>
