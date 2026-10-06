<script setup lang="ts">
import type { RecentPublishesResponse } from '~~/server/api/feed/recent-publishes.get'
import type { RecentUpdateCard, RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'
import type { TrendingFeedResponse } from '~~/server/api/feed/trending.get'
import { WRITING_COMPARISON_LINK } from '#shared/comparison-navigation'
import { avatarProxyUrl, githubAvatarProxyUrl } from '#shared/image-proxy'
import OutcomeClusterGrid from '../components/OutcomeClusterGrid.vue'

const title = 'Agent skills for you and your agent · skilld'
const description = 'Try any agent skill before you install it, and let your agent search for its own. Open-source CLI, no telemetry. A skills.sh alternative.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

useHead({
  titleTemplate: null,
  templateParams: { separator: '·' },
})

// The card repeats the hero: the H1 and the caption from COPY.md, with the
// H1 broken where the page breaks it.
defineOgImage('Page.takumi', {
  title: 'Agent skills for you\nand your agent',
  description: 'Try any skill before you install it. Your agent can search for its own.',
}, { alt: 'skilld, agent skills for you and your agent' })

const serverTimingHeader = useResponseHeader('Server-Timing')
const homeDataStartedAt = performance.now()
const homeDataTimings: string[] = []

function withHomeDataTiming<T>(name: string, request: Promise<T>): Promise<T> {
  if (import.meta.client)
    return request

  const startedAt = performance.now()
  return request.finally(() => {
    homeDataTimings.push(`${name};dur=${(performance.now() - startedAt).toFixed(1)}`)
  })
}

const [
  {
    data: updatesData,
    status: updatesStatus,
    error: updatesError,
    refresh: refreshUpdates,
  },
  {
    data: publishesData,
    status: publishesStatus,
    error: publishesError,
    refresh: refreshPublishes,
  },
  {
    data: trendingData,
    status: trendingStatus,
  },
] = await Promise.all([
  withHomeDataTiming('home-updates', useFetch<RecentUpdatesResponse>('/api/feed/recent-updates', {
    key: 'home-recent-updates-v2',
  })),
  withHomeDataTiming('home-publishes', useFetch<RecentPublishesResponse>('/api/feed/recent-publishes', {
    key: 'home-recent-publishes-v2',
  })),
  // Server-rendered rather than lazy: the section is one of the few places on
  // the homepage whose content changes hourly, and the endpoint is cached at
  // the edge for 5 minutes, so it costs a cache read rather than a query.
  withHomeDataTiming('home-trending', useFetch<TrendingFeedResponse>('/api/feed/trending', {
    key: 'home-trending-v2',
    // The hero texture prints Skill names from every repo it gets, so it asks
    // for more repos than the six-card section below it.
    query: { limit: 24 },
    // Repositories only. The named Skills, with their posts and star series,
    // serve `/skills/trending` and would ride in this page's payload unread.
    pick: ['items'],
  })),
])

if (import.meta.server) {
  homeDataTimings.push(`home-data;dur=${(performance.now() - homeDataStartedAt).toFixed(1)}`)
  serverTimingHeader.value = homeDataTimings.join(', ')
}

const recentUpdates = computed(() => updatesData.value?.items ?? [])
const recentPublishes = computed(() => publishesData.value?.items ?? [])

const trendingRepos = computed(() => trendingData.value?.items ?? [])
/** The section below the fold stays a six-card grid whatever the texture uses. */
const trendingSectionRepos = computed(() => trendingRepos.value.slice(0, 6))

/**
 * The section is hidden entirely below this many entries. A trending strip
 * showing one repo reads as a broken feature, and an empty-state box on the
 * homepage costs more attention than it returns.
 */
const MIN_TRENDING_TO_SHOW = 3
const showTrending = computed(() => trendingRepos.value.length >= MIN_TRENDING_TO_SHOW)

function trendingShareLabel(authorCount: number): string {
  return authorCount === 1 ? '1 dev shared it' : `${authorCount} devs shared it`
}

/** Real Skill names from this week's trending repositories, for the hero texture. */
const heroTextureNames = computed(() =>
  trendingRepos.value.flatMap(repo => repo.skills.map(skill => `${repo.owner}/${repo.repo}/${skill.name}`)),
)

/**
 * The CLI's own line, "Search, run, install, and keep them current", as doors
 * into the sections of the /cli page.
 */
const heroVerbs = [
  { label: 'search', to: '/cli#search' },
  { label: 'run', to: '/cli#run' },
  { label: 'install', to: '/cli#install' },
  { label: 'keep current', to: '/cli#update' },
] as const

/**
 * Track order, measured 2026-09-04 rather than assumed.
 *
 * `/api/clusters` sorts by how many Skills a track holds, which is supply.
 * This is demand: the 50 named Skills trending over a week, the 50 over a
 * month and the top 50 repositories by stars, each Skill read and placed in a
 * track by hand, then scored with a 1/log2(rank) decay and weighted
 * week 1.0, month 0.8, all-time 0.6.
 *
 * The measurement changed the taxonomy rather than only its order:
 * `diagrams` was added and `research` was un-retired, both on these numbers.
 * See the header of clusters.ts.
 *
 * Re-measure before trusting this order past October. The percentages
 * below are each track's share of the weighted demand.
 */
const TRACK_DEMAND_ORDER = [
  'design', // 16.5%
  'context-engineering', // 15.1%
  'anti-slop', // 13.4%
  'diagrams', // 10.8%, the track this measurement added
  'planning', // 9.8%, nearly all of it from all-time stars
  'anti-slop-coding', // 6.7%
  'research', // 6.5%, the track this measurement brought back
  // 1.6% for backend and data, plus the 4.7% that `security` measured before
  // it merged into this track on the same day (#134).
  'backend-data', // 6.3%
  'code-review', // 3.0%
  'devops', // 2.9%
  'testing', // 2.2%
  'performance', // 0.9%
  // Below the twelve-tile cut. Both keep their page.
  'coding', // 0.2%
  'seo', // no trending evidence at all
] as const

const authoringEcosystems = [
  { id: 'npm', label: 'npm', icon: 'i-simple-icons-npm' },
  { id: 'pypi', label: 'PyPI', icon: 'i-simple-icons-pypi' },
  { id: 'rust', label: 'crates.io', icon: 'i-simple-icons-rust' },
  { id: 'go', label: 'Go', icon: 'i-simple-icons-go' },
  { id: 'rubygems', label: 'RubyGems', icon: 'i-simple-icons-rubygems' },
] as const

const renderNow = useState('render:now', () => Number(new Date()))

function formatRelative(ts: number): string {
  const diff = renderNow.value - ts * 1000
  const days = Math.floor(diff / 86_400_000)
  if (days < 1)
    return 'today'
  if (days < 2)
    return 'yesterday'
  if (days < 30)
    return `${days}d ago`
  if (days < 365)
    return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function recentUpdateKey(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? `repo:${item.owner}/${item.repo}`
    : `skill:${item.owner}/${item.repo}/${item.name}`
}

type RecentRepoUpdate = Extract<RecentUpdateCard, { kind: 'repo' }>

/** What changed across a Repository: its commit summary, or the Skills it touched. */
function recentRepoDescription(item: RecentRepoUpdate): string {
  if (item.changeSummary)
    return item.changeSummary

  const names = item.skills.slice(0, 3).map(skill => `/${skill.name}`).join(' · ')
  return item.skillCount > 3 ? `${names} · +${item.skillCount - 3} more` : names
}
</script>

<template>
  <div class="home-page overflow-clip">
    <section class="home-hero" aria-labelledby="hero-heading">
      <!-- The signature, at low strength. Stone only: the H1 full stop is the
           band's one rose dot, so the texture's pick draws in stone. The mask
           keeps a clear column behind the copy. -->
      <div class="home-hero__texture" aria-hidden="true">
        <TextureBrailleNames :names="heroTextureNames" />
      </div>

      <div class="home-hero__content mx-auto max-w-4xl px-4 text-center sm:px-6">
        <!-- The rose dot is the full stop. Screen readers get a typed one. -->
        <h1 id="hero-heading" class="home-hero-title font-semibold tracking-[-0.045em] text-highlighted text-balance">
          Agent skills for you<br class="hidden sm:inline">
          and your agent<span class="sr-only">.</span><span class="home-hero-dot" aria-hidden="true" />
        </h1>
        <!-- The product map: the CLI's own four verbs, each a door into /cli,
             then the one quiet link to the whole CLI page. -->
        <nav class="home-hero__verbs mt-5 font-mono text-sm" aria-label="What skilld does">
          <ul class="home-hero__verb-list list-none p-0">
            <li v-for="verb in heroVerbs" :key="verb.to">
              <NuxtLink :to="verb.to" class="home-hero__verb">
                {{ verb.label }}
              </NuxtLink>
            </li>
          </ul>
          <span class="home-hero__verbs-rule" aria-hidden="true" />
          <NuxtLink to="/cli" class="home-hero__cli">
            The skilld CLI<UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
          </NuxtLink>
        </nav>
        <!-- What sets skilld apart, so the caption assumes the reader knows
             what a Skill is. Run comes before install, and the skilld Skill
             behind the promo below lets the agent search on its own. -->
        <p class="home-hero__caption mx-auto mt-3 text-base leading-relaxed text-muted text-balance">
          Try any skill before you install it. Your agent can search for its own.
        </p>

        <HomeSearch class="mx-auto mt-8 max-w-xl text-left" />

        <ul class="home-hero__claims home-hero-claims data-label mx-auto mt-5 list-none p-0" aria-label="About skilld">
          <li>
            <a href="https://github.com/skilld-dev/skilld" target="_blank" rel="noopener">Open-source CLI, no telemetry</a>
          </li>
          <li>Analytics without cookies or IPs</li>
          <li>
            <NuxtLink to="/vs/skills-sh">
              A skills.sh alternative
            </NuxtLink>
          </li>
          <li>
            <UPopover :content="{ side: 'bottom', align: 'center', sideOffset: 8 }">
              <button type="button" class="home-hero__promo">
                Teach your agent skilld
                <UIcon name="i-lucide-chevron-down" class="size-3 shrink-0" aria-hidden="true" />
              </button>
              <template #content>
                <div class="p-2">
                  <SkilldInstallChip surface="home-hero-promo" />
                </div>
              </template>
            </UPopover>
          </li>
        </ul>
      </div>
    </section>

    <HomeLifecycle />

    <section
      v-if="showTrending || trendingStatus === 'pending'"
      id="trending"
      class="home-wm"
      aria-labelledby="trending-heading"
    >
      <span class="home-watermark" aria-hidden="true">Week</span>
      <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <header>
          <h2 id="trending-heading" class="home-h2 text-balance">
            <span class="home-ink">Trending skills</span> this week.
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
            We watch what skills devs are talking about and then rank them for you so you can go out and touch some grass.
          </p>
        </header>

        <div v-if="trendingStatus === 'pending'" class="relative mt-8 h-10">
          <TextureConverge loading label="Loading trending skills" />
        </div>

        <template v-else>
          <ol class="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
            <li v-for="repo in trendingSectionRepos" :key="`${repo.owner}/${repo.repo}`" class="min-w-0">
              <article class="home-trending-card">
                <div class="flex min-w-0 items-center gap-2">
                  <img
                    :src="githubAvatarProxyUrl(repo.owner, 64)"
                    alt=""
                    width="24"
                    height="24"
                    class="size-6 shrink-0 rounded-full border border-default bg-muted"
                    loading="lazy"
                    decoding="async"
                  >
                  <NuxtLink
                    :to="repoHubPath(repo.owner, repo.repo)"
                    class="home-trending-card__link min-w-0 flex-1 truncate font-medium text-default"
                  >
                    {{ repo.owner }}/{{ repo.repo }}
                  </NuxtLink>
                  <span class="shrink-0 font-mono text-xs text-muted tabular-nums">
                    {{ repo.skillCount }} {{ repo.skillCount === 1 ? 'skill' : 'skills' }}
                  </span>
                </div>
                <p v-if="repo.evidence" class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                  {{ repo.evidence.text }}
                </p>
                <p class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted">
                  <span>{{ trendingShareLabel(repo.authorCount) }}</span>
                  <span v-if="repo.evidence" class="font-mono">@{{ repo.evidence.authorHandle }}</span>
                  <a
                    v-if="repo.evidence"
                    :href="repo.evidence.url"
                    target="_blank"
                    rel="noopener"
                    class="home-trending-card__action inline-flex min-h-6 items-center gap-1 font-mono underline underline-offset-4 hover:text-default"
                  >
                    Source
                    <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </p>
              </article>
            </li>
          </ol>
          <UButton
            to="/skills/trending"
            label="All trending skills"
            color="neutral"
            variant="ghost"
            size="sm"
            trailing-icon="i-lucide-arrow-right"
            class="mt-4 min-h-11"
          />
        </template>
      </div>
    </section>

    <section
      id="outcomes"
      class="home-wm editorial-band home-outcomes-band"
      aria-labelledby="outcomes-heading"
    >
      <span class="home-watermark" aria-hidden="true">Work</span>
      <div class="editorial-band__content mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-outcomes-intro">
          <h2 id="outcomes-heading" class="home-h2 max-w-[16ch] text-balance">
            Skills for <span class="home-ink">your work</span>.
          </h2>
          <p id="outcomes-description" class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
            Skills grouped by the job in front of you. The tracks devs talk about most come first.
          </p>
        </div>
        <OutcomeClusterGrid class="mt-8 md:mt-10" aria-describedby="outcomes-description" :limit="12" :rows="3" :order="TRACK_DEMAND_ORDER" />
        <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <UButton
            to="/skills"
            label="All tracks"
            color="neutral"
            variant="ghost"
            size="sm"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11"
          />
          <NuxtLink
            :to="WRITING_COMPARISON_LINK.to"
            class="inline-flex min-h-11 items-center text-sm text-default underline underline-offset-4 hover:text-primary"
          >
            {{ WRITING_COMPARISON_LINK.label }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <section
      id="freshness"
      class="home-wm editorial-band home-freshness-band"
      aria-labelledby="freshness-heading"
    >
      <span class="home-watermark" aria-hidden="true">Watch</span>
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content home-freshness-shell mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <header class="home-freshness-header">
          <div class="min-w-0">
            <h2 id="freshness-heading" class="home-h2 text-balance">
              Keep up with <span class="home-ink">skill changes</span>.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Watch a repo. Each month the digest lists what changed. If nothing changed, we send nothing.
            </p>
            <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <UButton
                to="/me"
                label="Watch your starred repos"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
              <a
                href="/digest/preview"
                class="inline-flex min-h-11 items-center gap-1 text-sm text-default underline underline-offset-4 hover:text-primary"
              >
                See an example digest
                <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0" aria-hidden="true" />
              </a>
            </div>
            <p class="data-label mt-3">
              To watch a repo, sign in with GitHub. Off in one click.
            </p>
          </div>
          <WeeklyEmailPreview />
        </header>

        <div class="home-freshness-grid">
          <section class="home-freshness-primary" aria-labelledby="recent-updates-heading">
            <div class="home-freshness-feed-heading">
              <div class="min-w-0">
                <h3 id="recent-updates-heading" class="home-freshness-primary-title font-semibold tracking-tight">
                  Recently updated
                </h3>
                <p class="data-label mt-2">
                  Source files changed
                </p>
              </div>
              <UButton
                to="/skills"
                label="Browse all skills"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
            </div>

            <div v-if="updatesStatus === 'pending'" class="home-freshness-ledger home-freshness-skeleton-list" aria-busy="true">
              <div v-for="i in 5" :key="i" class="home-freshness-skeleton-row">
                <USkeleton class="size-9 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <USkeleton class="h-4 w-2/3" />
                  <USkeleton class="mt-2 h-3 w-1/2" />
                </div>
              </div>
            </div>
            <div v-else-if="updatesError" class="home-freshness-state home-freshness-state--primary" role="alert">
              <div>
                <p class="font-medium">
                  Could not load recent updates.
                </p>
                <p class="mt-1 text-base leading-relaxed text-muted">
                  If the updates did not load, check your connection.
                </p>
                <UButton
                  label="Try updates again"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="mt-4 min-h-11"
                  @click="() => refreshUpdates()"
                />
              </div>
            </div>
            <ul v-else-if="recentUpdates.length" class="home-freshness-ledger list-none p-0">
              <li v-for="item in recentUpdates.slice(0, 5)" :key="recentUpdateKey(item)">
                <SkillCard
                  v-if="item.kind === 'skill'"
                  :skill="{ owner: item.owner, repo: item.repo, name: item.name, registryPath: item.registryPath, description: item.description, modifiedAt: item.occurredAt }"
                  layout="compact"
                  metric="updated"
                  :note="item.changeSummary"
                  :description="!item.changeSummary"
                  surface="home-recent-updates"
                />
                <!-- A whole Repository changed, not one Skill, so it gets its own line, drawn like the compact card beside it. -->
                <NuxtLink
                  v-else
                  :to="repoHubPath(item.owner, item.repo)"
                  class="home-repo-row"
                >
                  <img
                    :src="avatarProxyUrl(item.avatarUrl)"
                    alt=""
                    width="28"
                    height="28"
                    class="home-repo-row__avatar"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0 flex-1">
                    <span class="home-repo-row__name">{{ item.owner }}/{{ item.repo }}</span>
                    <span class="home-repo-row__by">
                      <span>{{ `${item.skillCount} ${item.skillCount === 1 ? 'skill' : 'skills'} changed` }}</span>
                      <NuxtTime :datetime="item.occurredAt * 1000" locale="en" relative numeric="auto" relative-style="short" class="font-mono" />
                    </span>
                    <span class="home-repo-row__note">{{ recentRepoDescription(item) }}</span>
                  </span>
                </NuxtLink>
              </li>
            </ul>
            <div v-else class="home-freshness-state home-freshness-state--primary" role="status">
              <div>
                <p class="font-medium">
                  No source changes yet.
                </p>
                <p class="mt-1 max-w-md text-base leading-relaxed text-muted">
                  Check back after the next release.
                </p>
                <UButton to="/skills" label="Browse all skills" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
              </div>
            </div>
          </section>

          <section class="home-freshness-secondary" aria-labelledby="recent-publishes-heading">
            <div class="home-freshness-feed-heading">
              <div class="min-w-0">
                <h3 id="recent-publishes-heading" class="home-freshness-secondary-title font-semibold tracking-tight">
                  New to skilld
                </h3>
                <p class="data-label mt-2 flex items-center gap-1.5">
                  <UIcon name="i-lucide-badge-check" class="size-3.5 shrink-0" aria-hidden="true" />
                  From official owners
                </p>
              </div>
            </div>

            <div v-if="publishesStatus === 'pending'" class="home-freshness-ledger home-freshness-skeleton-list home-freshness-skeleton-list--secondary" aria-busy="true">
              <div v-for="i in 5" :key="i" class="home-freshness-skeleton-row home-freshness-skeleton-row--secondary">
                <USkeleton class="size-8 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <USkeleton class="h-4 w-2/3" />
                  <USkeleton class="mt-2 h-3 w-1/2" />
                </div>
              </div>
            </div>
            <div v-else-if="publishesError" class="home-freshness-state home-freshness-state--secondary" role="alert">
              <p class="font-medium">
                Could not load new skills.
              </p>
              <p class="mt-1 text-base leading-relaxed text-muted">
                If the new skills did not load, check your connection.
              </p>
              <UButton
                label="Try new skills again"
                color="neutral"
                variant="outline"
                size="sm"
                class="mt-4 min-h-11"
                @click="() => refreshPublishes()"
              />
            </div>
            <ul v-else-if="recentPublishes.length" class="home-freshness-ledger home-freshness-ledger--secondary list-none p-0">
              <li v-for="item in recentPublishes.slice(0, 5)" :key="`${item.owner}/${item.repo}/${item.name}`">
                <SkillCard
                  :skill="item"
                  layout="compact"
                  metric="none"
                  surface="home-recent-publishes"
                >
                  <template #meta>
                    {{ formatRelative(item.occurredAt) }}
                  </template>
                </SkillCard>
              </li>
            </ul>
            <div v-else class="home-freshness-state home-freshness-state--secondary" role="status">
              <p class="font-medium">
                No official skills added yet.
              </p>
              <p class="mt-1 text-base leading-relaxed text-muted">
                You can still browse the skills already listed.
              </p>
              <UButton to="/skills" label="Browse all skills" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
            </div>
          </section>
        </div>
      </div>
    </section>

    <section
      id="publish"
      class="home-wm"
      aria-labelledby="publish-heading"
    >
      <span class="home-watermark" aria-hidden="true">Make</span>
      <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <!-- Many Skills in, one out: the divider into making your own. -->
        <div class="relative mb-10 h-10">
          <TextureConverge />
        </div>
        <div class="home-make-strip">
          <div class="min-w-0">
            <h2 id="publish-heading" class="home-h2 text-balance">
              <span class="home-ink">Write a skill</span> for your project.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Pick a package you publish or a project you maintain. Get the steps to draft a skill, review it, and ship it from your repo.
            </p>
            <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              Start with a
              <NuxtLink to="/learn/create-agent-skills" class="text-default underline">
                complete portable Skill example
              </NuxtLink>.
            </p>
            <ul class="home-eco-logos mt-5 list-none p-0" aria-label="Package ecosystems">
              <li
                v-for="ecosystem in authoringEcosystems"
                :key="ecosystem.id"
                class="home-eco-logo"
              >
                <UIcon :name="ecosystem.icon" class="size-4 shrink-0" aria-hidden="true" />
                <span>{{ ecosystem.label }}</span>
              </li>
            </ul>
          </div>
          <div class="home-make-strip-actions">
            <UButton
              to="/make-skill"
              label="Make a skill"
              trailing-icon="i-lucide-arrow-right"
              class="min-h-11 justify-center hover:bg-primary-600 active:bg-primary-700"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*
 * A compact SkillCard fills its ledger line, inset like the Repository rows
 * beside it. Scoped here, because a global rule loses to the card's own
 * scoped styles and the card would bleed past the ledger's edges.
 */
.home-freshness-ledger :deep(.skill-card--compact) {
  margin-inline: 0;
  border-radius: 0;
  padding: 0.875rem 0.75rem;
}

/* A Repository line in the same feed, on the compact card's measures. */
.home-repo-row {
  display: flex;
  min-inline-size: 0;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.875rem 0.75rem;
  transition: background-color 200ms ease-out;
}

.home-repo-row:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: -2px;
}

@media (hover: hover) {
  .home-repo-row:hover {
    background: var(--ui-bg-elevated);
  }
}

.home-repo-row__avatar {
  flex: none;
  inline-size: 1.75rem;
  block-size: 1.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--ui-bg-muted);
}

.home-repo-row__name {
  display: block;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.25rem;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}

.home-repo-row__by {
  display: flex;
  min-inline-size: 0;
  gap: 0.375rem;
  margin-block-start: 0.0625rem;
  font-size: 0.75rem;
  line-height: 1.125rem;
  white-space: nowrap;
  color: var(--ui-text-muted);
}

.home-repo-row__note {
  display: -webkit-box;
  margin-block-start: 0.375rem;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--ui-text);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

@media (prefers-reduced-motion: reduce) {
  .home-repo-row {
    transition: none;
  }
}

/* Above the lifecycle band, so the search panel overlays it instead of sliding under. */
.home-hero {
  position: relative;
  z-index: 10;
  isolation: isolate;
}

.home-hero__content {
  position: relative;
  z-index: 1;
  padding-top: 2.5rem;
  /* Phones and tablets: the names run in a strip under the copy. */
  padding-bottom: 7rem;
}

/* Phones and tablets: a strip under the copy, clear of every line of text. */
.home-hero__texture {
  --brand-dot: var(--ui-text-muted);
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 0;
  height: 6.5rem;
  pointer-events: none;
  opacity: 0.6;
  mask-image: linear-gradient(to bottom, transparent, #000 35%, #000 70%, transparent);
}

/* Desktop: full width behind the band, with a clear column behind the copy
   and soft top and bottom edges. */
@media (min-width: 64rem) {
  .home-hero__content {
    padding-top: 4.25rem;
    padding-bottom: 3.5rem;
  }

  .home-hero__texture {
    top: 0;
    height: auto;
    opacity: 0.55;
    mask-image:
      linear-gradient(
        to right,
        #000 0,
        #000 calc(50% - 32rem),
        transparent calc(50% - 22rem),
        transparent calc(50% + 22rem),
        #000 calc(50% + 32rem),
        #000 100%
      ),
      linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
    mask-composite: intersect;
  }
}

/* The verb line: four ink verbs on stone dots, a hairline, then the CLI door. */
.home-hero__verbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.25rem 1rem;
}

.home-hero__verb-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

.home-hero__verb-list > li + li::before {
  content: '·';
  padding-inline: 0.55em;
  color: var(--ui-text-dimmed);
}

/* Inline-block drops the space the template formatter leaves inside a link,
   so the underline starts on the first letter. */
.home-hero__verb,
.home-hero__claims a {
  display: inline-block;
}

.home-hero__verb,
.home-hero__cli {
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: transparent;
  text-underline-offset: 0.25em;
  transition: text-decoration-color 200ms ease-out, color 200ms ease-out;
}

.home-hero__verb:hover,
.home-hero__cli:hover {
  text-decoration-color: currentColor;
}

.home-hero__cli {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--ui-text-muted);
}

