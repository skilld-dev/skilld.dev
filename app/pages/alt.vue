<script setup lang="ts">
import type { FeaturedCollectionsResponse } from '~~/server/api/collections/featured.get'
import type { RecentPublishesResponse } from '~~/server/api/feed/recent-publishes.get'
import type { RecentUpdateCard, RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'
import type { TrendingFeedResponse } from '~~/server/api/feed/trending.get'
import type { SkillSourceItem } from '../types/skill-source'
import type { FeaturedPersonSection } from '../utils/homepage-person-skills'
import OutcomeClusterGrid from '../components/OutcomeClusterGrid.vue'
import { homepagePersonSkillFallbacks } from '../data/homepage-person-skills'
import {
  HOMEPAGE_PERSON_MINIMUM,
  selectHomepagePersonSkills,
  selectHomepageTrendingSkills,
} from '../utils/homepage-person-skills'

const title = 'Agent skills ecosystem for the way you build · skilld'
const description = 'Find agent skills the maintainers wrote, keep them current, and write your own. One command, every agent, no account.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  robots: 'noindex',
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
    key: 'home-trending-v1',
    // The hero rail flattens repos to individual skills, so it needs more
    // repos than the six-card section below it.
    query: { limit: 12 },
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
const leadCollection = computed(() => featuredCollections.value[0] ?? null)
const featuredSkillTotal = computed(() =>
  featuredCollections.value.reduce((total, collection) => total + collection.skillCount, 0),
)
const supportingCollections = computed(() => featuredCollections.value.slice(1, 3))
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
  const livePeople = new Set(liveSkills.map(skill => skill.owner))

  return liveSkills.length >= HOMEPAGE_RAIL_MINIMUM
    && livePeople.size >= HOMEPAGE_PERSON_MINIMUM
    ? liveSkills
    : homepagePersonSkillFallbacks
})

/**
 * Hero rail contents: the individual skills inside this week's trending repos.
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
      maintainerName: repo.evidence?.authorName ?? null,
      description: skill.description,
      context: trendingShareLabel(repo.authorCount),
    })),
  ),
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

function collectionSkillOwners(collection: FeaturedCollection): string[] {
  return [...new Set(collection.skills.map(skill => skill.owner))].slice(0, 3)
}

function collectionSkillOwnerLabel(collection: FeaturedCollection): string {
  return collectionSkillOwners(collection).map(owner => `@${owner}`).join(' + ')
}

const installCommand = computed(() => {
  const collection = leadCollection.value
  return collection
    ? collectionInstallCmd(collection.authorLogin, collection.slug)
    : ''
})

/**
 * The authoring story runs a skilld-maintained Skill. The CLI itself never
 * drafts a Skill, so the band hands the visitor the same run command every
 * other surface prints.
 */
const authoringRunCommand = skillRunCmd('skilld-dev', 'skilld', 'generate-package-skill')

