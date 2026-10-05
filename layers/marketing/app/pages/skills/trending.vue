<script setup lang="ts">
import type { TrendingFeedResponse, TrendingPostFeedItem } from '~~/server/api/feed/trending.get'
import type { AdmittedSkillsResponse } from '#layers/registry/server/api/skills/admitted.get'
import type { SkillsLeaderboardResponse } from '#layers/registry/server/api/skills/leaderboard.get'
import type { TrendingBoardRow, TrendingPost } from '#shared/trending-range'
import { setResponseHeaders } from 'h3'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { relativeDay } from '#shared/trending-post'
import {
  isEvidenced,
  leaderboardBoardRows,
  MIN_INDEXABLE_ROWS,
  monthStamp,
  resolveTrendingPage,
  resolveTrendingRange,
  singleSkill,
  TRENDING_BOARD_LIMIT,
  TRENDING_RANGES,
  trendingRangeDescription,
  trendingRangeHeading,
  trendingRangeMeta,
  trendingRangeTitle,
} from '#shared/trending-range'
import TrendingBoardItem from '../../components/TrendingBoardItem.vue'
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
  = | { _tag: 'feed', feed: BoardFeed }
    | { _tag: 'all', leaderboard: SkillsLeaderboardResponse }

/**
 * The part of the feed this board reads. The feed also carries `items`, the
 * repository cards the homepage renders, and the payload used to ship every
 * one of them to a page that never shows one: half the board's weight.
 */
type BoardFeed = Pick<TrendingFeedResponse, 'namedSkills' | 'fallback' | 'computedAt'>

/**
 * The page of "earlier on this board" links. A real `?page=` query, so each
 * page of the list is a URL a crawler can follow.
 */
const listPage = computed(() => {
  const value = Number(Array.isArray(route.query.page) ? route.query.page[0] : route.query.page)
  return Number.isInteger(value) && value >= 1 ? value : 1
})

// `await`, for the reason documented in [cluster].vue: without it the server
// renders before the request settles and ships an empty shell to the crawler.
// Both at once: neither reads the other, and a cold render waited on each in
// turn.
const [
  { data, error, refresh },
  { data: admitted },
] = await Promise.all([
  useAsyncData<BoardSource>(
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
      const { namedSkills, fallback, computedAt } = await $fetch<TrendingFeedResponse>('/api/feed/trending', {
        query: { limit: BOARD_LIMIT, window: active.windowHours },
      })
      return { _tag: 'feed', feed: { namedSkills, fallback, computedAt } }
    },
    { watch: [range] },
  ),
  /**
   * Skills that first reached this range's board and have since left it.
   *
   * Rendered as plain links so a crawler can reach every Skill the sitemap
   * lists, not just the thirty on today's board. See `trending-admission.ts`.
   */
  useAsyncData<AdmittedSkillsResponse>(
    'skills-trending-admitted',
    () => $fetch<AdmittedSkillsResponse>('/api/skills/admitted', {
      query: { board: range.value, page: listPage.value },
    }),
    { watch: [range, listPage] },
  ),
])

// A failed board must not enter the edge cache, which would keep serving it.
if (import.meta.server && error.value) {
  const event = useRequestEvent()
  if (event)
    setResponseHeaders(event, { 'cloudflare-cdn-cache-control': 'no-store', 'cache-control': 'private, no-store' })
}

const feed = computed(() => (data.value?._tag === 'feed' ? data.value.feed : null))
const leaderboard = computed(() => (data.value?._tag === 'all' ? data.value.leaderboard : null))

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
        ...namedSkills.value.map((s): TrendingBoardRow => ({
          key: s.registryPath,
          owner: s.owner,
          title: s.canonicalName,
          to: s.registryPath,
          subtitle: `${s.owner}/${s.repo}`,
          description: s.description,
          stars: s.stars,
          // `?? []` covers an edge-cached feed from before these fields
          // existed, for the five minutes one can outlive a deploy.
          starSeries: s.starSeries ?? [],
          names: [s.name, s.canonicalName],
          // A post or a single-Skill surge put this exact Skill here, so the
          // run command never guesses.
          skill: { owner: s.owner, repo: s.repo, name: s.name },
          reason: s.evidence
            ? { _tag: 'posts', posts: [s.evidence, ...(s.morePosts ?? [])].map(toPost), mentionsByDay: s.mentionsByDay ?? null }
            : s.starGain !== null
              ? { _tag: 'surge', gain: s.starGain, when: s.starGainDay ? relativeDay(s.starGainDay, clock.value) : null }
              : { _tag: 'filler' },
        })),
        // Filler says so. A popular repository shown because the socials were
        // quiet must never pass for one that people posted about.
        ...fallback.value.map((s): TrendingBoardRow => ({
          key: s.registryPath,
          owner: s.owner,
          title: s.canonicalName,
          to: s.registryPath,
          subtitle: `${s.owner}/${s.repo}`,
          description: s.description,
          stars: s.stars,
          starSeries: s.starSeries ?? [],
          names: [s.name, s.canonicalName],
          skill: singleSkill(s.owner, s.repo, s.name, s.repoSkillCount ?? 0),
          reason: { _tag: 'filler' },
        })),
      ].slice(0, BOARD_LIMIT)

  return rows.filter(row => !missingAvatars.value.has(row.owner))
})