.home-hero__cli:hover {
  color: var(--ui-text);
}

.home-hero__verbs-rule {
  display: none;
  width: 1px;
  height: 0.9rem;
  background: var(--ui-border-accented);
}

@media (min-width: 40rem) {
  .home-hero__verbs-rule {
    display: block;
  }
}

.home-hero__caption {
  max-width: 34rem;
}

@media (min-width: 64rem) {
  .home-hero__caption {
    max-width: 42rem;
  }
}

/* One mono line. Phones and tablets wrap it without separators, so no line starts on a dot. */
.home-hero__claims {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.25rem 1rem;
  max-width: 48rem;
}

/* A claim wraps as a whole, never mid phrase. */
.home-hero__claims > li {
  white-space: nowrap;
}

/* Separators only where the line fits on one row. At 12px the four claims
   measure about 830px, inside the 848px hero column. */
@media (min-width: 64rem) {
  .home-hero__claims {
    flex-wrap: nowrap;
    column-gap: 0;
    max-width: none;
  }

  .home-hero__claims > li + li::before {
    content: '·';
    padding-inline: 0.6em;
    color: var(--ui-text-dimmed);
  }
}

.home-hero__promo {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
  cursor: pointer;
  transition: text-decoration-color 200ms ease-out;
}

.home-hero__promo:hover,
.home-hero__promo[data-state='open'] {
  text-decoration-color: currentColor;
}

.home-hero__promo:focus-visible,
.home-hero__verb:focus-visible,
.home-hero__cli:focus-visible {
  outline: 2px solid var(--ui-border-inverted);
  outline-offset: 2px;
  border-radius: 2px;
}
</style>
