<script setup lang="ts">
interface IndexCollection {
  name: string
  slug: string
  description: string
  preambleExcerpt?: string
  skillCount: number
  skills: string[]
  stacks: string[]
  updatedAt: string
  curator: { did: string, handle: string, displayName?: string, avatar?: string }
}

interface IndexResponse {
  featured: IndexCollection[]
  recent: IndexCollection[]
  total: number
  fetchedAt: string
}

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<IndexResponse>('/api/collections', {
  lazy: !isBot.value,
})

const title = 'Collections'
const description = 'Curated bundles of agent skills from developers on skilld. Install any collection with one command.'

useSeoMeta({
  title: `${title} — skilld`,
  description,
  ogTitle: title,
  ogDescription: description,
})

defineOgImage('Page.takumi', {
  title,
  description,
}, { alt: 'Collections directory on skilld' })

const copied = ref<string | null>(null)
function copyInstall(handle: string, slug: string) {
  navigator.clipboard.writeText(collectionInstallCmd(handle, slug))
  copied.value = `${handle}/${slug}`
  setTimeout(() => {
    if (copied.value === `${handle}/${slug}`)
      copied.value = null
  }, 2000)
}
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="collections-heading"
    >
      <h1
        id="collections-heading"
        class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
      >
        Collections
      </h1>
      <p class="mt-3 text-sm text-muted max-w-2xl leading-relaxed">
        Curated bundles of agent skills, assembled by developers whose taste you trust.
        Each collection is a signed, install-ready recipe; one command pulls the full set into your agent.
      </p>

      <dl
        v-if="data?.total"
        class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2"
      >
        <div class="data-label">
          <dt class="sr-only">
            Total collections
          </dt>
          <dd>{{ data.total }} {{ data.total === 1 ? 'collection' : 'collections' }}</dd>
        </div>
        <div
          v-if="data.fetchedAt"
          class="data-label"
        >
          <dt class="sr-only">
            Synced
          </dt>
          <dd>Synced {{ useTimeAgo(data.fetchedAt).value }}</dd>
        </div>
      </dl>
    </section>

    <USeparator />

    <span
      aria-live="polite"
      class="sr-only"
    >{{ copied ? 'Install command copied to clipboard' : '' }}</span>

    <!-- Loading -->
    <section
      v-if="status === 'pending'"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-busy="true"
    >
      <USkeleton class="h-4 w-24 mb-6" />
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div
          v-for="i in 4"
          :key="i"
          class="rounded-lg border border-default p-4"
        >
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="mt-2 h-3 w-full" />
          <USkeleton class="mt-1 h-3 w-3/4" />
          <div class="mt-3 flex items-center gap-2">
            <USkeleton class="size-5 rounded-full" />
            <USkeleton class="h-3 w-20" />
          </div>
        </div>
      </div>
    </section>

    <!-- Error -->
    <section
      v-else-if="error"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
    >
      <div
        role="alert"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load collections. Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          size="sm"
          variant="outline"
          color="neutral"
          class="mt-4"
          @click="refresh()"
        />
      </div>
    </section>

    <!-- Empty (no collections on the site yet) -->
    <section
      v-else-if="!data?.total"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
    >
      <CollectionsEmptyCTA />
    </section>

    <template v-else>
      <!-- Featured -->
      <section
        v-if="data.featured.length"
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="featured-collections-heading"
      >
        <div class="flex items-center justify-between mb-6">
          <h2
            id="featured-collections-heading"
            class="section-label"
          >
            Featured
          </h2>
        </div>

        <ul class="grid grid-cols-1 gap-3 md:grid-cols-2 list-none p-0">
          <li
            v-for="c in data.featured"
            :key="`${c.curator.did}/${c.slug}`"
          >
            <article class="group h-full rounded-lg border border-default p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]">
              <h3 class="font-mono text-sm font-medium">
                <NuxtLink
                  :to="`/people/${c.curator.handle}/${c.slug}`"
                  class="hover:text-muted transition-colors"
                >
                  {{ c.name }}
                </NuxtLink>
              </h3>
              <p
                v-if="c.preambleExcerpt || c.description"
                class="mt-2 text-xs text-muted leading-relaxed line-clamp-3"
              >
                {{ c.preambleExcerpt || c.description }}
              </p>

              <div
                v-if="c.stacks.length"
                class="mt-3 flex flex-wrap gap-1.5"
              >
                <UBadge
                  v-for="stack in c.stacks.slice(0, 4)"
                  :key="stack"
                  :label="stack"
                  variant="subtle"
                  color="primary"
                  size="xs"
                />
              </div>

              <div class="mt-4 flex items-center gap-2">
                <NuxtLink
                  :to="`/people/${c.curator.handle}`"
                  class="flex items-center gap-2 min-w-0 flex-1 text-xs hover:text-muted transition-colors"
                >
                  <img
                    v-if="c.curator.avatar"
                    :src="c.curator.avatar"
                    :alt="`Avatar for ${c.curator.displayName || c.curator.handle}`"
                    width="20"
                    height="20"
                    loading="lazy"
                    decoding="async"
                    class="size-5 rounded-full"
                  >
                  <span class="truncate">{{ c.curator.displayName || c.curator.handle }}</span>
                </NuxtLink>
                <span class="data-label shrink-0">{{ c.skillCount }} skills</span>
              </div>

              <div class="mt-3 flex items-center gap-2">
                <code class="flex-1 truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
                  {{ collectionInstallCmd(c.curator.handle, c.slug) }}
                </code>
                <UButton
                  :icon="copied === `${c.curator.handle}/${c.slug}` ? 'i-lucide-check' : 'i-lucide-copy'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="copied === `${c.curator.handle}/${c.slug}` ? 'Copied' : `Copy install command for ${c.name}`"
                  @click="copyInstall(c.curator.handle, c.slug)"
                />
              </div>
            </article>
          </li>
        </ul>
      </section>

      <USeparator v-if="data.featured.length && data.recent.length" />

      <!-- Recent -->
      <section
        v-if="data.recent.length"
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="recent-collections-heading"
      >
        <h2
          id="recent-collections-heading"
          class="section-label mb-6"
        >
          Recent
        </h2>

        <ul class="grid grid-cols-1 gap-3 md:grid-cols-2 list-none p-0">
          <li
            v-for="c in data.recent"
            :key="`${c.curator.did}/${c.slug}`"
          >
            <NuxtLink
              :to="`/people/${c.curator.handle}/${c.slug}`"
              class="group block h-full rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            >
              <h3 class="font-mono text-sm font-medium">
                {{ c.name }}
              </h3>
              <p
                v-if="c.preambleExcerpt || c.description"
                class="mt-1 text-xs text-muted leading-relaxed line-clamp-2"
              >
                {{ c.preambleExcerpt || c.description }}
              </p>
              <div class="mt-3 flex items-center gap-2">
                <img
                  v-if="c.curator.avatar"
                  :src="c.curator.avatar"
                  :alt="`Avatar for ${c.curator.displayName || c.curator.handle}`"
                  width="20"
                  height="20"
                  loading="lazy"
                  decoding="async"
                  class="size-5 rounded-full"
                >
                <span class="text-xs truncate flex-1">{{ c.curator.displayName || c.curator.handle }}</span>
                <span class="data-label shrink-0">{{ c.skillCount }} skills</span>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>

    <USeparator />

    <!-- CTA -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="collections-cta-heading"
    >
      <div class="rounded-lg border border-default p-6 sm:p-8 text-center">
        <h2
          id="collections-cta-heading"
          class="font-mono text-lg font-medium"
        >
          Have a stack worth sharing?
        </h2>
        <p class="mt-2 text-sm text-muted max-w-md mx-auto">
          Bundle the skills you reach for into a named collection. Anyone can install the full set with
          <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx -y skilld add @you/name</code>.
        </p>
        <div class="mt-5">
          <UButton
            to="/collections/new"
            label="Publish a collection"
            icon="i-lucide-plus"
            trailing-icon="i-lucide-arrow-right"
            size="sm"
          />
        </div>
      </div>
    </section>
  </div>
</template>
