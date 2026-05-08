<script setup lang="ts">
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

const heroInstallCmd = 'npx skilld add gh:nuxt/nuxt'
const heroCopied = ref(false)
function copyHero() {
  navigator.clipboard.writeText(heroInstallCmd)
  heroCopied.value = true
  setTimeout(() => { heroCopied.value = false }, 2000)
}

const { data: updatesData } = useFetch('/api/feed/recent-updates')
const recentUpdates = computed(() => updatesData.value?.items ?? [])

const { data: collectionsData } = useFetch('/api/collections/featured')
const featuredCollections = computed(() => collectionsData.value?.items ?? [])

function formatRelative(ts: number): string {
  const diff = Date.now() - ts * 1000
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
            Curated skills for AI agents
          </h1>
          <p class="mt-3 text-sm text-muted max-w-lg leading-relaxed">
            A curated registry of agent skills for the npm packages and GitHub repos you actually use.
            One install command, every agent. Get notified when they change.
          </p>

          <div class="mt-6 flex items-center gap-2 max-w-xl">
            <code class="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs sm:text-sm">{{ heroInstallCmd }}</code>
            <UButton
              :icon="heroCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="heroCopied ? 'Copied' : 'Copy'"
              size="sm"
              color="neutral"
              variant="outline"
              :aria-label="heroCopied ? 'Install command copied' : 'Copy install command'"
              @click="copyHero"
            />
          </div>
          <span aria-live="polite" class="sr-only">{{ heroCopied ? 'Install command copied to clipboard' : '' }}</span>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <UButton
              to="/skills"
              label="Browse skills"
              icon="i-lucide-search"
              size="sm"
              color="neutral"
              variant="ghost"
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
        </div>
      </section>
    </div>

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
          :key="`${item.owner}/${item.name}`"
          class="rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]"
        >
          <NuxtLink :to="`/gh/${item.slug}`" class="block">
            <p class="font-mono text-sm font-medium truncate">
              {{ item.displayName }}
            </p>
            <p class="font-mono text-xs text-muted truncate">
              {{ item.owner }}/{{ item.repo }}
            </p>
            <p
              v-if="item.description"
              class="mt-2 text-xs text-muted line-clamp-2"
            >
              {{ item.description }}
            </p>
            <p class="mt-2 font-mono text-xs text-muted">
              Updated {{ formatRelative(item.occurredAt) }}
            </p>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <USeparator v-if="recentUpdates.length" />

    <!-- Featured collections -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="collections-heading"
    >
      <div class="flex items-end justify-between mb-2">
        <h2 id="collections-heading" class="section-label">
          Featured collections
        </h2>
        <UButton
          v-if="featuredCollections.length"
          to="/collections"
          label="View all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
      <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
        Hand-picked skill bundles, one install command per collection.
      </p>

      <div
        v-if="featuredCollections.length"
        class="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <NuxtLink
          v-for="c in featuredCollections"
          :key="`${c.authorLogin}/${c.slug}`"
          :to="`/@${c.authorLogin}/${c.slug}`"
          class="rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]"
        >
          <h3 class="font-mono text-sm font-medium">
            {{ c.name }}
          </h3>
          <p class="mt-1 font-mono text-xs text-muted">
            @{{ c.authorLogin }}
          </p>
          <p
            v-if="c.preamble"
            class="mt-2 text-xs text-muted line-clamp-2"
          >
            {{ c.preamble }}
          </p>
          <p class="mt-2 font-mono text-xs text-muted">
            {{ c.skillCount }} {{ c.skillCount === 1 ? 'skill' : 'skills' }}
          </p>
        </NuxtLink>
      </div>

      <p
        v-else
        class="text-sm text-muted"
      >
        No featured collections yet.
      </p>
    </section>

    <USeparator />

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
          label="Sign in with GitHub (coming soon)"
          icon="i-lucide-github"
          color="neutral"
          size="sm"
          disabled
        />
      </div>
    </section>

    <USeparator />

    <LazyHomepageHowItWorks />
  </div>
</template>