function toPost(post: TrendingPostFeedItem): TrendingPost {
  return {
    url: post.url,
    text: post.text,
    platform: post.platform,
    handle: post.authorHandle,
    // Optional until every cached feed response carries it.
    authorName: post.authorName ?? null,
    authorAvatar: post.authorAvatar,
    likes: post.favouriteCount,
    when: relativeDay(post.postedAt, clock.value),
  }
}

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
const evidencedTotal = computed(() => board.value.filter(isEvidenced).length)
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
  // No row count here. The feed board almost always holds its full thirty, and
  // a number that never changes tells a reader nothing; the ranks count.
  return rangeWindow.value
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
 * Rows above the weekly invitation on narrow screens.
 *
 * Wide screens carry the invitation in the sidebar. Narrow ones have no
 * sidebar, and above the board it pushed the first Skill below the fold, so
 * it waits until a reader has seen the head of the board.
 */
const HEAD_ROWS = 5

interface BoardChunk {
  /** One-based rank of the chunk's first row, for the `<ol start>`. */
  start: number
  rows: TrendingBoardRow[]
}

const boardChunks = computed<BoardChunk[]>(() => [
  { start: 1, rows: board.value.slice(0, HEAD_ROWS) },
  { start: HEAD_ROWS + 1, rows: board.value.slice(HEAD_ROWS) },
].filter(chunk => chunk.rows.length > 0))
</script>