const heroInstallCommand = 'npx skilld add gh:owner/repo'
const { copy: copyHeroCommand, copied: heroCommandCopied } = useClipboard({
  source: heroInstallCommand,
  copiedDuring: 2000,
  legacy: true,
})

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
      class="editorial-band home-band--hero border-b border-default"
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
      <div class="editorial-band__content mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <div class="home-hero-grid alt-hero-grid">
          <div class="home-hero-copy min-w-0">
            <h1 id="hero-heading" class="alt-hero-title max-w-[16ch] font-semibold tracking-[-0.045em] text-balance">
              Agent skills ecosystem for the way you build.
            </h1>
            <p class="mt-4 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">
              You drive an agent every day. Give it the open-source skills the maintainers wrote: find them, keep them current, write your own.
            </p>

            <div class="alt-hero-slots mt-8">
              <div class="alt-hero-slot">
                <HomeSearch />
              </div>

              <div class="alt-hero-slot">
                <div class="alt-hero-command">
                  <span class="alt-hero-command-scroll">
                    <span class="alt-hero-prompt" aria-hidden="true">$</span>
                    <InstallCommand
                      id="alt-hero-install-command"
                      :command="heroInstallCommand"
                      tabindex="0"
                    />
                  </span>
                  <UButton
                    :icon="heroCommandCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="min-h-11 min-w-11 shrink-0"
                    :aria-label="heroCommandCopied ? 'Copied' : 'Copy install command'"
                    @click="() => { void copyHeroCommand() }"
                  />
                </div>
                <p class="data-label mt-2">
                  One command, every agent. No account.
                </p>
              </div>
            </div>
          </div>

          <div class="home-hero-proof min-w-0">
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

    <nav class="alt-doors border-b border-default" aria-label="What you can do here">
      <div class="mx-auto grid max-w-7xl gap-px px-4 sm:px-6 md:grid-cols-3">
        <NuxtLink to="#outcomes" class="alt-door">
          <span class="alt-door-title">Skills the maintainers wrote</span>
          <span class="alt-door-text">Trending this week, new arrivals, and tracks for the work you do. Author and source on every card.</span>
        </NuxtLink>
        <NuxtLink to="#freshness" class="alt-door">
          <span class="alt-door-title">Know when a skill changes</span>
          <span class="alt-door-text">Watch the repos you depend on. One digest says what moved and why it matters.</span>
        </NuxtLink>
        <NuxtLink to="#publish" class="alt-door">
          <span class="alt-door-title">Write one for your own code</span>
          <span class="alt-door-text">Draft a skill for a package you maintain, or index the project you are in.</span>
        </NuxtLink>
      </div>
    </nav>

    <section
      id="outcomes"
      class="editorial-band home-outcomes-band border-b border-default"
      aria-labelledby="outcomes-heading"
    >
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-outcomes-intro">
          <h2 id="outcomes-heading" class="home-outcomes-title max-w-[16ch] font-semibold text-balance">
            Skills for the work you do.
          </h2>
          <p id="outcomes-description" class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
            Pick a track. Each one shows who writes skills for it and what they cover.
          </p>
        </div>
        <OutcomeClusterGrid class="mt-8 md:mt-10" aria-describedby="outcomes-description" :limit="12" :rows="3" />
        <UButton
          to="/skills"
          label="All tracks"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
          class="mt-4 min-h-11"
        />
      </div>
    </section>

    <section
      id="publish"
      class="editorial-band home-band--publish border-b border-default"
      aria-labelledby="publish-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="rose"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-12">
        <header>
          <h2 id="publish-heading" class="home-section-title home-publish-title text-balance">
            Write a skill for your own code.
          </h2>
          <p class="home-publish-summary mt-4">
            skilld drafts it, you edit and own it, and it ships in your repo under your name.
          </p>
        </header>
        <div class="alt-make-grid mt-8">
          <article class="alt-make-door">
            <h3 class="text-lg font-semibold tracking-tight">
              For a package you maintain
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted text-pretty">
              Drafts a SKILL.md from your docs and API so agents use your package the way you intended. Commit it and list it here.
            </p>
            <p class="mt-4 text-sm">
              <InstallCommand
                id="publish-run-command"
                :command="authoringRunCommand"
                wrap
                tabindex="0"
              />
            </p>
            <UButton
              to="/learn/author-npm-package-skills"
              label="Package skill guide"
              color="neutral"
              variant="outline"
              size="sm"
              trailing-icon="i-lucide-arrow-right"
              class="mt-4 min-h-11"
            />
          </article>
          <article class="alt-make-door">
            <h3 class="text-lg font-semibold tracking-tight">
              For the project you are in
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted text-pretty">
              Indexes your source and docs into a searchable project skill, so your agent finds the real file instead of guessing.
            </p>
            <p class="mt-4 text-sm">
              <InstallCommand
                id="publish-self-command"
                command="npx skilld self"
                wrap
                tabindex="0"
              />
            </p>
            <UButton
              to="/cli"
              label="Project skill guide"
              color="neutral"
              variant="outline"
              size="sm"
              trailing-icon="i-lucide-arrow-right"
              class="mt-4 min-h-11"
            />
          </article>
        </div>
      </div>
    </section>
    <section
      v-if="showTrending || trendingStatus === 'pending'"
      id="discover"
      class="border-b border-default"
      aria-labelledby="trending-heading"
    >
      <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <header class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="trending-heading" class="text-2xl font-semibold tracking-tight text-balance">
              What devs are installing this week.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Repos devs are posting about, ranked by how many separate people shared them. Every one links to the author's source.
            </p>
            <p v-if="trendingSectionRepos.length" class="data-label mt-3">
              {{ trendingSectionRepos.length }} {{ trendingSectionRepos.length === 1 ? 'repository' : 'repositories' }}
            </p>
          </div>
          <UButton
            to="/skills/trending"
            label="See all"
            color="neutral"
            variant="ghost"
            size="sm"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11"
          />
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
                  :src="`https://github.com/${repo.owner}.png?size=64`"
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
      id="freshness"
      class="editorial-band home-freshness-band border-b border-default"
      aria-labelledby="freshness-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content home-freshness-shell mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <header class="home-freshness-header">
          <h2 id="freshness-heading" class="home-freshness-title max-w-[15ch] font-semibold text-balance">
            Your skills changed. Did anyone tell you?
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
            Watch a repo and a digest says what changed and why it matters. Silence when nothing did.
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
              to="/collections"
              label="Watch a collection"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-arrow-right"
              size="lg"
              class="min-h-11 justify-center"
            />
          </div>
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
                label="Browse all"
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
                  Check your connection and try this list again.
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
                    :src="item.avatarUrl"
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
                  The update feed is quiet.
                </p>
                <p class="mt-1 max-w-md text-base leading-relaxed text-muted">
                  No tracked source changes yet.
                </p>
                <UButton to="/skills" label="Browse skills" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
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
                  From official publishers
                </p>
              </div>
              <UButton
                to="/skills"
                label="View publishers"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
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
                Check your connection and try this list again.
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
                    :src="`https://github.com/${item.owner}.png?size=64`"
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
                You can still browse existing publishers.
              </p>
              <UButton to="/skills" label="View publishers" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
            </div>
          </section>
        </div>
      </div>
    </section>

    <section
      id="featured-focus"
      class="editorial-band home-featured-band border-b border-default"
      aria-labelledby="featured-focus-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="ember"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-featured-heading">
          <div class="min-w-0">
            <h2 id="featured-focus-heading" class="home-featured-title text-balance">
              A whole stack in one command.
            </h2>
            <p class="mt-4 max-w-xl text-base leading-relaxed text-muted text-pretty">
              Collections bundle the skills a stack needs. Install all of them at once, then watch the collection for changes.
            </p>
            <p v-if="featuredCollections.length" class="data-label mt-3">
              {{ featuredCollections.length }} {{ featuredCollections.length === 1 ? 'collection' : 'collections' }} · {{ featuredSkillTotal }} {{ featuredSkillTotal === 1 ? 'skill' : 'skills' }}
            </p>
          </div>
          <UButton
            to="/community"
            label="Explore the community"
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
            Could not load community collections.
          </p>
          <p class="mt-1 text-base text-muted">
            Check your connection and try again. The rest of the registry is still available.
          </p>
          <UButton
            label="Try community collections again"
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
                  :src="`https://github.com/${leadCollection.authorLogin}.png?size=112`"
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
                    :src="`https://github.com/${skill.owner}.png?size=64`"
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
            </ul>

            <div class="home-featured-install">
              <div class="home-featured-install__heading">
                <div>
                  <p class="data-label">
                    Add all {{ leadCollection.skillCount }} skills
                  </p>
                  <p class="mt-2 text-base leading-relaxed text-muted">
                    Run one command, or open the collection and check each source first.
                  </p>
                </div>
                <UButton
                  :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
                  label="Inspect collection"
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
                        :src="`https://github.com/${owner}.png?size=64`"
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
            No community collections are featured right now.
          </p>
          <p class="mt-1 text-base text-muted">
            The community directory is still available.
          </p>
          <UButton
            to="/community"
            label="Browse the community"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
          />
        </div>
      </div>
    </section>
  </div>
</template>
