<script setup lang="ts">
import type { TrendingFeedResponse, TrendingSkillFeedItem } from '~~/server/api/feed/trending.get'
import { relativeDay, trendingBasis } from '#shared/trending-basis'

/**
 * Rows the board shows at most.
 *
 * Thirty is enough to read as a leaderboard rather than a shortlist, and the
 * fallback tail fills it out when the evidenced rows run short. Applied twice
 * on purpose: as the request, so the server does not rank more than is wanted,
 * and as a slice, so the fallback tail cannot push the board past it.
 */
const BOARD_LIMIT = 30

// `await`, for the reason documented in [cluster].vue: without it the server
// renders before the request settles and ships an empty shell to the crawler.
const { data } = await useFetch<TrendingFeedResponse>('/api/feed/trending', {
  query: { limit: BOARD_LIMIT },
})

/**
 * The one clock every date on this page is measured against.
 *
 * Never the browser's. `Date.now()` produced a real hydration mismatch here:
 * the server rendered "4d ago" against its own clock and the client recomputed
 * against a different one, so Vue found the text changed under it. `computedAt`
 * travels with the payload and is identical on both sides. Zero means the fetch
 * failed, and a failed fetch has no board to date.
 */
const clock = computed(() => data.value?.computedAt ?? 0)

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
  (data.value?.namedSkills ?? []).filter(s => !missingAvatars.value.has(s.owner)),
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
  const shown = new Set(namedSkills.value.map(s => `${s.owner}/${s.repo}/${s.slug}`))
  return (data.value?.fallback ?? []).filter(s =>
    !shown.has(`${s.owner}/${s.repo}/${s.slug}`) && !missingAvatars.value.has(s.owner),
  )
})

interface BoardRow {
  key: string
  owner: string
  repo: string
  slug: string
  name: string
  description: string | null
  stars: number | null
  /** Why it is on the board. Null when only its star count speaks for it. */
  basis: string | null
  when: string | null
  evidenceUrl: string | null
  /** What the person actually said. The claim in their words, not ours. */
  quote: string | null
  /** Which network carried it, so the row can show that network's mark. */
  platform: 'x' | 'bsky' | null
  /** Who said it. */
  handle: string | null
  /** Likes on that specific post. Zero means it landed quietly, not that it is unknown. */
  engagement: number | null
  /** True when a person or a surge put it here, false when it is filling space. */
  evidenced: boolean
}

/**
 * One board, in one rank sequence.
 *
 * Evidenced rows always sit above star-only rows, never interleaved by score.
 * Ranking a 200,000-star repository against "two people named it" would let
 * raw popularity win the page every week, which is what `/skills/leaderboard`
 * is already for. Filling the tail with popular skills is honest; letting them
 * outrank the evidence is not.
 */
const board = computed<BoardRow[]>(() => [
  ...namedSkills.value.map(s => ({
    key: `${s.owner}/${s.repo}/${s.slug}`,
    owner: s.owner,
    repo: s.repo,
    slug: s.slug,
    name: s.canonicalName,
    description: s.description,
    stars: s.stars,
    basis: skillBasis(s),
    when: s.evidence ? relativeDay(s.evidence.postedAt, clock.value) : null,
    evidenceUrl: s.evidence?.url ?? null,
    quote: s.evidence?.text ?? null,
    platform: s.evidence?.platform ?? null,
    handle: s.evidence?.authorHandle ?? null,
    engagement: s.evidence?.favouriteCount ?? null,
    evidenced: true,
  })),
  ...fallback.value.map(s => ({
    key: `${s.owner}/${s.repo}/${s.slug}`,
    owner: s.owner,
    repo: s.repo,
    slug: s.slug,
    name: s.canonicalName,
    description: s.description,
    stars: s.stars,
    // Star growth where we measured it, which is the only "this week" claim a
    // fallback entry can make. Absent, the row falls back to the weaker claim
    // that put it here at all, rather than rendering an empty meta line that
    // makes a filler row look like an evidenced one that lost its evidence.
    basis: s.starsGained
      ? `+${s.starsGained.toLocaleString()} stars this week`
      : 'Popular on GitHub',
    when: null,
    evidenceUrl: null,
    quote: null,
    platform: null,
    handle: null,
    engagement: null,
    evidenced: false,
  })),
].slice(0, BOARD_LIMIT))

/**
 * Evidenced rows, which is also the count that decides indexability.
 *
 * Counted from what the board renders, never from `items`. The repositories
 * band left the page in this rework, so adding `items.length` here let a
 * collection the reader never sees decide whether the page was worth indexing.
 */
const skillTotal = computed(() => board.value.filter(row => row.evidenced).length)
const fillerTotal = computed(() => board.value.length - skillTotal.value)
const isEmpty = computed(() => board.value.length === 0)

/**
 * The week the board covers, stated rather than implied.
 *
 * "This week" alone leaves a reader unable to tell a fresh board from a stale
 * one, which is the difference between a periodical and a page that might not
 * have updated. The window matches `DEFAULT_WINDOW_HOURS` on the server.
 */