<template>
  <!--
    The same shell as /skills: the heading lines up with the results column,
    a sticky sidebar sits left of the board, and nothing sits right of it, so
    the board takes every column the sidebar leaves.
  -->
  <div class="overflow-clip">
    <div class="w-full px-4 pb-10 pt-10 sm:px-6 lg:px-8 xl:px-10">
      <header aria-labelledby="trending-heading" class="mx-auto mb-7 max-w-7xl lg:ml-56 lg:mr-0">
        <h1 id="trending-heading" class="text-3xl font-semibold tracking-tight text-balance">
          {{ heading }}
        </h1>
        <p class="mt-2 text-sm text-muted">
          {{ headerDescription }}
        </p>
        <!-- Narrow screens have no sidebar, so the install sits under the heading. -->
        <div class="mt-5 lg:hidden">
          <div class="trending-teach">
            <p class="font-mono text-xs text-muted">
              Teach your agent skilld
            </p>
            <SkilldInstallChip surface="trending-header" />
          </div>
        </div>
      </header>

      <div class="trending-layout relative grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <div class="trending-sidebar">
          <!--
            Real links, not a JS toggle. Each range is its own indexable
            document with its own canonical, so a crawler has to be able to
            follow one. Rendered above every state so a reader who lands on an
            empty range can switch away from it. A column in the sidebar on
            wide screens, a compact row above the board on narrow ones.
          -->
          <h2 id="range-heading" class="range-heading">
            Time range
          </h2>
          <nav class="range-switcher" aria-labelledby="range-heading">
            <NuxtLink
              v-for="option in TRENDING_RANGES"
              :key="option.id"
              :to="option.path"
              class="range-link"
              :class="{ 'range-link--current': option.id === range }"
              :aria-current="option.id === range ? 'page' : undefined"
            >
              <span>{{ option.label }}</span>
              <span class="range-link__hint">{{ option.hint }}</span>
            </NuxtLink>
          </nav>

          <!--
            The server renders this page signed out for every visitor, so the
            invitation keeps its space but stays invisible until the browser
            knows who is looking; a weekly reader never sees it first.
            `invisible` already hides it from assistive tech and the tab order,
            so it carries no `aria-hidden`, which HTML validation rejects over
            a link.
          -->
          <div class="trending-sidebar__foot">
            <div
              v-if="showWeeklyCta"
              :class="{ invisible: auth._tag === 'pending' }"
            >
              <TrendingWeeklyCta variant="rail" />
            </div>
            <!-- The weekly button is the rail's one solid rose element, so the install inks its dot while it shows. -->
            <div class="trending-teach">
              <p class="font-mono text-xs text-muted">
                Teach your agent skilld
              </p>
              <SkilldInstallChip surface="trending-sidebar" :quiet="showWeeklyCta" />
            </div>
          </div>
        </div>

        <section class="min-w-0 lg:pt-6" aria-labelledby="trending-heading">
          <!-- No heading above the board: the h1 already names it. -->
          <p v-if="!isEmpty && !error && boardMeta" class="data-label mb-3 flex min-h-7 items-center">
            {{ boardMeta }}
          </p>

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
            <!-- Scattered dots that settle on one rose dot: the board is waiting for its first Skill. -->
            <div class="relative mb-4 h-10">
              <TextureConverge />
            </div>
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

          <template v-else>
            <template v-for="(chunk, chunkIndex) in boardChunks" :key="chunk.start">
              <div
                v-if="chunkIndex === 1 && showWeeklyCta"
                class="trending-cta--inline"
                :class="{ invisible: auth._tag === 'pending' }"
              >
                <TrendingWeeklyCta />
              </div>
              <ol class="board-list editorial-ledger list-none p-0" :start="chunk.start">
                <li v-for="(row, offset) in chunk.rows" :key="row.key">
                  <TrendingBoardItem
                    :row="row"
                    :rank="chunk.start + offset"
                    @avatar-error="onAvatarError"
                  />
                </li>
              </ol>
            </template>
          </template>

          <!--
            An index, not a second board. These Skills already left the
            ranking, so they sit smaller than it: one line of description, no
            rank. Every entry is still a plain link, which is the list's job: a
            crawler reaches each Skill the sitemap lists from here.
          -->
          <section
            v-if="earlierRows.length"
            class="mt-12 border-t border-default pt-10"
            aria-labelledby="earlier-heading"
          >
            <h2 id="earlier-heading" class="text-xl font-semibold tracking-tight">
              Earlier on this board
            </h2>
            <p class="data-label mt-1">
              {{ `${admitted?.total ?? earlierRows.length} skills` }}
            </p>
            <ul class="earlier-index mt-6 list-none p-0">
              <li v-for="item in earlierRows" :key="item.registryPath">
                <NuxtLink :to="item.registryPath" class="earlier-entry">
                  <span class="earlier-entry__name">
                    <img
                      :src="githubAvatarProxyUrl(item.owner, 32)"
                      alt=""
                      width="16"
                      height="16"
                      class="size-4 shrink-0 rounded-full bg-muted"
                      loading="lazy"
                      decoding="async"
                    >
                    <span class="truncate">{{ item.name }}</span>
                  </span>
                  <span class="earlier-entry__meta">
                    <span class="truncate">{{ item.owner }}/{{ item.repo }}</span>
                    <span v-if="item.stars" class="shrink-0 tabular-nums">{{ `${item.stars.toLocaleString()} ★` }}</span>
                  </span>
                  <span v-if="item.description" class="earlier-entry__description">{{ item.description }}</span>
                </NuxtLink>
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
                class="page-link"
                :class="{ 'page-link--current': number === listPage }"
                :aria-current="number === listPage ? 'page' : undefined"
              >
                {{ number }}
              </NuxtLink>
            </nav>
          </section>

          <!--
            The eligibility rule, carried over with the `all` range from
            /skills/leaderboard. The range claims its rows were reviewed, and a
            reader has no way to check that claim unless the page states the rule.
          -->
          <section
            v-if="range === 'all'"
            class="mt-12 grid gap-6 border-t border-default pt-10 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] md:gap-8"
            aria-labelledby="method-heading"
          >
            <h2 id="method-heading" class="text-2xl font-semibold tracking-tight sm:text-3xl">
              A deliberately narrow list.
            </h2>
            <div class="max-w-2xl space-y-4 text-base leading-relaxed text-muted">
              <p>
                A reviewer must confirm that the owner is an individual GitHub user and the repository primarily publishes reusable, generic agent skills. Documentation, assets, scripts, and tests are allowed.
              </p>
              <p>
                Organizations, vendor catalogs, app-specific collections, prompts, bookmarks, and general applications are excluded. Repositories rank by current GitHub stars.
              </p>
            </div>
          </section>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The full-bleed rule above the sidebar and the board, as on /skills. */
