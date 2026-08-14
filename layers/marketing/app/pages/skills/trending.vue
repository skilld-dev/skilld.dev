<script setup lang="ts">
import type { TrendingFeedResponse, TrendingSkillFeedItem } from '~~/server/api/feed/trending.get'

// `await`, for the reason documented in [cluster].vue: without it the server
// renders before the request settles and ships an empty shell to the crawler.
const { data } = await useFetch<TrendingFeedResponse>('/api/feed/trending', {
  query: { limit: 24 },
})

const items = computed(() => data.value?.items ?? [])

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

/** Verified entries only. The star fallback is filler and must not count. */
const indexableCount = computed(() => items.value.length + namedSkills.value.length)
const total = computed(() => items.value.length)
const skillTotal = computed(() => namedSkills.value.length)
const isEmpty = computed(() =>
  !total.value && !skillTotal.value && !fallback.value.length,
)

/**
 * The week the board covers, stated rather than implied.
 *
 * "This week" alone leaves a reader unable to tell a fresh board from a stale
 * one, which is the difference between a periodical and a page that might not
 * have updated. The window matches `DEFAULT_WINDOW_HOURS` on the server.
 */
const weekRange = computed(() => {
  // Dated from `computedAt` alone, never the client clock: a `Date.now()`
  // fallback renders a different string on server and client and trips
  // hydration. When the fetch failed there is no board to date anyway.
  const end = new Date((data.value?.computedAt ?? 0) * 1000)
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const day = (d: Date) => d.getUTCDate()
  const month = (d: Date) => d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`
})

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

const title = 'Trending Claude Skills This Week'
/**
 * Written from what the page actually holds.
 *
 * The previous version interpolated the repository count unconditionally, and
 * because that count is routinely zero the served description read "0 skill
 * repositories developers are posting about on X right now".
 */
const description = computed(() => {
  if (skillTotal.value && total.value) {
    return `${skillTotal.value} agent skills and ${total.value} repositories developers are talking about this week, each shown with the evidence behind it: the post that named it, or the star surge on a repo holding one skill.`
  }
  if (skillTotal.value)
    return `${skillTotal.value} agent skills developers are talking about this week, each shown with the evidence behind it.`
  if (total.value)
    return `${total.value} skill repositories developers are posting about right now, ranked by how many separate people shared them.`
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
  robots: () => (indexableCount.value >= 8 ? 'index,follow' : 'noindex,follow'),
})

useHead({
  link: [{ rel: 'canonical', href: 'https://skilld.dev/skills/trending' }],
})

defineOgImage('Page.takumi', {
  title: 'Trending agent skills',
  description: 'What developers are actually posting about this week.',
}, { alt: 'Trending agent skills on skilld' })

function relativeDay(unixSeconds: number): string {
  const hours = Math.floor((Date.now() / 1000 - unixSeconds) / 3600)
  if (hours < 1)
    return 'just now'
  if (hours < 24)
    return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Trend strength in words, not a score. The raw number is a weighted composite
 * that means nothing to a reader, and printing it would invite people to
 * compare figures that are only meaningful relative to each other.
 */
function shareLabel(authorCount: number): string {
  if (authorCount === 1)
    return '1 person shared it'
  return `${authorCount} people shared it`
}

/**
 * Why this skill is on the page, in the terms that actually made the claim.
 *
 * THIS BELONGS ON THE ROW, NOT OVER THE LIST. A skill qualifies two ways and
 * they are different assertions: a person naming it in a post, or its
 * repository gaining stars while holding exactly one skill. A heading can only
 * state one of them, so the previous "Named by developers" heading was false
 * for every star-attributed entry, and production served four of those with
 * `authorCount: 0` under copy claiming people had named them.
 */
function skillBasis(skill: TrendingSkillFeedItem): string {
  // One person is named, not counted. "1 person named it" beside "@handle" is
  // the same fact twice, and the handle is the more useful half.
  const people = skill.authorCount === 1 && skill.evidence
    ? `@${skill.evidence.authorHandle}`
    : `${skill.authorCount} people`
  const stars = skill.starGain === null ? '' : `+${skill.starGain.toLocaleString()} stars`
  if (skill.attribution === 'github')
    return stars
  if (skill.attribution === 'both')
    return `${people} · ${stars}`
  return people
}

/**
 * When the claim was made.
 *
 * A social row dates from the post that named the skill. A star row dates from
 * the surge day. Returning null rather than a fallback keeps a row silent about
 * time it does not know, instead of implying it happened now.
 */
function skillWhen(skill: TrendingSkillFeedItem): string | null {
  if (skill.evidence)
    return relativeDay(skill.evidence.postedAt)
  if (skill.starGainDay !== null)
    return relativeDay(skill.starGainDay)
  return null
}
</script>

<template>
  <div>
    <CompactPageHeader
      title="Trending this week"
      description="Agent skills developers named this week, ranked by how many separate people named them."
      heading-id="trending-heading"
    >
      <!--
        No stat block and one route out. The counts it held are readable from
        the list itself, and a board is meant to be read rather than summarised
        above itself.
      -->
      <UButton
        to="/skills"
        label="Browse the directory"
        color="neutral"
        variant="outline"
        icon="i-lucide-arrow-left"
        class="min-h-11"
      />
    </CompactPageHeader>

    <section
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="trending-list-heading"
    >
      <h2 id="trending-list-heading" class="sr-only">
        Trending agent skills
      </h2>

      <!--
        Matches the empty state on /skills/leaderboard rather than the bare
        paragraph this page used, so a quiet week looks like a considered state
        instead of a page that failed to load.
      -->
      <div v-if="isEmpty" class="editorial-state flex flex-col justify-center p-6" role="status">
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

      <!--
        Skills lead the page. They are the unit a reader installs, and the two
        routes that can name one accurately are the whole point of the ranking.
        Repositories follow as the coarser signal.
      -->
      <div v-if="skillTotal">
        <!--
          No explainer paragraph. Every row already states its own basis, so
          prose describing the ranking only repeats what the list shows.
        -->
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p class="section-label">
            Top skills
          </p>
          <p class="font-mono text-xs text-muted tabular-nums">
            {{ weekRange }}
          </p>
        </div>
        <ol class="editorial-ledger mt-4 list-none p-0">
          <li v-for="(skill, index) in namedSkills" :key="`${skill.owner}/${skill.repo}/${skill.slug}`">
            <NuxtLink
              :to="`/skills/${skill.owner}/${skill.repo}/${skill.slug}`"
              class="ledger-row group"
            >
              <span class="ledger-rank" :class="rankClass(index)">{{ String(index + 1).padStart(2, '0') }}</span>
              <img
                :src="`https://github.com/${skill.owner}.png?size=80`"
                alt=""
                width="40"
                height="40"
                class="size-10 shrink-0 rounded-full border border-default bg-muted"
                loading="lazy"
                decoding="async"
                @error="onAvatarError(skill.owner)"
              >
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-baseline gap-x-2">
                  <span class="font-medium text-default">{{ skill.canonicalName }}</span>
                  <span class="font-mono text-xs text-muted">{{ skill.owner }}/{{ skill.repo }}</span>
                  <!--
                    Stars sit with the repository name, not in the metadata
                    row, because they qualify the source rather than the claim.
                    Authority context only: the ranking never reads them.
                  -->
                  <span v-if="skill.stars" class="font-mono text-xs text-muted tabular-nums">
                    {{ skill.stars.toLocaleString() }}★
                  </span>
                </span>
                <!--
                  No `block` alongside `line-clamp-2`. The clamp works by
                  setting `display: -webkit-box`, so `block` overrides it and
                  the clamp silently stops applying: two rows rendered ten
                  lines each and pushed everything below them off the screen.
                -->
                <span v-if="skill.evidence" class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                  {{ skill.evidence.text }}
                </span>
                <span class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
                  <span>{{ skillBasis(skill) }}</span>
                  <span v-if="skillWhen(skill)">{{ skillWhen(skill) }}</span>
                </span>
              </span>
            </NuxtLink>
          </li>
        </ol>
      </div>

      <div v-if="total" :class="skillTotal ? 'mt-12 border-t border-default pt-8' : ''">
        <p class="section-label">
          Repositories being shared
        </p>
        <!--
          Deliberately a `ul` with no rank column. One board means one rank
          sequence: this list previously restarted at 01, putting two entries
          numbered 01 on the same page and implying two competing rankings.
        -->
        <ul class="editorial-ledger mt-5 list-none p-0">
          <li v-for="item in items" :key="`${item.owner}/${item.repo}`">
            <article class="trending-row">
              <!--
              The owner avatar, matching /skills/best. Provenance is the whole
              pitch, so the person behind a repo should be visible at a glance
              rather than inferred from the slug.
            -->
              <img
                :src="`https://github.com/${item.owner}.png?size=80`"
                alt=""
                width="40"
                height="40"
                class="size-10 shrink-0 rounded-full border border-default bg-muted"
                loading="lazy"
                decoding="async"
              >

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <NuxtLink
                    :to="`/gh/${item.owner}/${item.repo}`"
                    class="font-medium text-default hover:opacity-70"
                  >
                    {{ item.owner }}/{{ item.repo }}
                  </NuxtLink>
                  <span class="font-mono text-xs text-muted tabular-nums">
                    {{ item.skillCount }} {{ item.skillCount === 1 ? 'skill' : 'skills' }}
                  </span>
                  <span v-if="item.stars" class="font-mono text-xs text-muted tabular-nums">
                    {{ item.stars.toLocaleString() }} stars
                  </span>
                </div>

                <p v-if="item.description" class="mt-1 text-sm leading-relaxed text-muted">
                  {{ item.description }}
                </p>

                <!--
                The quoted post is the page's reason to exist: it is the
                evidence for the ranking, and it is server-rendered text rather
                than an embed widget, so a crawler reads the same proof a
                person does.
              -->
                <blockquote v-if="item.evidence?.text" class="trending-evidence">
                  <!--
                  Clamped rather than cut server-side: the full quote stays in
                  the DOM for a crawler while no single entry can run down the
                  page. A live review had one thread render as ten lines and
                  bury everything below it.
                -->
                  <p class="line-clamp-3 text-sm leading-relaxed text-default">
                    {{ item.evidence.text }}
                  </p>
                  <footer class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <a
                      :href="item.evidence.url"
                      rel="nofollow noopener"
                      target="_blank"
                      class="font-mono hover:opacity-70"
                    >@{{ item.evidence.authorHandle }}</a>
                    <span>{{ relativeDay(item.evidence.postedAt) }}</span>
                    <span>{{ shareLabel(item.authorCount) }}</span>
                  </footer>
                </blockquote>

                <ul v-if="item.skills.length" class="mt-3 flex flex-wrap gap-2 p-0">
                  <li v-for="skill in item.skills" :key="skill.slug">
                    <NuxtLink
                      :to="`/skills/${skill.slug}`"
                      class="inline-flex rounded-lg border border-default px-2 py-1 font-mono text-xs text-muted transition-colors hover:border-inverted"
                    >
                      {{ skill.displayName }}
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </article>
          </li>
        </ul>
      </div>

      <!--
        Star-ranked filler, deduplicated against everything above. Labelled as a
        different claim: these are popular, not currently being talked about,
        and presenting the two identically would be dishonest.
      -->
      <aside
        v-if="fallback.length"
        :class="(total || skillTotal) ? 'mt-12 border-t border-default pt-8' : ''"
        aria-labelledby="fallback-heading"
      >
        <h2 id="fallback-heading" class="section-label">
          Popular on GitHub
        </h2>
        <p class="mt-1 text-sm text-muted">
          Not being talked about, just well starred.
        </p>
        <ul class="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          <li v-for="skill in fallback" :key="`${skill.owner}/${skill.repo}/${skill.slug}`">
            <NuxtLink
              :to="`/skills/${skill.owner}/${skill.repo}/${skill.slug}`"
              class="flex h-full flex-col rounded-lg border border-default p-4 transition-colors hover:border-inverted"
            >
              <span class="flex items-baseline justify-between gap-2">
                <span class="min-w-0 truncate font-medium text-default">{{ skill.canonicalName }}</span>
                <span class="shrink-0 font-mono text-xs text-muted tabular-nums">
                  {{ skill.stars.toLocaleString() }}★
                </span>
              </span>
              <!--
                The face belongs here too. Every skill on this page carries its
                owner's avatar, so a card without one reads as a different, less
                accountable kind of entry.
              -->
              <span class="mt-2 flex items-center gap-2">
                <img
                  :src="`https://github.com/${skill.owner}.png?size=48`"
                  alt=""
                  width="20"
                  height="20"
                  class="size-5 shrink-0 rounded-full border border-default bg-muted"
                  loading="lazy"
                  decoding="async"
                  @error="onAvatarError(skill.owner)"
                >
                <span class="min-w-0 truncate font-mono text-xs text-muted">{{ skill.owner }}/{{ skill.repo }}</span>
              </span>
              <span v-if="skill.description" class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                {{ skill.description }}
              </span>
              <span v-if="skill.repoSkillCount > 1" class="mt-2 font-mono text-xs text-muted">
                1 of {{ skill.repoSkillCount }} in this repo
              </span>
            </NuxtLink>
          </li>
        </ul>
      </aside>
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
.ledger-row,
.trending-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 0;
}

.ledger-row {
  transition: opacity 200ms ease;
}

/* Matches the whole-row link hover on /skills/best. */
@media (hover: hover) {
  .ledger-row:hover {
    opacity: 0.7;
  }
}

.ledger-rank,
.trending-rank {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
  padding-top: 0.75rem;
}

.trending-evidence {
  margin-top: 0.75rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--ui-border);
}
</style>
