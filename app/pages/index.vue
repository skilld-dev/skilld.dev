<script setup lang="ts">
import type { FeaturedCollectionsResponse } from '~~/server/api/collections/featured.get'
import type { RecentPublishesResponse } from '~~/server/api/feed/recent-publishes.get'
import type { RecentUpdateCard, RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'
import type { TrendingFeedResponse } from '~~/server/api/feed/trending.get'
import type { InstallTarget } from '../composables/useInstallCopy'
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
    data: collectionsData,
    status: collectionsStatus,
    error: collectionsError,
    refresh: refreshCollections,
  },
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
  withHomeDataTiming('home-featured', useFetch<FeaturedCollectionsResponse>('/api/collections/featured', {
    key: 'home-featured-collections-v6',
  })),
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

const featuredCollections = computed(() =>
  (collectionsData.value?.items ?? []).map(collection => ({
    ...collection,
    skills: collection.skills ?? [],
  })),
)
/**
 * The lead card prints "Install all N skills" and a live copy button, so it
 * has to be a collection with skills in it. The API filters members on trust,
 * source and render status, so a featured collection can arrive with a count
 * of zero and nothing to install.
 */
const leadCollection = computed(() =>
  featuredCollections.value.find(collection => collection.skills.length > 0) ?? null,
)
const featuredSkillTotal = computed(() =>
  featuredCollections.value.reduce((total, collection) => total + collection.skillCount, 0),
)
const supportingCollections = computed(() =>
  featuredCollections.value.filter(collection => collection !== leadCollection.value).slice(0, 2),
)
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

type FeaturedCollectionSkill = FeaturedCollectionsResponse['items'][number]['skills'][number]
type FeaturedCollection = FeaturedCollectionsResponse['items'][number]

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

function featuredCollectionSkillPath(skill: FeaturedCollectionSkill): string {
  return skill.registryPath
}

function featuredCollectionSkillLabel(skill: FeaturedCollectionSkill): string {
  return skill.name ? `/${skill.name}` : skill.repo
}

/** The avatar stack shows three faces, whatever the collection holds. */
function collectionSkillOwners(collection: FeaturedCollection): string[] {
  return [...new Set(collection.skills.map(skill => skill.owner))].slice(0, 3)
}

/**
 * The label counts every author, then names three. A seven-author collection
 * read as a three-author one before, because the slice above was the only
 * thing the reader saw.
 */
function collectionSkillOwnerLabel(collection: FeaturedCollection): string {
  const total = new Set(collection.skills.map(skill => skill.owner)).size
  const named = collectionSkillOwners(collection).map(owner => `@${owner}`).join(' + ')
  return total > 3 ? `${named} +${total - 3} more` : named
}