const weekRange = computed(() => {
  const end = new Date(clock.value * 1000)
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const day = (d: Date) => d.getUTCDate()
  const month = (d: Date) => d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`
})

function likesLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'like' : 'likes'}`
}

/**
 * Quiet emphasis for the head of the board.
 *
 * A leaderboard wants its top entries to read first. Type scale is not
 * available for that here: `design-guidelines.md` reserves large type for page
 * headings and lists "large font sizes in UI chrome" under Avoid. Contrast is,
 * so the top three ranks step up from muted to default and nothing moves.
 */
function rankClass(index: number): string {
  return index < 3 ? 'text-default' : 'text-muted'
}

/**
 * The page header, which has to hold at thirty rows as well as at eight.
 *
 * The board runs evidenced rows first and popular skills after, and the second
 * group is most of the page on a quiet week. A header claiming every row was
 * named is the same overclaim the "Named by developers" heading made, one level
 * up, so the filler is acknowledged whenever any is on the board.
 */
const headerDescription = computed(() =>
  fillerTotal.value
    ? 'Agent skills developers named this week, ranked by how many separate people named each one. Popular skills fill the rest of the board.'
    : 'Agent skills developers named this week, ranked by how many separate people named each one.',
)

const title = 'Trending Claude Skills This Week'
/**
 * Written from what the page actually holds.
 *
 * The previous version interpolated the repository count unconditionally, and
 * because that count is routinely zero the served description read "0 skill
 * repositories developers are posting about on X right now".
 */
const description = computed(() => {
  if (skillTotal.value) {
    return `${skillTotal.value} agent skills developers are talking about this week, each shown with the evidence behind it: the post that named it, or the star surge on a repo holding one skill.`
  }
  return 'Agent skills developers are talking about, ranked by how many separate people share them rather than by how loud any one post was.'
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  // Same guard as /skills/best and the category pages. A trending list is a
  // live feed, and a live feed can legitimately run dry; an eight-item page is
  // the thin, scaled-content shape that suppressed the catalog in June. Below
  // the bar it stays crawlable but out of the index.
  //
  // Named skills count towards the bar because each is verified content with
  // its own quoted evidence. The star fallback deliberately does not: it is
  // generic popularity available on any listing page, and letting filler earn
  // indexability is exactly how the catalog got suppressed.
  robots: () => (skillTotal.value >= 8 ? 'index,follow' : 'noindex,follow'),
})

useHead({
  link: [{ rel: 'canonical', href: 'https://skilld.dev/skills/trending' }],
})

defineOgImage('Page.takumi', {
  title: 'Trending agent skills',
  description: 'What developers are actually posting about this week.',
}, { alt: 'Trending agent skills on skilld' })

function skillBasis(skill: TrendingSkillFeedItem): string | null {
  return trendingBasis({
    authorCount: skill.authorCount,
    starGain: skill.starGain,
    starGainDay: skill.starGainDay,
    hasEvidence: skill.evidence !== null,
  }, clock.value)
}
</script>

<template>
  <div>
    <CompactPageHeader
      title="Trending this week"
      :description="headerDescription"
      heading-id="trending-heading"
    />

    <section
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="trending-list-heading"
    >
      <h2 id="trending-list-heading" class="sr-only">
        Trending agent skills
      </h2>
      <div v-if="isEmpty" class="editorial-state flex flex-col justify-center" role="status">
        <p class="text-sm text-default">
          Nothing is trending yet.
        </p>
        <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          Skilld watches X and Bluesky for posts naming a skill, and GitHub for repositories
          holding a single skill whose stars surge. Neither has anything to report this week.
        </p>
        <div class="mt-4">
          <UButton to="/skills" label="Browse the directory" color="neutral" variant="outline" class="min-h-11" />
        </div>
      </div>
      <div v-else>
        <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p class="section-label">
            Top skills
          </p>
          <p class="data-label">
            {{ board.length }} skills · {{ weekRange }}
          </p>
        </div>
        <ol class="editorial-ledger mt-6 list-none p-0">
          <li v-for="(row, index) in board" :key="row.key">
            <div class="ledger-row">
              <span class="ledger-rank" :class="rankClass(index)">{{ String(index + 1).padStart(2, '0') }}</span>
              <img
                :src="`https://github.com/${row.owner}.png?size=80`"
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
                    :to="repoSkillPath(row.owner, row.repo, row.slug)"
                    class="font-medium text-default transition-opacity hover:opacity-70"
                  >
                    {{ row.name }}
                  </NuxtLink>
                  <span class="font-mono text-xs text-muted">{{ row.owner }}/{{ row.repo }}</span>
                  <span v-if="row.stars" class="font-mono text-xs text-muted tabular-nums">
                    {{ `${row.stars.toLocaleString()} ★` }}
                  </span>
                </span>
                <span v-if="row.description" class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                  {{ row.description }}
                </span>
                <!--
                  Rendered alongside the quote, never instead of it. A `both`
                  row has to state its stars as well as its post, and a row
                  named by several people has to say so; the quote can only ever
                  show one of them.

                  Above the quote, so everything the row itself asserts sits
                  flush in one block and the one indented element is the thing
                  somebody else said.
                -->
                <span v-if="row.basis" class="data-label mt-2 block">
                  {{ row.basis }}
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
                    <span>@{{ row.handle }}</span>
                    <span v-if="row.when">{{ row.when }}</span>
                    <span v-if="row.engagement" class="tabular-nums">{{ likesLabel(row.engagement) }}</span>
                  </span>
                </a>
              </div>
            </div>
          </li>
        </ol>
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
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
  padding-top: 0.75rem;
}
</style>
