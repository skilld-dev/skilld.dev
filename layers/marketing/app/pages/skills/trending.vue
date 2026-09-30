<script setup lang="ts">
import type { TrendingFeedResponse, TrendingSkillFeedItem } from '~~/server/api/feed/trending.get'
import type { AdmittedSkillsResponse } from '#layers/registry/server/api/skills/admitted.get'
import type { SkillsLeaderboardResponse } from '#layers/registry/server/api/skills/leaderboard.get'
import type { TrendingBoardRow } from '#shared/trending-range'
import { avatarProxyUrl, githubAvatarProxyUrl } from '#shared/image-proxy'
import { relativeDay, trendingBasis, trendingOtherPosters } from '#shared/trending-basis'
import {
  leaderboardBoardRows,
  MIN_INDEXABLE_ROWS,
  monthStamp,
  resolveTrendingPage,
  resolveTrendingRange,
  TRENDING_BOARD_LIMIT,
  TRENDING_RANGES,
  trendingRangeDescription,
  trendingRangeHeading,
  trendingRangeMeta,
  trendingRangeTitle,
} from '#shared/trending-range'
import TrendingWeeklyCta from '../../components/TrendingWeeklyCta.vue'

/**
 * Rows the feed board shows at most.
 *
 * Applied twice on purpose: as the request, so the server does not rank more
 * than is wanted, and as a slice, so the fallback tail cannot push the board
 * past it. The `all` range is not capped by it: that board serves one page of
 * reviewed repositories, and truncating a page the endpoint already sized
 * would drop twenty rows for no reason.
 */
const BOARD_LIMIT = TRENDING_BOARD_LIMIT

const { state: auth } = useAuth()
/** Someone already getting the weekly is never shown an invitation to get it. */
const receivingWeekly = computed(() => auth.value._tag === 'signed-in' && auth.value.user.onboarded === true)

const route = useRoute()
/**
 * Parsed once, at the boundary, into a value the rest of the page trusts.
 * An unrecognised `?range=` is the default board rather than an error.
 */
const range = computed(() => resolveTrendingRange(route.query.range))
const meta = computed(() => trendingRangeMeta(range.value))

/**
 * What the board is reading, as one value rather than two nullable fetches.
 *
 * `all` answers a different question from `week` and `month`, so it reads a
 * different endpoint. Both land in the same row shape before the template sees
 * them; see `leaderboardBoardRows`.
 */
type BoardSource
  = | { _tag: 'feed', feed: TrendingFeedResponse }
    | { _tag: 'all', leaderboard: SkillsLeaderboardResponse }

// `await`, for the reason documented in [cluster].vue: without it the server
// renders before the request settles and ships an empty shell to the crawler.
const { data, error, refresh } = await useAsyncData<BoardSource>(
  'skills-trending-board',
  async () => {
    const active = trendingRangeMeta(range.value)
    if (active.windowHours === null) {
      return {
        _tag: 'all',
        leaderboard: await $fetch<SkillsLeaderboardResponse>('/api/skills/leaderboard', {
          query: { page: 1 },
        }),
      }
    }
    return {
      _tag: 'feed',
      feed: await $fetch<TrendingFeedResponse>('/api/feed/trending', {
        query: { limit: BOARD_LIMIT, window: active.windowHours },
      }),
    }
  },
  { watch: [range] },
)

const feed = computed(() => (data.value?._tag === 'feed' ? data.value.feed : null))
const leaderboard = computed(() => (data.value?._tag === 'all' ? data.value.leaderboard : null))

/**
 * The page of "earlier on this board" links. A real `?page=` query, so each
 * page of the list is a URL a crawler can follow.
 */
const listPage = computed(() => {
  const value = Number(Array.isArray(route.query.page) ? route.query.page[0] : route.query.page)
  return Number.isInteger(value) && value >= 1 ? value : 1
})

/**
 * Skills that first reached this range's board and have since left it.
 *
 * Rendered as plain links so a crawler can reach every Skill the sitemap
 * lists, not just the thirty on today's board. See `trending-admission.ts`.
 */
const { data: admitted } = await useAsyncData<AdmittedSkillsResponse>(
  'skills-trending-admitted',
  () => $fetch<AdmittedSkillsResponse>('/api/skills/admitted', {
    query: { board: range.value, page: listPage.value },
  }),
  { watch: [range, listPage] },
)

