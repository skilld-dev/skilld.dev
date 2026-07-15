<script setup lang="ts">
import type { FeaturedCollectionsResponse } from '~~/server/api/collections/featured.get'
import type { RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'

const title = 'Curated skills for AI agents · skilld'
const description = 'A curated registry of agent skills for the npm packages and GitHub repos you actually use. One install command, every agent. Get notified when they change.'

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

defineOgImage('Splash.takumi', {}, { alt: 'skilld — curated skills for AI agents' })

const heroInstallCmd = 'npx skilld add gh:<repo>'
const heroCopied = ref(false)
function copyHero() {
  navigator.clipboard.writeText(heroInstallCmd)
  heroCopied.value = true
  setTimeout(() => {
    heroCopied.value = false
  }, 2000)
}

const { data: updatesData } = useFetch<RecentUpdatesResponse>('/api/feed/recent-updates')
const recentUpdates = computed(() => updatesData.value?.items ?? [])

const { data: collectionsData } = useFetch<FeaturedCollectionsResponse>('/api/collections/featured', {
  key: 'home-featured-collections-v4',
})
const featuredCollections = computed(() =>
  (collectionsData.value?.items ?? []).map(collection => ({
    ...collection,
    skills: collection.skills ?? [],
  })),
)

type FeaturedCollectionSkill = FeaturedCollectionsResponse['items'][number]['skills'][number]

function featuredCollectionSkillPath(skill: FeaturedCollectionSkill): string {
  return skill.name
    ? repoSkillPath(skill.owner, skill.repo, skill.name)
    : repoHubPath(skill.owner, skill.repo)
}

function featuredCollectionSkillLabel(skill: FeaturedCollectionSkill): string {
  return skill.name ? `/${skill.name}` : skill.repo
}

interface DomainCategory {
  category: string
  label: string
  description: string
}

const DOMAIN_CATEGORIES: DomainCategory[] = [
  { category: 'design', label: 'Design & frontend craft', description: 'Interface critique, taste, motion, and visual direction for polished frontend work.' },
  { category: 'package-best-practices', label: 'Framework & library best practices', description: 'Conventions for the npm packages and frameworks your project already depends on.' },
  { category: 'testing-strategy', label: 'Testing', description: 'Unit, integration, and TDD workflows that keep behaviour stable.' },
  { category: 'api-integration', label: 'API integration', description: 'Connecting third-party services and SDKs with their current conventions.' },
  { category: 'devops', label: 'DevOps & deployment', description: 'CI, infrastructure, and release workflows that get code to production.' },
  { category: 'security', label: 'Security', description: 'Auditing, threat modelling, and finding vulnerabilities before shipping.' },
]

const { data: domainData } = useAsyncData('home-domains', async () => {
  const results = await Promise.all(
    DOMAIN_CATEGORIES.map(async (c) => {
      const res = await $fetch('/api/skills', {
        query: { category: c.category, limit: 6, sort: 'installs' },
      })
      return { ...c, items: res.items ?? [] }
    }),
  )
  return results.filter(r => r.items.length > 0)
})
const domainSections = computed(() => domainData.value ?? [])

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
</script>

<template>
  <div>
    <!-- Hero -->
    <div class="relative">
      <NoiseField />
      <section
        class="mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-10 md:pt-24 md:pb-14"
        aria-labelledby="hero-heading"
      >
        <div class="max-w-2xl">
          <h1
            id="hero-heading"
            class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
          >
            Give your agent an eye for the frontend.
          </h1>
          <p class="mt-3 text-sm text-muted max-w-lg leading-relaxed">
            Curated skills that give your agent craft: motion, interface feel, accessibility, and the framework idioms behind polished frontend work. Install once, every agent uses it.
          </p>

          <div class="mt-6 flex flex-wrap items-center gap-3">
            <UButton
              to="/skills"
              label="Browse skills"
              icon="i-lucide-search"
              size="sm"
              color="neutral"
            />
            <UButton
              to="/collections"
              label="Browse collections"
              icon="i-lucide-layers"
              size="sm"
              color="neutral"
              variant="ghost"
            />
          </div>

          <div class="mt-6 flex flex-col gap-1.5 max-w-xl">
            <span class="data-label">Already know what you want?</span>
            <div class="flex items-center gap-2">
              <code class="flex-1 truncate rounded bg-muted px-3 py-1.5 font-mono text-xs">{{ heroInstallCmd }}</code>
              <UButton
                :icon="heroCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="heroCopied ? 'Install command copied' : 'Copy install command'"
                @click="copyHero"
              />
            </div>
            <span aria-live="polite" class="sr-only">{{ heroCopied ? 'Install command copied to clipboard' : '' }}</span>
          </div>
        </div>
      </section>
    </div>

    <USeparator />

    <!-- Featured skill sets -->
    <section
      v-if="featuredCollections.length"
      id="featured-skill-sets"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="featured-skill-sets-heading"
    >
      <div class="flex items-end justify-between mb-2">
        <h2 id="featured-skill-sets-heading" class="section-label">
          Featured skill sets
        </h2>
        <UButton
          to="/collections"
          label="View all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
      <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
        Opinionated sets from developers worth trusting. Some are full stacks; some are one strong skill that earns the spotlight.
      </p>
      <ul class="space-y-10 list-none p-0">
        <li
          v-for="collection in featuredCollections"
          :key="`${collection.authorLogin}/${collection.slug}`"
        >
          <div class="flex items-end justify-between gap-3 mb-1">
            <div class="min-w-0">
              <NuxtLink
                :to="`/@${collection.authorLogin}/${collection.slug}`"
                class="group inline-flex items-baseline gap-2"
              >
                <h3 class="font-mono text-sm font-medium tracking-tight group-hover:text-muted transition-colors">
                  {{ collection.name }}
                </h3>
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="size-3.5 text-muted transition-colors group-hover:text-default"
                  aria-hidden="true"
                />
              </NuxtLink>
              <p class="mt-0.5 font-mono text-xs text-muted">
                {{ collection.skillCount }} {{ collection.skillCount === 1 ? 'skill' : 'skills' }}
              </p>
            </div>
          </div>
          <p
            v-if="collection.preamble"
            class="mb-3 text-sm text-muted leading-relaxed max-w-2xl"
          >
            {{ collection.preamble }}
          </p>

          <ul
            v-if="collection.skills.length"
            class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
          >
            <li
              v-for="skill in collection.skills"
              :key="`${collection.slug}:${skill.owner}/${skill.repo}/${skill.name ?? 'repo'}`"
            >
              <NuxtLink
                :to="featuredCollectionSkillPath(skill)"
                :aria-label="`${featuredCollectionSkillLabel(skill)} by ${skill.owner}`"
                class="flex h-full min-h-[5rem] flex-col rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
              >
                <p class="font-mono text-sm font-medium truncate">
                  {{ featuredCollectionSkillLabel(skill) }}
                </p>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <img
                    :src="`https://github.com/${skill.owner}.png?size=32`"
                    :alt="skill.owner"
                    width="16"
                    height="16"
                    class="size-4 shrink-0 rounded-full"
                    loading="lazy"
                  >
                  <p class="text-xs text-muted truncate">
                    {{ skill.owner }}/{{ skill.repo }}
                  </p>
                </div>
                <p
                  v-if="skill.reason"
                  class="mt-2 text-xs text-muted leading-relaxed line-clamp-2"
                >
                  {{ skill.reason }}
                </p>
              </NuxtLink>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <USeparator v-if="featuredCollections.length" />

    <!-- What are you trying to do? — pain-point cluster grid -->
    <section
      id="clusters"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="clusters-heading"
    >
      <div class="mb-2">
        <h2 id="clusters-heading" class="section-label">
          What are you trying to do?
        </h2>
      </div>
      <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
        Six things JS developers are tuning their agent for. Pick a problem, install a skill, restart your agent.
      </p>
      <HomepageClusterGrid />
    </section>

    <USeparator v-if="domainSections.length" />

    <!-- By domain — top-level dev categories from classifier -->
    <section
      v-if="domainSections.length"
      id="by-domain"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="by-domain-heading"
    >
      <div class="mb-6">
        <h2 id="by-domain-heading" class="section-label">
          By domain
        </h2>
        <p class="mt-1 text-sm text-muted max-w-lg leading-relaxed">
          Skills grouped by what part of dev work they level up.
        </p>
      </div>

      <div class="space-y-12">
        <div
          v-for="section in domainSections"
          :key="section.category"
        >
          <div class="flex items-end justify-between mb-3">
            <h3 class="font-mono text-base font-medium tracking-tight">
              {{ section.label }}
            </h3>
            <UButton
              :to="`/skills?category=${section.category}`"
              label="View all"
              color="neutral"
              variant="ghost"
              size="xs"
              trailing-icon="i-lucide-arrow-right"
            />
          </div>
          <p class="mb-4 text-sm text-muted max-w-lg leading-relaxed">
            {{ section.description }}
          </p>
          <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
            <li v-for="skill in section.items" :key="skill.slug">
              <SkillCard :skill show-tags show-owner-path />
            </li>
          </ul>
        </div>
      </div>
    </section>

    <USeparator />

    <!-- Recently updated official skills -->
    <section
      v-if="recentUpdates.length"
      id="recent-updates"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="recent-updates-heading"
    >
      <div class="flex items-end justify-between mb-2">
        <h2 id="recent-updates-heading" class="section-label">
          Recently updated
        </h2>
        <UButton
          to="/skills"
          label="Browse all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
      <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
        Skills whose SKILL.md changed lately. Watch a repo to get notified the next time it does.
      </p>

      <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
        <li
          v-for="item in recentUpdates.slice(0, 12)"
          :key="item.kind === 'repo' ? `repo:${item.owner}/${item.repo}` : `skill:${item.owner}/${item.name}`"
          :class="item.kind === 'repo' ? 'rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]' : ''"
        >
          <NuxtLink
            v-if="item.kind === 'repo'"
            :to="`/gh/${item.owner}/${item.repo}`"
            class="block"
          >
            <div class="flex items-center gap-2">
              <img
                :src="item.avatarUrl"
                :alt="`${item.owner} avatar`"
                class="size-5 rounded shrink-0 border border-default"
                width="20"
                height="20"
                loading="lazy"
              >
              <p class="font-mono text-sm font-medium truncate">
                {{ item.owner }}/{{ item.repo }}
              </p>
            </div>
            <p class="mt-2 text-xs text-muted">
              {{ item.skillCount }} skills updated
            </p>
            <p class="mt-2 font-mono text-xs text-muted line-clamp-2">
              {{ item.skills.slice(0, 4).map(s => `/${s.name}`).join(' · ') }}{{ item.skillCount > 4 ? ` · +${item.skillCount - 4} more` : '' }}
            </p>
            <p class="mt-2 font-mono text-xs text-muted">
              Updated {{ formatRelative(item.occurredAt) }}
            </p>
          </NuxtLink>
          <SkillCard
            v-else
            :skill="item"
            variant="grid"
            signal="none"
            show-owner-path
            timestamp-label="Updated"
            timestamp-format="relative"
          />
        </li>
      </ul>
    </section>

    <USeparator v-if="recentUpdates.length" />

    <!-- Watch for changes CTA -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="watch-heading"
    >
      <div class="rounded-lg border border-default p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 id="watch-heading" class="font-mono text-base font-medium">
            Watch your stack for changes
          </h2>
          <p class="mt-1 text-sm text-muted max-w-md">
            Sign in with GitHub, pick the repos you depend on, get a weekly digest when their skills change.
          </p>
        </div>
        <UButton
          to="/login?return_to=/onboarding/discover"
          label="Sign in with GitHub"
          icon="i-lucide-github"
          color="neutral"
          size="sm"
        />
      </div>
    </section>

    <USeparator />

    <LazyHomepageHowItWorks />
  </div>
</template>