.trending-layout::before {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 50%;
  inline-size: 100vw;
  transform: translateX(-50%);
  border-block-start: 1px solid var(--ui-border);
  content: '';
  pointer-events: none;
}

.trending-sidebar {
  min-inline-size: 0;
  padding-top: 1.5rem;
}

/* Narrow screens show the range row alone; the heading names it for assistive tech. */
.range-heading {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/*
 * One control with three positions, rather than three buttons. Mono and
 * border-driven, like every other control on the site; the current range is
 * marked by a raised surface, so nothing moves and no accent is spent on
 * navigation.
 */
.range-switcher {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) + 0.25rem);
}

.range-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding-inline: 1rem;
  border-radius: var(--ui-radius);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  transition: color 200ms, background-color 200ms;
}

@media (hover: hover) {
  .range-link:hover {
    color: var(--ui-text);
  }
}

.range-link--current {
  background: var(--ui-bg-elevated);
  box-shadow: inset 0 0 0 1px var(--ui-border);
  color: var(--ui-text-highlighted);
}

.range-link__hint {
  display: none;
}

.trending-sidebar__foot {
  display: none;
}

.trending-teach {
  display: grid;
  gap: 0.5rem;
  min-inline-size: 0;
}

.trending-cta--inline {
  margin-block: 1.5rem;
}

/*
 * Wide screens: the sidebar column from /skills, sticky under the site header.
 * The ranges become a list with the window each covers, and the invitation
 * and the install sit under them, where the board's right edge used to be
 * spent on them.
 */
@media (min-width: 64rem) {
  .trending-sidebar {
    position: sticky;
    inset-block-start: 4rem;
    display: flex;
    flex-direction: column;
    block-size: calc(100dvh - 4rem);
    overflow-y: auto;
    padding-block-end: 1.5rem;
    padding-inline-end: 1.5rem;
    border-inline-end: 1px solid var(--ui-border);
  }

  .range-heading {
    position: static;
    display: flex;
    align-items: center;
    inline-size: auto;
    block-size: auto;
    min-block-size: 1.75rem;
    margin-block-end: 0.5rem;
    overflow: visible;
    clip-path: none;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: var(--ui-text);
  }

  .range-switcher {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0;
    border: 0;
    border-radius: 0;
  }

  /* Set like the maintainer rows in the /skills sidebar: the name, then a mono line. */
  .range-link {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.375rem 0.5rem;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--ui-text-toned);
  }

  .range-link--current {
    box-shadow: none;
  }

  @media (hover: hover) {
    .range-link:hover {
      background: var(--ui-bg-elevated);
    }
  }

  .range-link__hint {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 400;
    line-height: 1rem;
    color: var(--ui-text-muted);
  }

  .trending-sidebar__foot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    margin-block-start: 2rem;
  }

  .trending-cta--inline {
    display: none;
  }
}

/*
 * Columns of hairline-divided entries rather than cards: more than six items
 * read better as rows, and these are an index under the board, not picks.
 */
.earlier-index {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  column-gap: 2rem;
  margin: 0;
}

.earlier-index > li {
  min-inline-size: 0;
  border-top: 1px solid var(--ui-border);
}

.earlier-entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-block-size: 2.75rem;
  padding-block: 0.75rem;
}

.earlier-entry__name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
  font-weight: 500;
  color: var(--ui-text-highlighted);
  transition: opacity 200ms;
}

@media (hover: hover) {
  .earlier-entry:hover .earlier-entry__name {
    opacity: 0.7;
  }
}

.earlier-entry__meta {
  display: flex;
  gap: 0.625rem;
  min-inline-size: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.earlier-entry__description {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ui-text-muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}

.page-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding-inline: 0.875rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  transition: color 200ms, border-color 200ms;
}

@media (hover: hover) {
  .page-link:hover {
    color: var(--ui-text);
    border-color: var(--ui-text-muted);
  }
}

.page-link--current {
  color: var(--ui-text);
  border-color: var(--ui-text);
}

.board-list {
  margin: 0;
}

/*
 * The two halves of one board. Where nothing shows between them, the second
 * drops its top rule rather than doubling the first one's bottom: always when
 * no invitation renders, and on wide screens, where it moves to the sidebar.
 */
.board-list + .board-list {
  border-top: 0;
}

@media (min-width: 64rem) {
  .board-list ~ .board-list {
    border-top: 0;
  }
}
</style>