/**
 * The one clock every date on this page is measured against.
 *
 * Never the browser's. `Date.now()` produced a real hydration mismatch here:
 * the server rendered "4d ago" against its own clock and the client recomputed
 * against a different one, so Vue found the text changed under it. `computedAt`
 * travels with the payload and is identical on both sides. Zero means the fetch
 * failed, and a failed fetch has no board to date.
 */
const clock = computed(() => feed.value?.computedAt ?? 0)

/**
 * Owners whose avatar failed to load.
 *
 * `github.com/<login>.png` serves a generated identicon for every live
 * account, so it only fails when the account no longer exists. A row we cannot
 * put a face to is a row whose provenance is dead, and provenance is the whole
 * claim this page makes.
 *
 * Detected in the browser because nothing on the server knows: `owners` stores
 * no avatar, and the feed would have to make one request per listed owner to
 * find out. Storing the result at sync time is the durable fix.
 */
const missingAvatars = ref(new Set<string>())
function onAvatarError(owner: string) {
  missingAvatars.value = new Set(missingAvatars.value).add(owner)
}

const namedSkills = computed(() =>
  (feed.value?.namedSkills ?? []).filter(s => !missingAvatars.value.has(s.owner)),
)

/**
 * Fallback minus anything already on the page.
 *
 * The two lists are drawn from overlapping sources, and production served
 * `ppt-master`, `hallmark` and `karpathy-guidelines` in both at once, with
 * different numbers against each (`+865 stars` above, `46,712 stars` below).
 * The same skill twice is not two findings.
 */
const fallback = computed(() => {
  const shown = new Set(namedSkills.value.map(s => s.registryPath))
  return (feed.value?.fallback ?? []).filter(s =>
    !shown.has(s.registryPath) && !missingAvatars.value.has(s.owner),
  )
})

/**
 * One board, in one rank sequence.
 *
 * Evidenced rows always sit above star-only rows, never interleaved by score.
 * Ranking a 200,000-star repository against "two people named it" would let
 * raw popularity win the page every week, which is what the `all` range is
 * already for. Filling the tail with popular skills is honest; letting them
 * outrank the evidence is not.
 */
const board = computed<TrendingBoardRow[]>(() => {
  const rows = leaderboard.value
    ? leaderboardBoardRows(leaderboard.value.items)
    : [
        ...namedSkills.value.map(s => ({
          key: s.registryPath,
          owner: s.owner,
          title: s.canonicalName,
          to: s.registryPath,
          subtitle: `${s.owner}/${s.repo}`,
          description: s.description,
          stars: s.stars,
          basis: skillBasis(s),
          when: s.evidence ? relativeDay(s.evidence.postedAt, clock.value) : null,
          evidenceUrl: s.evidence?.url ?? null,
          quote: s.evidence?.text ?? null,
          platform: s.evidence?.platform ?? null,
          handle: s.evidence?.authorHandle ?? null,
          authorAvatar: s.evidence?.authorAvatar ?? null,
          engagement: s.evidence?.favouriteCount ?? null,
          otherPosters: trendingOtherPosters(s.authorCount, s.evidence !== null),
          evidenced: true,
        })),
        ...fallback.value.map(s => ({
          key: s.registryPath,
          owner: s.owner,
          title: s.canonicalName,
          to: s.registryPath,
          subtitle: `${s.owner}/${s.repo}`,
          description: s.description,
          stars: s.stars,
          // Star growth where we measured it, which is the only "recently"
          // claim a fallback entry can make. Absent, the row falls back to the
          // weaker claim that put it here at all, rather than rendering an
          // empty meta line that makes a filler row look like an evidenced one
          // that lost its evidence.
          basis: s.starsGained
            ? `+${s.starsGained.toLocaleString()} stars this week`
            : 'Popular on GitHub',
          when: null,
          evidenceUrl: null,
          quote: null,
          platform: null,
          handle: null,
          authorAvatar: null,
          engagement: null,
          otherPosters: null,
          evidenced: false,
        })),
      ].slice(0, BOARD_LIMIT)

  return rows.filter(row => !missingAvatars.value.has(row.owner))
})

const earlierRows = computed(() => {
  const onBoard = new Set(board.value.map(row => row.to))
  return (admitted.value?.items ?? []).filter(item => !onBoard.has(item.registryPath))
})

