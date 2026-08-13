<script setup lang="ts">
import type { TrendingFeedResponse } from '~~/server/api/feed/trending.get'

// `await`, for the reason documented in [cluster].vue: without it the server
// renders before the request settles and ships an empty shell to the crawler.
const { data } = await useFetch<TrendingFeedResponse>('/api/feed/trending', {
  query: { limit: 24 },
})

const items = computed(() => data.value?.items ?? [])
const surging = computed(() => data.value?.surging ?? [])
const total = computed(() => items.value.length)
const authorTotal = computed(() =>
  items.value.reduce((sum, item) => sum + item.authorCount, 0),
)

const title = 'Trending Claude Skills This Week'
const description = computed(() =>
  `${total.value} skill repositories developers are posting about on X right now, ranked by how many separate people shared them. Every entry links to the post and to the SKILL.md in the author's own repo.`,
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  // Same guard as /skills/best and the category pages. A trending list is a
  // live feed, and a live feed can legitimately run dry; an eight-item page is
  // the thin, scaled-content shape that suppressed the catalog in June. Below
  // the bar it stays crawlable but out of the index.
  robots: () => (total.value >= 8 ? 'index,follow' : 'noindex,follow'),
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
</script>

<template>
  <div>
    <CompactPageHeader
      title="Trending this week"
      description="Skill repositories developers are posting about on X, ranked by how many separate people shared them rather than by how loud any one post was. Each entry shows the post it came from, so you can judge the claim yourself."
      heading-id="trending-heading"
    >
      <template #aside>
        <dl class="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
          <div>
            <dt class="data-label">
              Repositories
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ total }}
            </dd>
          </div>
          <div>
            <dt class="data-label">
              Mentions
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ authorTotal }}
            </dd>
          </div>
        </dl>
      </template>

      <div class="flex flex-wrap gap-3">
        <UButton
          to="/skills"
          label="Browse the directory"
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-left"
          class="min-h-11"
        />
        <UButton
          to="/skills/best"
          label="Skills worth installing"
          color="neutral"
          variant="ghost"
          class="min-h-11"
        />
      </div>
    </CompactPageHeader>

    <section
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="trending-list-heading"
    >
      <h2 id="trending-list-heading" class="sr-only">
        Trending repositories
      </h2>

      <p v-if="total === 0" class="text-sm text-muted">
        Nothing is trending yet. Skilld watches X for posts naming skill repositories and lists
        what more than one person shares. Browse the
        <NuxtLink to="/skills" class="underline underline-offset-4">
          directory
        </NuxtLink>
        in the meantime.
      </p>

      <ol v-else class="editorial-ledger list-none p-0">
        <li v-for="(item, index) in items" :key="`${item.owner}/${item.repo}`">
          <article class="trending-row">
            <span class="trending-rank">{{ String(index + 1).padStart(2, '0') }}</span>

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
      </ol>

      <!--
        Star growth is a separate signal from X chatter, so it gets its own
        block rather than being blended into the ranking above. A repo can
        climb hard on GitHub with nobody posting about it, and merging the two
        would hide which one actually fired.
      -->
      <aside v-if="surging.length" class="mt-12 border-t border-default pt-8" aria-labelledby="surging-heading">
        <h2 id="surging-heading" class="section-label">
          Also climbing on GitHub
        </h2>
        <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Tracked repositories whose star growth jumped well above their own usual pace in the
          last few days, whether or not anyone posted about them.
        </p>
        <ul class="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          <li v-for="repo in surging" :key="`${repo.owner}/${repo.repo}`">
            <NuxtLink
              :to="`/gh/${repo.owner}/${repo.repo}`"
              class="flex items-baseline justify-between gap-3 rounded-lg border border-default px-3 py-2 transition-colors hover:border-inverted"
            >
              <span class="min-w-0 truncate font-mono text-xs text-default">
                {{ repo.owner }}/{{ repo.repo }}
              </span>
              <span class="shrink-0 font-mono text-xs text-muted tabular-nums">
                +{{ repo.starsGained.toLocaleString() }} stars
              </span>
            </NuxtLink>
          </li>
        </ul>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.trending-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--ui-border);
}

.trending-rank {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
  padding-top: 0.25rem;
}

.trending-evidence {
  margin-top: 0.75rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--ui-border);
}
</style>
