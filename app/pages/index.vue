<script setup lang="ts">
import type { RecentPublishesResponse } from '~~/server/api/feed/recent-publishes.get'
import type { RecentUpdateCard, RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'
import type { TrendingFeedItem, TrendingFeedResponse } from '~~/server/api/feed/trending.get'
import type { SkillSourceItem } from '../types/skill-source'
import type { FeaturedPersonSection } from '../utils/homepage-person-skills'
import { WRITING_COMPARISON_LINK } from '#shared/comparison-navigation'
import { avatarProxyUrl, githubAvatarProxyUrl } from '#shared/image-proxy'
import { TRENDING_RANGES } from '#shared/trending-range'
import { AGENT_LOGOS } from '~/utils/agent-logos'
import OutcomeClusterGrid from '../components/OutcomeClusterGrid.vue'
import { homepagePersonSkillFallbacks } from '../data/homepage-person-skills'
import {
  HOMEPAGE_PERSON_MINIMUM,
  selectHomepagePersonSkills,
  selectHomepageTrendingSkills,
  uniqueByOwner,
} from '../utils/homepage-person-skills'

const title = 'Taste-tested agent skills ecosystem · skilld'
const description = 'Agent skills written by their maintainers and read by a person before they go in. See what devs are sharing this week, find what your agent needs, and keep up when it changes.'

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

defineOgImage('Splash.takumi', {}, { alt: 'skilld, curated agent skills by humans' })

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
    // The hero rail shows one skill per author, so it needs more repos than
    // the six-card section below it.
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
/** The section below the fold stays a six-card grid whatever the rail uses. */
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

/**
 * The one Skill a trending card can offer a run command for. A repository
 * with several Skills gets none: the posts are about the repository, so
 * picking one of its Skills would be a guess.
 */
function soleTrendingSkill(repo: TrendingFeedItem): TrendingFeedItem['skills'][number] | null {
  return repo.skillCount === 1 ? repo.skills[0] ?? null : null
}

const trendingCards = computed(() =>
  trendingSectionRepos.value.map(repo => ({ repo, runSkill: soleTrendingSkill(repo) })),
)

/** Real Skill names from this week's trending repositories, for the hero texture. */
const heroTextureNames = computed(() =>
  trendingRepos.value.flatMap(repo => repo.skills.map(skill => `${repo.owner}/${repo.repo}/${skill.name}`)),
)

interface FeaturedPeopleResponse {
  devSections: FeaturedPersonSection[]
}

// The hero rail is decoration on top of the headline, so it loads after
// hydration and falls back to a hand-picked set when the live data is thin.
const { data: peopleSkillsData, execute: loadPeopleSkills } = await useFetch<FeaturedPeopleResponse>('/api/skills/featured', {
  key: 'home-person-skills-v1',
  query: { orgs: 0, perOrg: 1, devs: 24, perDev: 3 },
  server: false,
  lazy: true,
  immediate: false,
})

const fallbackPersonNamesByOwner = new Map<string, string>(
  homepagePersonSkillFallbacks.map(skill => [skill.owner, skill.maintainerName ?? skill.owner]),
)

const heroSkillCards = computed<readonly SkillSourceItem[]>(() => {
  const liveSkills = selectHomepagePersonSkills(
    peopleSkillsData.value?.devSections ?? [],
    fallbackPersonNamesByOwner,
  )

  return liveSkills.length >= HOMEPAGE_PERSON_MINIMUM
    ? liveSkills
    : uniqueByOwner(homepagePersonSkillFallbacks)
})

/**
 * Hero rail contents: one skill per author from this week's trending repos,
 * padded with the evergreen set so the stream stays deep enough to scroll.
 *
 * Flattened from repos to skills because the rail shows one skill per card,
 * while the section further down shows repos with their quoted evidence. The
 * two are different granularities of the same signal rather than a duplicate.
 *
 * Falls back to the curated person-authored rail when trending is too thin.
 * The hero is the first thing anyone sees, so an empty or one-card rail there
 * is worse than showing the evergreen set.
 */
const homepageTrendingSelection = computed(() => selectHomepageTrendingSkills(
  trendingRepos.value.flatMap(repo =>
    repo.skills.map(skill => ({
      owner: repo.owner,
      repo: repo.repo,
      name: skill.name,
      displayName: skill.displayName,
      registryPath: skill.registryPath,
      description: skill.description,
      context: trendingShareLabel(repo.authorCount),
    })),
  ),
  homepagePersonSkillFallbacks,
))

const heroTrendingCards = computed<readonly SkillSourceItem[]>(() => {
  const selection = homepageTrendingSelection.value
  return selection._tag === 'trending' ? selection.items : heroSkillCards.value
})

const heroShowsTrending = computed(() => homepageTrendingSelection.value._tag === 'trending')

onMounted(() => {
  if (homepageTrendingSelection.value._tag === 'fallback')
    void loadPeopleSkills()
})

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
 * Re-measure before trusting this order past October. Method and numbers:
 * ~/scratch/notes/skilld-track-demand-2026-09-04.md
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

/**
 * The trending band hides itself below MIN_TRENDING_TO_SHOW, so the door has
 * to fall back to the page that always exists. An anchor to a section that did
 * not render is a link that does nothing.
 */
const trendingDoorTarget = computed(() => (showTrending.value ? '#trending' : '/skills/trending'))

// Named agent row under the search: proof of "every agent".
const heroAgentLogos = AGENT_LOGOS

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

function recentUpdatePath(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? repoHubPath(item.owner, item.repo)
    : item.registryPath
}

function recentUpdateTitle(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? `${item.owner}/${item.repo}`
    : item.displayName
}

function recentUpdateDescription(item: RecentUpdateCard): string {
  if (item.kind === 'skill')
    return item.changeSummary ?? item.description ?? `${item.owner}/${item.repo}`

  if (item.changeSummary)
    return item.changeSummary

  const names = item.skills.slice(0, 3).map(skill => `/${skill.name}`).join(' · ')
  return item.skillCount > 3 ? `${names} · +${item.skillCount - 3} more` : names
}
</script>

<template>
  <div class="home-page overflow-clip">
    <section
      class="editorial-band home-band--hero"
      aria-labelledby="hero-heading"
    >
      <!-- The band's one atmosphere and its one moving region. The mask keeps
           the names clear of the headline. -->
      <div class="home-hero-texture" aria-hidden="true">
        <TextureBrailleNames :names="heroTextureNames" />
      </div>

      <!-- The hero runs wider than the editorial bands below it so the proof
           rail sits beside the headline instead of compressing it. -->
      <div class="editorial-band__content mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <div class="home-hero-grid">
          <div class="home-hero-copy min-w-0">
            <!-- The rose dot is the full stop. Screen readers get a typed one. -->
            <h1 id="hero-heading" class="home-hero-title font-semibold tracking-[-0.045em]">
              Hyped agent skills,<br>
              no bloat<span class="sr-only">.</span><span class="home-hero-dot" aria-hidden="true" />
            </h1>
            <p class="mt-6 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">
              Run a skill once and nothing lands on disk. Fork or install the ones you keep.
              Every skill comes from its maintainer's repo, and a person reads it before it's listed.
            </p>
            <p class="home-hero-claims data-label mt-4">
              <a href="https://github.com/skilld-dev/skilld" target="_blank" rel="noopener">Open-source CLI</a>
              <span aria-hidden="true"> · </span>
              <span>Analytics without cookies or IPs</span>
              <span aria-hidden="true"> · </span>
              <NuxtLink to="/vs/skills-sh">
                A skills.sh alternative
              </NuxtLink>
            </p>

            <div class="home-hero-promo mt-6">
              <span class="font-mono text-xs text-muted">Teach your agent skilld</span>
              <SkilldInstallChip surface="home-hero-promo" />
            </div>

            <div class="home-hero-slots mt-8">
              <div class="home-hero-slot">
                <div class="home-hero-search">
                  <HomeSearch />
                </div>
              </div>

              <div class="home-hero-slot">
                <ul class="home-hero-agents mt-2 list-none p-0" aria-label="Agents skilld works with">
                  <li v-for="agent in heroAgentLogos" :key="agent.id" class="home-hero-agent">
                    <UIcon :name="agent.icon" class="size-4 shrink-0" aria-hidden="true" />
                    <span>{{ agent.label }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="home-hero-proof home-hero-rail min-w-0">
            <!-- No auto scroll: the texture is the band's one moving region. -->
            <SkillSourceList
              :items="heroTrendingCards"
              variant="stream"
              :aria-label="heroShowsTrending ? 'Trending skills this week' : 'Person-authored skills'"
            />
          </div>
        </div>
      </div>
    </section>

    <nav class="home-doors" aria-label="What you can do here">
      <div class="mx-auto grid max-w-6xl gap-px px-4 sm:px-6 md:grid-cols-4">
        <NuxtLink to="/docs/cli#skilld-run" class="home-door">
          <UIcon name="i-lucide-terminal" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">No more skill bloat<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">Run skills once off, fork, or install.</span>
        </NuxtLink>
        <NuxtLink :to="trendingDoorTarget" class="home-door">
          <UIcon name="i-lucide-trending-up" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">Stay hyped<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">What devs talk about on X and Bluesky, weekly and monthly.</span>
        </NuxtLink>
        <NuxtLink to="#freshness" class="home-door">
          <UIcon name="i-lucide-eye" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">Keep updated<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">Watch repos and get a digest when their skills change.</span>
        </NuxtLink>
        <NuxtLink to="/developers" class="home-door">
          <UIcon name="i-lucide-blocks" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">Built to be built on<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">CLI, API, SDK and MCP.</span>
        </NuxtLink>
      </div>
    </nav>

    <section
      v-if="showTrending || trendingStatus === 'pending'"
      id="trending"
      class="home-wm"
      aria-labelledby="trending-heading"
    >
      <span class="home-watermark" aria-hidden="true">Week</span>
      <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <header class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="trending-heading" class="home-h2 text-balance">
              <span class="home-ink">Trending skills</span> this week.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Devs posted about these skills this week. We count each dev once, and every card links the source.
            </p>
            <p v-if="trendingSectionRepos.length" class="data-label mt-3">
              {{ trendingSectionRepos.length }} {{ trendingSectionRepos.length === 1 ? 'repository' : 'repositories' }}
            </p>
          </div>
          <nav class="flex flex-wrap gap-1" aria-label="Trending boards">
            <UButton
              v-for="option in TRENDING_RANGES"
              :key="option.id"
              :to="option.path"
              :label="option.label"
              color="neutral"
              variant="ghost"
              size="sm"
              class="min-h-11"
            />
          </nav>
        </header>

        <div v-if="trendingStatus === 'pending'" class="relative mt-8 h-10">
          <TextureConverge loading label="Loading trending skills" />
        </div>

        <ol v-else class="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
          <li v-for="{ repo, runSkill } in trendingCards" :key="`${repo.owner}/${repo.repo}`" class="min-w-0">
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
              <RunChip
                v-if="runSkill"
                :owner="repo.owner"
                :repo="repo.repo"
                :skill="runSkill.name"
                surface="home-trending-card"
                variant="compact"
                class="home-trending-card__action mt-3"
              />
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
            Pick a track. Busiest first, measured from what devs shared this week.
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
            <h2 id="freshness-heading" class="home-h2 max-w-[15ch] text-balance">
              Keep up with <span class="home-ink">skill changes</span>.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Watch a repo. Each month the digest lists what changed. If nothing changed, we send nothing.
            </p>
            <div class="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <UButton
                to="/me"
                label="Watch your starred repos"
                trailing-icon="i-lucide-arrow-right"
                size="lg"
                class="min-h-11 justify-center"
              />
              <UButton
                to="/digest/preview"
                external
                label="See an example digest"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-arrow-up-right"
                size="lg"
                class="min-h-11 justify-center"
              />
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
                <NuxtLink
                  :to="recentUpdatePath(item)"
                  class="home-freshness-row home-freshness-row--primary group"
                >
                  <img
                    :src="avatarProxyUrl(item.avatarUrl)"
                    alt=""
                    width="36"
                    height="36"
                    class="home-freshness-avatar home-freshness-avatar--primary"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0 flex-1">
                    <span class="home-freshness-row-title">{{ recentUpdateTitle(item) }}</span>
                    <span class="home-freshness-row-description">{{ recentUpdateDescription(item) }}</span>
                  </span>
                  <span class="home-freshness-time">{{ formatRelative(item.occurredAt) }}</span>
                  <UIcon name="i-lucide-arrow-up-right" class="home-freshness-arrow size-4 shrink-0" aria-hidden="true" />
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
                <NuxtLink
                  :to="item.registryPath"
                  class="home-freshness-row home-freshness-row--secondary group"
                >
                  <img
                    :src="githubAvatarProxyUrl(item.owner, 64)"
                    alt=""
                    width="32"
                    height="32"
                    class="home-freshness-avatar home-freshness-avatar--secondary"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0 flex-1">
                    <span class="home-freshness-row-title">{{ item.displayName }}</span>
                    <span class="home-freshness-row-description">{{ item.owner }}/{{ item.repo }}</span>
                  </span>
                  <span class="home-freshness-time">{{ formatRelative(item.occurredAt) }}</span>
                  <UIcon name="i-lucide-arrow-up-right" class="home-freshness-arrow size-4 shrink-0" aria-hidden="true" />
                </NuxtLink>
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