/** URL of one page of the earlier list. Page 1 is the range's own URL. */
function earlierPagePath(page: number): string {
  if (page <= 1)
    return meta.value.path
  return `${meta.value.path}${meta.value.path.includes('?') ? '&' : '?'}page=${page}`
}

const earlierPages = computed(() =>
  Array.from({ length: admitted.value?.pageCount ?? 1 }, (_, index) => index + 1),
)

/**
 * Rows that earned the page its place in the index.
 *
 * Counted from what the board renders, never from the raw payload. Named
 * skills count because each is verified content with its own quoted evidence,
 * and reviewed repositories count because each passed a human eligibility
 * check. The star fallback deliberately does not: it is generic popularity
 * available on any listing page, and letting filler earn indexability is
 * exactly how the catalog got suppressed in June.
 */
const evidencedTotal = computed(() => board.value.filter(row => row.evidenced).length)
const fillerTotal = computed(() => board.value.length - evidencedTotal.value)
const isEmpty = computed(() => board.value.length === 0)
const showWeeklyCta = computed(() => !receivingWeekly.value && !isEmpty.value && !error.value)

/**
 * The window the board covers, stated rather than implied.
 *
 * "This month" alone leaves a reader unable to tell a fresh board from a stale
 * one, which is the difference between a periodical and a page that might not
 * have updated.
 */
const rangeWindow = computed(() => {
  const days = meta.value.windowDays
  if (days === null || !clock.value)
    return null
  const end = new Date(clock.value * 1000)
  const start = new Date(end.getTime() - days * 86_400_000)
  const day = (d: Date) => d.getUTCDate()
  const month = (d: Date) => d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
  // Carries the year, unlike the first version. The `<title>` claims a month
  // and a year, and a body that never states the year gives Google grounds to
  // rewrite the title back to something undated.
  const year = end.getUTCFullYear()
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${day(end)} ${month(end)} ${year}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year}`
})

const stamp = computed(() => monthStamp(clock.value))

const starsSyncedOn = computed(() => formatDay(leaderboard.value?.starsSyncedAt ?? null))

/** The count line above the board, written from whichever board is showing. */
const boardMeta = computed(() => {
  if (leaderboard.value) {
    const parts = [`${board.value.length} of ${leaderboard.value.total} reviewed repos`]
    if (starsSyncedOn.value)
      parts.push(`stars checked ${starsSyncedOn.value}`)
    return parts.join(' · ')
  }
  const parts = [`${board.value.length} skills`]
  if (rangeWindow.value)
    parts.push(rangeWindow.value)
  return parts.join(' · ')
})

/**
 * The page header, which has to hold at fifty rows as well as at eight.
 *
 * The feed board runs evidenced rows first and popular skills after, and the
 * second group is most of the page on a quiet week. A header claiming every
 * row was named is the same overclaim the "Named by developers" heading made,
 * one level up, so the filler is acknowledged whenever any is on the board.
 */
const headerDescription = computed(() => {
  if (range.value === 'all')
    return 'Repositories from individual creators publishing reusable agent skills, reviewed for eligibility and ranked by GitHub stars.'
  // Neither the noun nor the period, both of which the heading above now
  // states. Repeating them cost the line its only job, which is the ranking
  // rule, and "say it once" is the brand's own instruction.
  return fillerTotal.value
    ? 'Ranked by how many separate devs talked about each one. Popular skills fill the rest of the board.'
    : 'Ranked by how many separate devs talked about each one.'
})

const heading = computed(() => trendingRangeHeading(range.value, clock.value))
const title = computed(() => trendingRangeTitle(range.value, clock.value))
const description = computed(() => trendingRangeDescription(range.value, evidencedTotal.value))

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  // Same guard as /skills/best and the category pages. A trending list is a
  // live feed, and a live feed can legitimately run dry; an eight-item page is
  // the thin, scaled-content shape that suppressed the catalog in June. Below
  // the bar the board stays crawlable but out of the index.
  robots: () => (evidencedTotal.value >= MIN_INDEXABLE_ROWS ? 'index,follow' : 'noindex,follow'),
})

// Every range points at itself. A range canonicalising to another would ask
// Google to drop the board it just crawled, which is how the `all` cluster
// would lose the ranking it inherited from /skills/leaderboard. A page number
// counts only up to the real page count; past it the page is a 404.
const pageDecision = computed(() =>
  resolveTrendingPage(meta.value.canonical, listPage.value, admitted.value?.pageCount ?? 1))

if (pageDecision.value._tag === 'out-of-range')
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

useHead({
  link: [{
    rel: 'canonical',
    href: computed(() => pageDecision.value._tag === 'ok' ? pageDecision.value.canonical : meta.value.canonical),
  }],
})

defineOgImage('Page.takumi', {
  // Stamped like the `<title>`, for the same reason: a shared card competes on
  // whether it looks current.
  title: () => (range.value === 'all'
    ? 'Top skill repositories'
    : [`Trending agent skills`, stamp.value].filter(Boolean).join(' · ')),
  description: () => (range.value === 'all'
    ? 'Individual creators publishing reusable agent skills, ranked by GitHub stars.'
    : 'What developers are actually posting about right now.'),
}, { alt: () => `${meta.value.heading} on skilld` })

function skillBasis(skill: TrendingSkillFeedItem): string | null {
  return trendingBasis({
    authorCount: skill.authorCount,
    starGain: skill.starGain,
    starGainDay: skill.starGainDay,
    hasEvidence: skill.evidence !== null,
  }, clock.value)
}

function likesLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'like' : 'likes'}`
}