const installCommand = computed(() => {
  const collection = leadCollection.value
  return collection
    ? collectionInstallCmd(collection.authorLogin, collection.slug)
    : ''
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
const trendingDoorTarget = computed(() => (showTrending.value ? '#discover' : '/skills/trending'))

// Named agent row under the search: proof of "every agent".
const heroAgentLogos = AGENT_LOGOS

const installTarget = computed<InstallTarget | null>(() => {
  const collection = leadCollection.value
  return collection
    ? { kind: 'collection', handle: collection.authorLogin, slug: collection.slug }
    : null
})
const { copy: copyFeaturedInstall } = useInstallCopy(
  installCommand,
  'homepage-featured-collection',
  'install',
  installTarget,
)
const copyState = refAutoReset<InstallCopyResult | { _tag: 'idle' }>({ _tag: 'idle' }, 2500)

async function copyInstallCommand() {
  if (!installCommand.value)
    return

  copyState.value = await copyFeaturedInstall()
}

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
      <NoiseField :opacity="0.24" />
      <div
        class="editorial-atmosphere"
        data-palette="rose"
        data-geometry="sky"
        data-intensity="ambient"
        aria-hidden="true"
      />

      <!-- The hero runs wider than the editorial bands below it so the proof
           rail sits beside the headline instead of compressing it. -->
      <div class="editorial-band__content mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <div class="home-hero-grid home-hero-grid">
          <div class="home-hero-copy min-w-0">
            <h1 id="hero-heading" class="home-hero-title font-semibold tracking-[-0.045em]">
              <span class="home-hero-taste">Taste-tested<span class="home-hero-emoji" aria-hidden="true">😋</span></span><br>
              agent skills<br>
              <span class="home-hero-eco">ecosystem.</span>
            </h1>
            <p class="mt-6 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">
              Skills written by the maintainers themselves, read by a person before they're listed. Find what your agent needs today, then keep up when it changes.
            </p>

            <div class="home-hero-slots mt-10">
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
            <SkillSourceList
              :items="heroTrendingCards"
              variant="stream"
              auto-scroll
              :aria-label="heroShowsTrending ? 'Trending skills this week' : 'Person-authored skills'"
            />
          </div>
        </div>
      </div>
    </section>

    <nav class="home-doors" aria-label="What you can do here">
      <div class="mx-auto grid max-w-6xl gap-px px-4 sm:px-6 md:grid-cols-3">
        <NuxtLink :to="trendingDoorTarget" class="home-door">
          <UIcon name="i-lucide-flame" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">Trending this week<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">The skills devs are posting about right now. Every card names the author and links the source.</span>
        </NuxtLink>
        <NuxtLink to="#outcomes" class="home-door">
          <UIcon name="i-lucide-route" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">Skills for your kind of work<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">Tracks for review, testing, design, SEO and shipping. A person picked each list.</span>
        </NuxtLink>
        <NuxtLink to="#freshness" class="home-door">
          <UIcon name="i-lucide-eye" class="home-door-mark" aria-hidden="true" />
          <span class="home-door-title">Watch it change<UIcon name="i-lucide-arrow-right" class="home-door-arrow" aria-hidden="true" /></span>
          <span class="home-door-text">Maintainers ship often. Watch the repos you rely on. One digest lists what changed.</span>
        </NuxtLink>
      </div>
    </nav>

    <section
      v-if="showTrending || trendingStatus === 'pending'"
      id="discover"
      class="home-wm"
      aria-labelledby="trending-heading"
    >
      <span class="home-watermark" aria-hidden="true">Week</span>
      <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <header class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="trending-heading" class="home-h2 text-balance">
              <span class="home-ink">Trending</span> this week.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Devs are posting about these skill repos. We count how many separate devs shared each one. Every card links the author's source.
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

        <div v-if="trendingStatus === 'pending'" class="mt-8 grid gap-4 sm:grid-cols-2" aria-busy="true">
          <div v-for="i in 4" :key="i" class="rounded-lg border border-default p-4">
            <USkeleton class="h-4 w-2/3" />
            <USkeleton class="mt-3 h-3 w-full" />
            <USkeleton class="mt-2 h-3 w-4/5" />
          </div>
        </div>

        <ol v-else class="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
          <li v-for="repo in trendingSectionRepos" :key="`${repo.owner}/${repo.repo}`">
            <NuxtLink
              :to="repoHubPath(repo.owner, repo.repo)"
              class="group flex h-full flex-col rounded-lg border border-default p-4 transition-colors hover:border-inverted"
            >
              <span class="flex items-center gap-2">
                <img
                  :src="githubAvatarProxyUrl(repo.owner, 64)"
                  alt=""
                  width="24"
                  height="24"
                  class="size-6 shrink-0 rounded-full border border-default bg-muted"
                  loading="lazy"
                  decoding="async"
                >
                <span class="min-w-0 flex-1 truncate font-medium text-default">{{ repo.owner }}/{{ repo.repo }}</span>
                <span class="shrink-0 font-mono text-xs text-muted tabular-nums">
                  {{ repo.skillCount }} {{ repo.skillCount === 1 ? 'skill' : 'skills' }}
                </span>
              </span>
              <span v-if="repo.evidence" class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                {{ repo.evidence.text }}
              </span>
              <span class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{{ trendingShareLabel(repo.authorCount) }}</span>
                <span v-if="repo.evidence" class="font-mono">@{{ repo.evidence.authorHandle }}</span>
              </span>
            </NuxtLink>
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
            Skills for the <span class="home-ink">work you do</span>.
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
              Your skills <span class="home-ink">changed</span>. Did anyone tell you?
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
      id="featured-focus"
      class="home-wm editorial-band home-featured-band"
      aria-labelledby="featured-focus-heading"
    >
      <span class="home-watermark" aria-hidden="true">Picks</span>
      <div
        class="editorial-atmosphere"
        data-palette="ember"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-featured-heading">
          <div class="min-w-0">
            <h2 id="featured-focus-heading" class="home-h2 text-balance">
              A whole collection, <span class="home-ink">one command</span>.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              A collection gathers the skills one project needs. A curator picked every one. Install the set, then watch it.
            </p>
            <p v-if="featuredCollections.length" class="data-label mt-3">
              {{ featuredCollections.length }} {{ featuredCollections.length === 1 ? 'collection' : 'collections' }} · {{ featuredSkillTotal }} {{ featuredSkillTotal === 1 ? 'skill' : 'skills' }}
            </p>
          </div>
          <UButton
            to="/community"
            label="All curators"
            color="neutral"
            variant="ghost"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11 shrink-0 self-start"
          />
        </div>

        <div v-if="collectionsStatus === 'pending'" class="home-featured-layout mt-8" aria-busy="true">
          <div class="home-featured-lead p-5 sm:p-6">
            <USkeleton class="h-8 w-3/5" />
            <USkeleton class="mt-4 h-4 w-full" />
            <USkeleton class="mt-2 h-4 w-4/5" />
            <USkeleton class="mt-7 h-52 w-full" />
          </div>
          <div class="home-featured-support">
            <div class="home-featured-support-card">
              <USkeleton class="h-5 w-1/2" />
              <USkeleton class="mt-4 h-20 w-full" />
            </div>
            <div class="home-featured-support-card">
              <USkeleton class="h-5 w-2/5" />
              <USkeleton class="mt-4 h-20 w-full" />
            </div>
          </div>
        </div>

        <div
          v-else-if="collectionsError"
          class="mt-10 rounded-lg border border-default bg-default p-6"
          role="alert"
        >
          <p class="font-medium">
            Could not load collections.
          </p>
          <p class="mt-1 text-base text-muted">
            Check your connection and try again. The rest of the registry is still available.
          </p>
          <UButton
            label="Try collections again"
            color="neutral"
            variant="outline"
            size="sm"
            class="mt-4 min-h-11"
            @click="() => refreshCollections()"
          />
        </div>

        <div
          v-else-if="leadCollection"
          class="home-featured-layout mt-8"
        >
          <article class="home-featured-lead lead-emphasis">
            <div class="home-featured-lead__intro">
              <div class="min-w-0">
                <h3 class="home-featured-lead__title text-balance">
                  {{ leadCollection.name }}
                </h3>
              </div>
              <div class="home-featured-curator">
                <img
                  :src="githubAvatarProxyUrl(leadCollection.authorLogin, 112)"
                  alt=""
                  width="56"
                  height="56"
                  class="home-featured-avatar"
                  loading="lazy"
                  decoding="async"
                >
                <div class="min-w-0">
                  <p class="data-label">
                    Curated by
                  </p>
                  <p class="mt-1 truncate font-mono text-sm font-medium">
                    @{{ leadCollection.authorLogin }}
                  </p>
                  <!-- A pick under a person's name ages invisibly without this. -->
                  <p class="data-label mt-1">
                    Updated {{ formatRelative(leadCollection.updatedAt) }}
                  </p>
                </div>
              </div>
            </div>

            <div v-if="leadCollection.preamble" class="home-featured-rationale">
              <p class="data-label">
                Why this collection
              </p>
              <p class="mt-2 max-w-2xl text-base leading-relaxed text-muted text-pretty">
                {{ leadCollection.preamble }}
              </p>
            </div>

            <div class="home-featured-skill-heading">
              <p class="data-label">
                Inside this collection
              </p>
              <p class="data-label">
                {{ leadCollection.skillCount }} {{ leadCollection.skillCount === 1 ? 'skill' : 'skills' }}
              </p>
            </div>

            <ul v-if="leadCollection.skills.length" class="home-featured-skills">
              <li
                v-for="skill in leadCollection.skills.slice(0, 6)"
                :key="`${skill.owner}/${skill.repo}/${skill.name ?? 'repo'}`"
              >
                <NuxtLink
                  :to="featuredCollectionSkillPath(skill)"
                  class="home-featured-skill group"
                  :aria-label="`${featuredCollectionSkillLabel(skill)} by ${skill.owner}`"
                >
                  <img
                    :src="githubAvatarProxyUrl(skill.owner, 64)"
                    alt=""
                    width="32"
                    height="32"
                    class="home-featured-skill-avatar"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0">
                    <span class="block font-mono text-sm font-medium">
                      {{ featuredCollectionSkillLabel(skill) }}
                    </span>
                    <span class="mt-1 block text-sm text-muted">
                      {{ skill.owner }}/{{ skill.repo }}
                    </span>
                  </span>
                </NuxtLink>
              </li>
              <li v-if="leadCollection.skillCount > 6" class="home-featured-skill-more">
                <span class="data-label">
                  +{{ leadCollection.skillCount - 6 }} more in the collection
                </span>
              </li>
            </ul>

            <div class="home-featured-install">
              <div class="home-featured-install__heading">
                <div>
                  <p class="data-label">
                    Install all {{ leadCollection.skillCount }} skills
                  </p>
                  <p class="mt-2 text-base leading-relaxed text-muted">
                    One command installs every skill in the collection.
                  </p>
                </div>
                <UButton
                  :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
                  label="Open collection"
                  color="neutral"
                  variant="ghost"
                  trailing-icon="i-lucide-arrow-up-right"
                  class="min-h-11 shrink-0"
                />
              </div>
              <div class="home-featured-command">
                <InstallCommand
                  id="featured-install-command"
                  :command="installCommand"
                  wrap
                  tabindex="0"
                />
                <UButton
                  :icon="copyState._tag === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
                  :label="copyState._tag === 'copied' ? 'Copied' : 'Copy install command'"
                  color="neutral"
                  variant="outline"
                  class="home-featured-copy min-h-11 justify-center"
                  @click="copyInstallCommand"
                />
              </div>
              <p
                class="home-featured-feedback text-sm"
                :class="copyState._tag === 'error' ? 'text-error' : 'text-muted'"
                aria-live="polite"
              >
                <template v-if="copyState._tag === 'copied'">
                  Install command copied.
                </template>
                <template v-else-if="copyState._tag === 'error'">
                  {{ copyState.message }}
                </template>
                <template v-else>
                  Check the collection before you run the command.
                </template>
              </p>
            </div>
          </article>

          <div v-if="supportingCollections.length" class="home-featured-support">
            <article
              v-for="collection in supportingCollections"
              :key="`${collection.authorLogin}/${collection.slug}`"
              class="min-h-0"
            >
              <NuxtLink
                :to="`/@${collection.authorLogin}/${collection.slug}`"
                class="home-featured-support-card group"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="home-featured-owner-stack" aria-hidden="true">
                      <img
                        v-for="owner in collectionSkillOwners(collection)"
                        :key="owner"
                        :src="githubAvatarProxyUrl(owner, 64)"
                        alt=""
                        width="32"
                        height="32"
                        class="home-featured-support-avatar"
                        loading="lazy"
                        decoding="async"
                      >
                    </span>
                  </div>
                  <UIcon name="i-lucide-arrow-up-right" class="home-featured-support-arrow size-4 shrink-0" aria-hidden="true" />
                </div>
                <h3 class="mt-4 text-lg font-semibold tracking-tight">
                  {{ collection.name }}
                </h3>
                <p v-if="collection.preamble" class="mt-3 text-base leading-relaxed text-muted line-clamp-2 sm:line-clamp-3">
                  {{ collection.preamble }}
                </p>
                <p class="home-featured-support-meta font-mono text-xs text-muted">
                  {{ collection.skillCount }} {{ collection.skillCount === 1 ? 'skill' : 'skills' }} · by {{ collectionSkillOwnerLabel(collection) }}
                </p>
              </NuxtLink>
            </article>
          </div>
        </div>

        <div v-else class="mt-10 rounded-lg border border-default bg-default p-6">
          <p class="font-medium">
            No collections are featured right now.
          </p>
          <p class="mt-1 text-base text-muted">
            The link above lists every curator on the site.
          </p>
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
        <div class="home-make-strip">
          <div class="min-w-0">
            <h2 id="publish-heading" class="home-h2 text-balance">
              Maintain something? <span class="home-ink">Write the skill</span> for it.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Choose a package you publish or a project you maintain. Get the steps to draft a Skill, review it, and ship it in your repository.
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
