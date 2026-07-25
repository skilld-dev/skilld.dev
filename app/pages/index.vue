<script setup lang="ts">
import type { FeaturedCollectionsResponse } from '~~/server/api/collections/featured.get'
import type { RecentPublishesResponse } from '~~/server/api/feed/recent-publishes.get'
import type { RecentUpdateCard, RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'
import OutcomeClusterGrid from '../components/OutcomeClusterGrid.vue'

const title = 'Curated skills for AI agents · skilld'
const description = 'Browse source-backed skills from open-source maintainers. Search by task, read the SKILL.md, and install with one command.'

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

defineOgImage('Splash.takumi', {}, { alt: 'skilld, curated skills for AI agents' })

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

const searchQuery = ref('')

function searchSkills() {
  const q = searchQuery.value.trim()
  return navigateTo(q ? { path: '/skills', query: { q } } : '/skills')
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
] = await Promise.all([
  withHomeDataTiming('home-featured', useFetch<FeaturedCollectionsResponse>('/api/collections/featured', {
    key: 'home-featured-collections-v5',
  })),
  withHomeDataTiming('home-updates', useFetch<RecentUpdatesResponse>('/api/feed/recent-updates', {
    key: 'home-recent-updates-v2',
  })),
  withHomeDataTiming('home-publishes', useFetch<RecentPublishesResponse>('/api/feed/recent-publishes', {
    key: 'home-recent-publishes-v2',
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
const supportingCollections = computed(() => featuredCollections.value.slice(1, 3))
const recentUpdates = computed(() => updatesData.value?.items ?? [])
const recentPublishes = computed(() => publishesData.value?.items ?? [])

type FeaturedCollectionSkill = FeaturedCollectionsResponse['items'][number]['skills'][number]

interface HeroSkillCard {
  key: string
  owner: string
  title: string
  ownerPath: string
  avatarUrl: string
  collectionName: string
  to: string
}

function featuredCollectionSkillPath(skill: FeaturedCollectionSkill): string {
  return skill.name
    ? repoSkillPath(skill.owner, skill.repo, skill.name)
    : repoHubPath(skill.owner, skill.repo)
}

function featuredCollectionSkillLabel(skill: FeaturedCollectionSkill): string {
  return skill.name ? `/${skill.name}` : skill.repo
}

const heroSkillCards = computed<HeroSkillCard[]>(() => {
  const seenOwners = new Set<string>()

  return featuredCollections.value
    .flatMap(collection => collection.skills.map((skill): HeroSkillCard => ({
      key: `${skill.owner}/${skill.repo}/${skill.name ?? 'repo'}`,
      owner: skill.owner,
      title: skill.displayName ?? featuredCollectionSkillLabel(skill),
      ownerPath: `${skill.owner}/${skill.repo}`,
      avatarUrl: `https://github.com/${skill.owner}.png?size=96`,
      collectionName: collection.name,
      to: featuredCollectionSkillPath(skill),
    })))
    .filter((skill) => {
      if (seenOwners.has(skill.owner))
        return false

      seenOwners.add(skill.owner)
      return true
    })
    .slice(0, 5)
})

const installCommand = computed(() => {
  const collection = leadCollection.value
  return collection
    ? collectionInstallCmd(collection.authorLogin, collection.slug)
    : ''
})

type CopyState
  = | { _tag: 'idle' }
    | { _tag: 'copied' }
    | { _tag: 'error', message: string }

const copyState = refAutoReset<CopyState>({ _tag: 'idle' }, 2500)
async function copyInstallCommand() {
  const command = installCommand.value
  if (!command)
    return

  const writeText = navigator.clipboard?.writeText.bind(navigator.clipboard)
  if (!writeText) {
    copyState.value = { _tag: 'error', message: 'Could not copy. Select the command and copy it manually.' }
    return
  }

  copyState.value = await writeText(command)
    .then((): CopyState => ({ _tag: 'copied' }))
    .catch((error): CopyState => {
      console.warn('[homepage] Could not copy install command:', error)
      return { _tag: 'error', message: 'Could not copy. Select the command and copy it manually.' }
    })
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
    : repoSkillPath(item.owner, item.repo, item.name)
}

function recentUpdateTitle(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? `${item.owner}/${item.repo}`
    : item.displayName
}

function recentUpdateDescription(item: RecentUpdateCard): string {
  if (item.kind === 'skill')
    return item.description ?? `${item.owner}/${item.repo}`

  const names = item.skills.slice(0, 3).map(skill => `/${skill.name}`).join(' · ')
  return item.skillCount > 3 ? `${names} · +${item.skillCount - 3} more` : names
}

const registryLinks = [
  {
    label: 'Collections',
    description: 'Install an opinionated set of compatible skills with one command.',
    to: '/collections',
    icon: 'i-lucide-layers',
    kicker: 'Curated path',
    action: 'Browse collections',
    featured: true,
  },
  {
    label: 'All skills',
    description: 'Search by name, maintainer, package, or the work you need done.',
    to: '/skills',
    icon: 'i-lucide-search',
    kicker: 'Full index',
    action: 'Search all skills',
    featured: false,
  },
  {
    label: 'Official publishers',
    description: 'Browse skills from maintainers and the organizations behind your tools.',
    to: '/skills/official',
    icon: 'i-lucide-badge-check',
    kicker: 'Source directory',
    action: 'View publishers',
    featured: false,
  },
]
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

      <div class="editorial-band__content mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 md:pb-24 md:pt-24">
        <div class="home-hero-grid grid items-center gap-12 lg:grid-cols-[minmax(0,1.18fr)_minmax(24rem,0.82fr)] lg:gap-12 xl:gap-16">
          <div class="home-hero-copy min-w-0">
            <p class="section-label mb-5">
              Source-backed skills for AI agents
            </p>
            <h1 id="hero-heading" class="home-display home-display--split max-w-[11ch] font-semibold tracking-[-0.045em] text-balance">
              Find skills your AI agent can actually use.
            </h1>
            <p class="mt-6 max-w-2xl text-lg leading-relaxed text-muted text-pretty sm:text-xl">
              Skills are instructions an agent can reuse. Tell us what you're working on, then check the source before you install anything.
            </p>

            <form
              class="mt-9 flex max-w-2xl flex-col gap-3 sm:flex-row"
              role="search"
              action="/skills"
              method="get"
              @submit.prevent="searchSkills"
            >
              <label for="home-skill-search" class="sr-only">Search skills</label>
              <UInput
                id="home-skill-search"
                v-model="searchQuery"
                name="q"
                type="search"
                autocomplete="off"
                placeholder="Search skills, packages, or maintainers…"
                icon="i-lucide-search"
                size="xl"
                class="min-w-0 flex-1 [&_input]:min-h-11"
              />
              <UButton
                type="submit"
                label="Search skills"
                trailing-icon="i-lucide-arrow-right"
                size="xl"
                class="min-h-11 justify-center"
              />
            </form>

            <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <UButton
                to="/skills"
                label="Browse all skills"
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
              <p class="font-mono text-xs text-muted">
                Every listing links to source. Install with one command.
              </p>
            </div>
          </div>

          <div v-if="heroSkillCards.length >= 4" class="min-w-0">
            <div class="home-hero-proof-head flex items-center justify-between gap-4 px-1 pb-3">
              <p class="data-label">
                Maintainers in the registry
              </p>
              <p class="font-mono text-xs text-muted">
                {{ heroSkillCards.length }} sources
              </p>
            </div>
            <div class="home-skill-proof" data-testid="hero-skill-proof">
              <ul class="home-skill-timeline list-none p-0">
                <li v-for="skill in heroSkillCards" :key="skill.key">
                  <NuxtLink :to="skill.to" class="home-skill-timeline__item group">
                    <span class="home-skill-timeline__avatar">
                      <img
                        :src="skill.avatarUrl"
                        alt=""
                        width="40"
                        height="40"
                        class="size-10 rounded-full border-2 border-[var(--ui-bg)] bg-default"
                        decoding="async"
                      >
                    </span>
                    <span class="home-skill-timeline__card">
                      <span class="flex min-w-0 items-start justify-between gap-3">
                        <span class="min-w-0">
                          <span class="block truncate font-mono text-xs text-muted">
                            @{{ skill.owner }} · {{ skill.collectionName }}
                          </span>
                          <span class="mt-1 block truncate text-base font-semibold tracking-tight text-default">
                            {{ skill.title }}
                          </span>
                          <span class="mt-1 block truncate font-mono text-xs text-muted">
                            {{ skill.ownerPath }}
                          </span>
                        </span>
                        <UIcon name="i-lucide-arrow-up-right" class="home-skill-timeline__arrow mt-0.5 size-4 shrink-0 text-muted transition-colors group-hover:text-default" aria-hidden="true" />
                      </span>
                    </span>
                  </NuxtLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      id="outcomes"
      class="editorial-band home-outcomes-band border-b border-default"
      aria-labelledby="outcomes-heading"
    >
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:gap-12">
          <div class="home-outcomes-intro">
            <p class="section-label">
              Browse by outcome
            </p>
            <h2 id="outcomes-heading" class="home-outcomes-title mt-4 max-w-[12ch] font-semibold text-balance">
              What are you trying to do?
            </h2>
            <p id="outcomes-description" class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
              Pick the job. The matching skills may span several tools and maintainers.
            </p>
          </div>
          <OutcomeClusterGrid aria-describedby="outcomes-description" />
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
            <p class="section-label">
              Featured focus
            </p>
            <h2 id="featured-focus-heading" class="home-featured-title mt-4 text-balance">
              Frontend design
            </h2>
            <p class="mt-4 max-w-xl text-base leading-relaxed text-muted text-pretty">
              Frontend skills covering accessibility, motion, and framework-specific component work.
            </p>
          </div>
          <UButton
            to="/collections"
            label="Explore all collections"
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
            Could not load featured skill sets.
          </p>
          <p class="mt-1 text-base text-muted">
            Check your connection and try again. The rest of the registry is still available.
          </p>
          <UButton
            label="Try featured sets again"
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
          <article class="home-featured-lead">
            <div class="home-featured-lead__intro">
              <div class="min-w-0">
                <p class="data-label">
                  Editor's starting point
                </p>
                <h3 class="home-featured-lead__title mt-3 text-balance">
                  {{ leadCollection.name }}
                </h3>
              </div>
              <div class="home-featured-curator">
                <img
                  :src="`https://avatars.githubusercontent.com/${leadCollection.authorLogin}?s=112`"
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
                Why start here
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
                  <span class="font-mono text-sm font-medium">
                    {{ featuredCollectionSkillLabel(skill) }}
                  </span>
                  <span class="mt-1 text-sm text-muted">
                    {{ skill.owner }}/{{ skill.repo }}
                  </span>
                </NuxtLink>
              </li>
            </ul>

            <UButton
              :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
              label="View this skill set"
              trailing-icon="i-lucide-arrow-right"
              class="mt-6 min-h-11"
            />
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
                    <img
                      :src="`https://avatars.githubusercontent.com/${collection.authorLogin}?s=72`"
                      alt=""
                      width="36"
                      height="36"
                      class="home-featured-support-avatar"
                      loading="lazy"
                      decoding="async"
                    >
                    <p class="data-label truncate">
                      Supporting set · @{{ collection.authorLogin }}
                    </p>
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
                  {{ collection.skillCount }} {{ collection.skillCount === 1 ? 'skill' : 'skills' }} in this set
                </p>
              </NuxtLink>
            </article>
          </div>
        </div>

        <div v-else class="mt-10 rounded-lg border border-default bg-default p-6">
          <p class="font-medium">
            No featured skill sets yet.
          </p>
          <p class="mt-1 text-base text-muted">
            Browse individual skills instead.
          </p>
          <UButton
            to="/skills"
            label="Browse all skills"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
          />
        </div>
      </div>
    </section>

    <section
      id="install-confidence"
      class="editorial-band home-confidence-band border-b border-default bg-muted"
      aria-labelledby="install-confidence-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-confidence-heading">
          <div class="min-w-0">
            <p class="section-label">
              Before you install
            </p>
            <h2 id="install-confidence-heading" class="home-confidence-title mt-4 text-balance">
              Check the source and the maintainer.
            </h2>
          </div>
          <p class="home-confidence-intro text-base leading-relaxed text-muted text-pretty">
            Every skill page shows who maintains it and where the SKILL.md lives. Collections add a note from the curator.
          </p>
        </div>

        <article v-if="leadCollection" class="home-confidence-panel">
          <ol class="home-confidence-chain">
            <li class="home-confidence-step">
              <p class="home-confidence-marker">
                <span aria-hidden="true">01</span>
                <span>Inspect</span>
              </p>
              <div class="home-confidence-step-body home-confidence-inspect">
                <div class="min-w-0">
                  <p class="data-label">
                    From the registry
                  </p>
                  <h3 class="home-confidence-collection-title mt-2 text-balance">
                    {{ leadCollection.name }}
                  </h3>
                </div>
                <UButton
                  :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
                  label="Inspect the set"
                  trailing-icon="i-lucide-arrow-up-right"
                  class="home-confidence-inspect-action min-h-11 shrink-0"
                />
              </div>
            </li>

            <li class="home-confidence-step">
              <p class="home-confidence-marker">
                <span aria-hidden="true">02</span>
                <span>Verify</span>
              </p>
              <div class="home-confidence-step-body home-confidence-proof">
                <div>
                  <h3 class="home-confidence-step-title">
                    Provenance
                  </h3>
                  <dl class="home-confidence-facts">
                    <div>
                      <dt class="data-label">
                        Curator
                      </dt>
                      <dd class="home-confidence-curator">
                        <img
                          :src="`https://avatars.githubusercontent.com/${leadCollection.authorLogin}?s=64`"
                          alt=""
                          width="32"
                          height="32"
                          loading="lazy"
                          decoding="async"
                        >
                        <span>@{{ leadCollection.authorLogin }}</span>
                      </dd>
                    </div>
                    <div>
                      <dt class="data-label">
                        Sources
                      </dt>
                      <dd>
                        {{ new Set(leadCollection.skills.map(skill => `${skill.owner}/${skill.repo}`)).size }} repos
                      </dd>
                    </div>
                    <div>
                      <dt class="data-label">
                        Curated
                      </dt>
                      <dd>
                        {{ formatRelative(leadCollection.updatedAt) }}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div v-if="leadCollection.preamble" class="home-confidence-rationale">
                  <p class="data-label">
                    Why this set
                  </p>
                  <p class="mt-2 text-base leading-relaxed text-muted text-pretty">
                    {{ leadCollection.preamble }}
                  </p>
                </div>
              </div>
            </li>

            <li class="home-confidence-step">
              <p class="home-confidence-marker">
                <span aria-hidden="true">03</span>
                <span>Install</span>
              </p>
              <div class="home-confidence-step-body">
                <h3 class="home-confidence-step-title">
                  Install the complete set
                </h3>
                <div class="home-confidence-command">
                  <code
                    id="featured-install-command"
                    tabindex="0"
                  >{{ installCommand }}</code>
                  <UButton
                    :icon="copyState._tag === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
                    :label="copyState._tag === 'copied' ? 'Copied' : 'Copy command'"
                    color="neutral"
                    variant="outline"
                    class="home-confidence-copy min-h-11 justify-center"
                    @click="copyInstallCommand"
                  />
                </div>
                <p
                  class="home-confidence-feedback text-base"
                  :class="copyState._tag === 'error' ? 'text-error' : 'text-muted'"
                  aria-live="polite"
                >
                  <template v-if="copyState._tag === 'copied'">
                    Command copied to your clipboard.
                  </template>
                  <template v-else-if="copyState._tag === 'error'">
                    {{ copyState.message }}
                  </template>
                  <template v-else>
                    Review the collection before running the command.
                  </template>
                </p>
              </div>
            </li>
          </ol>
        </article>

        <div v-else class="home-confidence-empty" role="status">
          <p class="font-medium">
            Install example unavailable.
          </p>
          <p class="mt-1 text-base text-muted">
            Browse a skill to inspect its source and installation command directly.
          </p>
          <UButton
            to="/skills"
            label="Browse skills"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
          />
        </div>
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
          <p class="section-label">
            Keep your agent current
          </p>
          <h2 id="freshness-heading" class="home-freshness-title mt-4 max-w-[15ch] font-semibold text-balance">
            See which sources changed.
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
            Source changes and newly added skills have separate feeds. Newness gets no quality boost.
          </p>
        </header>

        <div class="home-freshness-grid">
          <section class="home-freshness-primary" aria-labelledby="recent-updates-heading">
            <div class="home-freshness-feed-heading">
              <div class="min-w-0">
                <p class="data-label">
                  Source files changed
                </p>
                <h3 id="recent-updates-heading" class="home-freshness-primary-title mt-2 font-semibold tracking-tight">
                  Recently updated
                </h3>
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
                  No source changes have landed here yet.
                </p>
                <UButton to="/skills" label="Browse skills" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
              </div>
            </div>

            <aside class="home-freshness-watch" aria-labelledby="freshness-watch-heading">
              <div class="min-w-0">
                <p class="data-label">
                  Weekly change digest
                </p>
                <h3 id="freshness-watch-heading" class="home-freshness-watch-title mt-2 font-semibold tracking-tight">
                  Watch your stack for changes.
                </h3>
                <p class="mt-2 max-w-xl text-base leading-relaxed text-muted">
                  Pick the repositories you depend on and get a weekly digest when their skills change.
                </p>
              </div>
              <UButton
                to="/login?return_to=/onboarding/discover"
                label="Watch your stack"
                icon="i-lucide-github"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11 shrink-0 self-start"
              />
            </aside>
          </section>

          <section class="home-freshness-secondary" aria-labelledby="recent-publishes-heading">
            <div class="home-freshness-feed-heading">
              <div class="min-w-0">
                <p class="data-label flex items-center gap-1.5">
                  <UIcon name="i-lucide-badge-check" class="size-3.5 shrink-0" aria-hidden="true" />
                  From official publishers
                </p>
                <h3 id="recent-publishes-heading" class="home-freshness-secondary-title mt-2 font-semibold tracking-tight">
                  New to skilld
                </h3>
              </div>
              <UButton
                to="/skills/official"
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
                  :to="repoSkillPath(item.owner, item.repo, item.name)"
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
              <UButton to="/skills/official" label="View publishers" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
            </div>
          </section>
        </div>
      </div>
    </section>

    <section
      id="explore-registry"
      class="editorial-band home-registry border-b border-default"
      aria-labelledby="explore-registry-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-registry-intro">
          <div>
            <p class="section-label">
              Browse deeper
            </p>
            <h2 id="explore-registry-heading" class="home-section-title home-registry-title mt-4 text-balance">
              Collections, search, or publishers.
            </h2>
          </div>
          <p class="home-registry-summary">
            Want a full setup? Open Collections. Know the package or maintainer? Search the index. Official publishers have their own directory.
          </p>
        </div>

        <ul class="home-registry-map list-none p-0">
          <li
            v-for="(link, index) in registryLinks"
            :key="link.to"
            :class="{ 'home-registry-map__primary': link.featured }"
          >
            <NuxtLink
              :to="link.to"
              class="home-registry-route group"
              :class="{ 'home-registry-route--primary': link.featured }"
            >
              <span class="home-registry-route__topline">
                <span class="home-registry-route__number">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="home-registry-route__kicker">{{ link.kicker }}</span>
              </span>
              <span class="home-registry-route__body">
                <span class="home-registry-route__icon">
                  <UIcon :name="link.icon" class="size-5" aria-hidden="true" />
                </span>
                <span class="min-w-0">
                  <span class="home-registry-route__label">{{ link.label }}</span>
                  <span class="home-registry-route__description">{{ link.description }}</span>
                </span>
              </span>
              <span class="home-registry-route__action">
                {{ link.action }}
                <UIcon name="i-lucide-arrow-up-right" class="home-registry-route__arrow size-4" aria-hidden="true" />
              </span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </section>

    <section
      id="publish"
      class="editorial-band home-band--publish"
      aria-labelledby="publish-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="rose"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-publish-intro">
          <div>
            <p class="section-label">
              Contribute
            </p>
            <h2 id="publish-heading" class="home-section-title home-publish-title mt-4 text-balance">
              Publish your own setup.
            </h2>
          </div>
          <p class="home-publish-summary">
            Maintain a package? Ship agent guidance with the code. Built a setup you rely on? Publish it as a collection.
          </p>
        </div>

        <ol class="home-publish-ledger">
          <li>
            <NuxtLink
              to="/learn/author-npm-package-skills"
              class="home-publish-path"
            >
              <span class="home-publish-role">
                <span class="home-publish-number" aria-hidden="true">01</span>
                <span>For maintainers</span>
              </span>
              <span class="home-publish-copy">
                <span class="home-publish-path-title">Publish package skills</span>
                <span class="home-publish-description">
                  Ship agent guidance in the package, on the same release cycle as the code.
                </span>
              </span>
              <span class="home-publish-action">
                Read the authoring guide
                <UIcon name="i-lucide-arrow-right" class="home-publish-arrow size-4" aria-hidden="true" />
              </span>
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              to="/collections/new"
              class="home-publish-path home-publish-path--primary"
            >
              <span class="home-publish-role">
                <span class="home-publish-number" aria-hidden="true">02</span>
                <span>For practitioners</span>
              </span>
              <span class="home-publish-copy">
                <span class="home-publish-path-title">Publish a collection</span>
                <span class="home-publish-description">
                  Turn the skills you use into a collection others can open and install.
                </span>
              </span>
              <span class="home-publish-action">
                Create a collection
                <UIcon name="i-lucide-arrow-right" class="home-publish-arrow size-4" aria-hidden="true" />
              </span>
            </NuxtLink>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>