function formatDay(timestamp: number | null): string | null {
  if (!timestamp)
    return null
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp * 1000)
}

/**
 * Quiet emphasis for the head of the board.
 *
 * A leaderboard wants its top entries to read first. Type scale is not
 * available for that here: `DESIGN.md` reserves large type for page
 * headings and lists "large font sizes in UI chrome" under Avoid. Contrast is,
 * so the top three ranks step up and nothing moves.
 *
 * 2026-09-04: the step is opacity rather than a text colour, because the rank
 * now carries the brand's rose ink and its dot-grid print, the same numerals
 * the homepage uses. The mechanism is unchanged: three entries read first.
 */
function rankClass(index: number): string {
  return index < 3 ? 'ledger-rank--lead' : ''
}
</script>

<template>
  <div>
    <CompactPageHeader
      :title="heading"
      :description="headerDescription"
      heading-id="trending-heading"
    />

    <section
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="trending-list-heading"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <!--
          The visible label is the heading, per DESIGN.md, rather
          than a label stacked under a screen-reader-only one. The sr-only h2
          here repeated the h1 word for word once the h1 took the category
          noun, and on the all-time range it called a list of repositories
          "Trending agent skills".
        -->
        <h2 id="trending-list-heading" class="section-label">
          {{ meta.sectionLabel }}
        </h2>
        <p v-if="!isEmpty && !error" class="data-label">
          {{ boardMeta }}
        </p>
      </div>

      <!--
        Real links, not a JS toggle. Each range is its own indexable document
        with its own canonical, so a crawler has to be able to follow one.
        Rendered above every state so a reader who lands on an empty range can
        switch away from it.
      -->
      <nav class="range-switcher mt-4" aria-label="Time range">
        <NuxtLink
          v-for="option in TRENDING_RANGES"
          :key="option.id"
          :to="option.path"
          class="range-link"
          :class="{ 'range-link--current': option.id === range }"
          :aria-current="option.id === range ? 'page' : undefined"
        >
          {{ option.label }}
        </NuxtLink>
      </nav>

      <div
        class="trending-board-layout"
        :class="{ 'trending-board-layout--with-cta': showWeeklyCta }"
      >
        <!--
          The server renders this page signed out for every visitor. The
          invitation keeps its column but stays invisible until the browser
          knows who is looking, so a weekly reader never sees it first.
        -->
        <div
          v-if="showWeeklyCta"
          class="trending-board-cta"
          :class="{ invisible: auth._tag === 'pending' }"
          :aria-hidden="auth._tag === 'pending' ? 'true' : undefined"
        >
          <TrendingWeeklyCta />
        </div>

        <div class="trending-board-main">
          <div v-if="error" class="editorial-state" role="alert">
            <p class="font-medium">
              Couldn't load the board.
            </p>
            <p class="mt-1 max-w-lg text-base leading-relaxed text-muted">
              The ranking is unavailable right now. Check your connection and try again.
            </p>
            <UButton
              label="Retry"
              color="neutral"
              variant="outline"
              class="mt-4 min-h-11"
              @click="() => refresh()"
            />
          </div>

          <div v-else-if="isEmpty" class="editorial-state flex flex-col justify-center" role="status">
            <template v-if="range === 'all'">
              <p class="text-sm text-default">
                No repositories have qualified yet.
              </p>
              <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                A repository appears here after a reviewer confirms its purpose and its skill inventory.
              </p>
            </template>
            <template v-else>
              <p class="text-sm text-default">
                Nothing is trending yet.
              </p>
              <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                Skilld watches X and Bluesky for posts mentioning a skill, and GitHub for repositories
                holding a single skill whose stars surge. Neither has anything to report in this range.
              </p>
            </template>
            <div class="mt-4">
              <UButton to="/skills" label="Browse the directory" color="neutral" variant="outline" class="min-h-11" />
            </div>
          </div>

          <ol v-else class="editorial-ledger list-none p-0">
            <li v-for="(row, index) in board" :key="row.key">
              <div class="ledger-row">
                <span class="ledger-rank" :class="rankClass(index)">{{ String(index + 1).padStart(2, '0') }}</span>
                <img
                  :src="githubAvatarProxyUrl(row.owner, 80)"
                  alt=""
                  width="40"
                  height="40"
                  class="size-10 shrink-0 rounded-full border border-default bg-muted"
                  loading="lazy"
                  decoding="async"
                  @error="onAvatarError(row.owner)"
                >
                <div class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-baseline gap-x-2">
                    <NuxtLink
                      :to="row.to"
                      class="font-medium text-default transition-opacity [overflow-wrap:anywhere] hover:opacity-70"
                    >
                      {{ row.title }}
                    </NuxtLink>
                    <span v-if="row.subtitle" class="font-mono text-xs text-muted">{{ row.subtitle }}</span>
                    <span v-if="row.stars" class="font-mono text-xs text-muted tabular-nums">
                      {{ `${row.stars.toLocaleString()} ★` }}
                    </span>
                  </span>
                  <span v-if="row.description" class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                    {{ row.description }}
                  </span>
                  <!--
                    Rendered alongside the quote, never instead of it. A `both`
                    row has to state its stars as well as its post. Other people
                    who named it are counted in the post footer below.

                    Above the quote, so everything the row itself asserts sits
                    flush in one block and the one indented element is the thing
                    somebody else said.
                  -->
                  <!--
                    `when` rides here only when no quote follows. An evidenced row
                    dates the post inside the quote, next to the handle that wrote
                    it, because the date belongs to what that person said. An
                    all-time row has no post, so its date is the repository's last
                    push and belongs to the row itself.
                  -->
                  <span v-if="row.basis || (!row.evidenceUrl && row.when)" class="data-label mt-2 block">
                    {{ row.basis }}<template v-if="row.basis && !row.evidenceUrl && row.when"> · </template><template v-if="!row.evidenceUrl && row.when">{{ row.when }}</template>
                  </span>
                  <a
                    v-if="row.evidenceUrl"
                    :href="row.evidenceUrl"
                    rel="nofollow noopener"
                    target="_blank"
                    class="mt-2 block border-l border-default pl-3 hover:border-inverted"
                  >
                    <span class="line-clamp-2 text-sm leading-relaxed text-default">{{ row.quote }}</span>
                    <span class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
                      <svg
                        class="size-3 shrink-0"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path v-if="row.platform === 'bsky'" d="M12 10.8C10.913 8.686 7.954 4.747 5.202 2.805 2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8" />
                        <path v-else d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z" />
                      </svg>
                      <span v-if="row.authorAvatar" class="flex shrink-0">
                        <img
                          :src="avatarProxyUrl(row.authorAvatar)"
                          alt=""
                          width="16"
                          height="16"
                          class="size-4 rounded-full bg-muted object-cover"
                          loading="lazy"
                          decoding="async"
                        >
                      </span>
                      <span>@{{ row.handle }}</span>
                      <span v-if="row.when">{{ row.when }}</span>
                      <span v-if="row.engagement" class="tabular-nums">{{ likesLabel(row.engagement) }}</span>
                      <span v-if="row.otherPosters">{{ row.otherPosters }}</span>
                    </span>
                  </a>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <section
      v-if="earlierRows.length"
      class="border-t border-default"
      aria-labelledby="earlier-heading"
    >
      <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 id="earlier-heading" class="text-2xl font-semibold tracking-tight">
          Earlier on this board
        </h2>
        <ul class="editorial-ledger mt-6 list-none p-0">
          <li v-for="item in earlierRows" :key="item.registryPath" class="py-3">
            <NuxtLink
              :to="item.registryPath"
              class="font-medium text-default transition-opacity [overflow-wrap:anywhere] hover:opacity-70"
            >
              {{ item.name }}
            </NuxtLink>
            <span class="ml-2 font-mono text-xs text-muted">{{ item.owner }}/{{ item.repo }}</span>
            <span v-if="item.description" class="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">
              {{ item.description }}
            </span>
          </li>
        </ul>
        <nav
          v-if="earlierPages.length > 1"
          class="mt-6 flex flex-wrap gap-2"
          aria-label="Earlier on this board, pages"
        >
          <NuxtLink
            v-for="number in earlierPages"
            :key="number"
            :to="earlierPagePath(number)"
            class="range-link"
            :class="{ 'range-link--current': number === listPage }"
            :aria-current="number === listPage ? 'page' : undefined"
          >
            {{ number }}
          </NuxtLink>
        </nav>
      </div>
    </section>

    <!--
      The eligibility rule, carried over with the `all` range from
      /skills/leaderboard. The range claims its rows were reviewed, and a
      reader has no way to check that claim unless the page states the rule.
    -->
    <section
      v-if="range === 'all'"
      class="border-t border-default bg-muted"
      aria-labelledby="method-heading"
    >
      <div class="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] md:py-16">
        <div>
          <h2 id="method-heading" class="text-2xl font-semibold tracking-tight sm:text-3xl">
            A deliberately narrow list.
          </h2>
        </div>
        <div class="max-w-2xl space-y-4 text-base leading-relaxed text-muted">
          <p>
            A reviewer must confirm that the owner is an individual GitHub user and the repository primarily publishes reusable, generic agent skills. Documentation, assets, scripts, and tests are allowed.
          </p>
          <p>
            Organizations, vendor catalogs, app-specific collections, prompts, bookmarks, and general applications are excluded. Repositories rank by current GitHub stars.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*
 * Row separators come from `.editorial-ledger` alone.
 *
 * Both row classes used to carry their own `border-bottom` while sitting
 * inside `.editorial-ledger`, which already draws `border-block` on itself and
 * a `border-top` between children. Every row rendered two rules, and the last
 * row rendered a doubled bottom edge.
 */
.ledger-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 0;
}

/*
 * No row-level hover here, unlike `/skills/best`.
 *
 * There the whole row is one link, so dimming the row states where a click
 * goes. Here the row holds two destinations, the skill and the post that named
 * it, and neither covers the row. A row-wide dim promised a click target that
 * does not exist, and it multiplied with the name link's own 0.7 whenever the
 * pointer was over the name, dropping it to 0.49 and reading as disabled.
 * Each target now dims only itself.
 */

.ledger-rank {
  font-family: var(--font-mono, monospace);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ui-primary);
  opacity: 0.5;
  padding-top: 0.7rem;
  mask-image: radial-gradient(circle, #000 1.1px, transparent 1.4px);
  mask-size: 3px 3px;
}

.ledger-rank--lead {
  opacity: 0.9;
}

.range-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/*
 * Border-driven, mono, small: the same chrome vocabulary as every other
 * control on the site. The current range is marked by contrast alone, so
 * nothing moves and no accent is spent on navigation.
 */
.range-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding-inline: 0.875rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  transition: color 200ms, border-color 200ms;
}

@media (hover: hover) {
  .range-link:hover {
    color: var(--ui-text);
    border-color: var(--ui-text-muted);
  }
}

.range-link--current {
  color: var(--ui-text);
  border-color: var(--ui-text);
}

.trending-board-layout {
  display: grid;
  min-inline-size: 0;
  gap: 2rem;
  margin-top: 1.5rem;
  align-items: start;
}

.trending-board-main {
  min-inline-size: 0;
}

.trending-board-cta {
  max-inline-size: 20rem;
}

@media (min-width: 64rem) {
  .trending-board-layout--with-cta {
    grid-template-areas: "board cta";
    grid-template-columns: minmax(0, 3fr) minmax(14rem, 1fr);
  }

  .trending-board-main {
    grid-area: board;
  }

  .trending-board-cta {
    position: sticky;
    top: 5.5rem;
    grid-area: cta;
    max-inline-size: none;
  }
}
</style>
