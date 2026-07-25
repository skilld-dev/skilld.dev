<script setup lang="ts">
import CollectionAvatar from './_CollectionAvatar.vue'

interface IndexCollection {
  name: string
  slug: string
  preamble: string | null
  preambleExcerpt?: string | null
  skillCount: number
  skills: string[]
  updatedAt: number
  authorLogin: string
  authorDisplayName?: string | null
  authorAvatar?: string | null
}

interface IndexResponse {
  featured: IndexCollection[]
  recent: IndexCollection[]
  total: number
  fetchedAt: string
}

type CopyState
  = | { _tag: 'idle' }
    | { _tag: 'copied', key: string }
    | { _tag: 'error', key: string, message: string }

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<IndexResponse>('/api/collections', {
  lazy: !isBot.value,
})

const title = 'Collections'
const description = 'Installable skill collections with curator notes and links to every source.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

defineOgImage('Page.takumi', {
  title,
  description,
}, { alt: 'Collections directory on skilld' })

function collectionKey(collection: IndexCollection): string {
  return `${collection.authorLogin}/${collection.slug}`
}

const featuredCollections = computed(() => data.value?.featured.slice(0, 3) ?? [])
const leadCollection = computed(() => featuredCollections.value[0] ?? null)
const supportingCollections = computed(() => featuredCollections.value.slice(1, 3))
const directoryCollections = computed(() => {
  const seen = new Set(featuredCollections.value.map(collectionKey))

  return (data.value?.recent ?? []).filter((collection) => {
    const key = collectionKey(collection)
    if (seen.has(key))
      return false

    seen.add(key)
    return true
  })
})

const copyState = refAutoReset<CopyState>({ _tag: 'idle' }, 2500)

async function copyInstall(handle: string, slug: string) {
  const key = `${handle}/${slug}`
  const command = collectionInstallCmd(handle, slug)
  const writeText = navigator.clipboard?.writeText.bind(navigator.clipboard)

  if (!writeText) {
    copyState.value = {
      _tag: 'error',
      key,
      message: 'Could not copy. Select the command and copy it manually.',
    }
    return
  }

  copyState.value = await writeText(command)
    .then((): CopyState => ({ _tag: 'copied', key }))
    .catch((copyError): CopyState => {
      console.warn('[collections] Could not copy install command:', copyError)
      return {
        _tag: 'error',
        key,
        message: 'Could not copy. Select the command and copy it manually.',
      }
    })
}

function isCopied(collection: IndexCollection): boolean {
  return copyState.value._tag === 'copied'
    && copyState.value.key === collectionKey(collection)
}

const copyAnnouncement = computed(() => {
  if (copyState.value._tag === 'copied')
    return 'Install command copied to clipboard.'
  if (copyState.value._tag === 'error')
    return copyState.value.message
  return ''
})
</script>

<template>
  <div class="overflow-clip">
    <EditorialMasthead
      label="Collections"
      title="Install a set someone has already thought through."
      description="Every collection has a curator note and links to the original repositories. If it fits your setup, install the set with one command."
      palette="ember"
      heading-id="collections-heading"
    >
      <template #aside>
        <ol class="editorial-ledger list-none p-0">
          <li class="flex gap-3 py-3">
            <span class="data-label">01</span>
            <span class="text-sm leading-relaxed">Why did the curator group these skills?</span>
          </li>
          <li class="flex gap-3 py-3">
            <span class="data-label">02</span>
            <span class="text-sm leading-relaxed">Who maintains the source?</span>
          </li>
          <li class="flex gap-3 py-3">
            <span class="data-label">03</span>
            <span class="text-sm leading-relaxed">One command installs the set.</span>
          </li>
        </ol>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          to="/collections/new"
          label="Publish a collection"
          icon="i-lucide-plus"
          trailing-icon="i-lucide-arrow-right"
          class="min-h-11"
        />
        <UButton
          to="/skills"
          label="Find individual skills"
          color="neutral"
          variant="ghost"
          class="min-h-11"
        />
        <span v-if="data?.total" class="data-label sm:ml-auto">
          {{ data.total }} {{ data.total === 1 ? 'collection' : 'collections' }}
        </span>
      </div>
    </EditorialMasthead>

    <span aria-live="polite" class="sr-only">{{ copyAnnouncement }}</span>

    <section
      v-if="status === 'pending'"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-busy="true"
      aria-label="Loading collections"
    >
      <USkeleton class="h-4 w-32" />
      <USkeleton class="mt-4 h-12 w-2/3" />
      <div class="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.5fr)]">
        <USkeleton class="h-80 rounded-lg" />
        <div class="grid gap-3">
          <USkeleton class="h-36 rounded-lg" />
          <USkeleton class="h-36 rounded-lg" />
        </div>
      </div>
    </section>

    <section
      v-else-if="error"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
    >
      <div role="alert" class="editorial-state">
        <p class="font-medium">
          Couldn't load collections.
        </p>
        <p class="mt-1 text-base text-muted">
          Check your connection and try this directory again.
        </p>
        <UButton
          label="Retry collections"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
          @click="() => refresh()"
        />
      </div>
    </section>

    <section
      v-else-if="!data?.total"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
    >
      <div class="editorial-state" role="status">
        <p class="font-medium">
          No collections yet.
        </p>
        <p class="mt-1 max-w-xl text-base leading-relaxed text-muted">
          A collection groups skills for one job and explains why they work together.
        </p>
        <UButton
          to="/collections/new"
          label="Publish the first collection"
          trailing-icon="i-lucide-arrow-right"
          class="mt-4 min-h-11"
        />
      </div>
    </section>

    <template v-else>
      <section
        v-if="leadCollection"
        class="editorial-band border-b border-default bg-muted"
        aria-labelledby="featured-collections-heading"
      >
        <div
          class="editorial-atmosphere"
          data-palette="rose"
          data-geometry="wash"
          data-intensity="subtle"
          aria-hidden="true"
        />
        <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
          <div class="mb-8">
            <p class="section-label">
              Featured collections
            </p>
            <h2 id="featured-collections-heading" class="collections-section-title mt-3 max-w-[15ch]">
              Read the curator's note first.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Then check the source. If the set fits, the install command is ready.
            </p>
          </div>

          <div class="collections-featured-shell">
            <div class="collections-featured-layout">
              <article class="collection-lead">
                <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <p class="data-label">
                      Editor's starting point
                    </p>
                    <h3 class="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] text-balance">
                      <NuxtLink
                        :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
                        class="transition-colors hover:text-muted"
                      >
                        {{ leadCollection.name }}
                      </NuxtLink>
                    </h3>
                  </div>
                  <NuxtLink
                    :to="`/@${leadCollection.authorLogin}`"
                    class="flex shrink-0 items-center gap-3"
                  >
                    <CollectionAvatar
                      :src="leadCollection.authorAvatar"
                      :name="leadCollection.authorDisplayName || leadCollection.authorLogin"
                      size="lg"
                    />
                    <span class="min-w-0">
                      <span class="data-label block">Curated by</span>
                      <span class="mt-1 block truncate font-mono text-sm">@{{ leadCollection.authorLogin }}</span>
                    </span>
                  </NuxtLink>
                </div>

                <div v-if="leadCollection.preambleExcerpt || leadCollection.preamble" class="mt-6 border-t border-default pt-6">
                  <p class="data-label">
                    Why this set
                  </p>
                  <p class="mt-2 max-w-2xl text-base leading-relaxed text-muted text-pretty">
                    {{ leadCollection.preambleExcerpt || leadCollection.preamble }}
                  </p>
                </div>

                <div class="mt-6 border-t border-default pt-6">
                  <div class="flex items-center justify-between gap-4">
                    <p class="data-label">
                      Inside the collection
                    </p>
                    <p class="data-label">
                      {{ leadCollection.skillCount }} {{ leadCollection.skillCount === 1 ? 'skill' : 'skills' }}
                    </p>
                  </div>
                  <ul v-if="leadCollection.skills.length" class="mt-3 grid grid-cols-1 border-y border-default sm:grid-cols-2">
                    <li
                      v-for="skill in leadCollection.skills.slice(0, 6)"
                      :key="skill"
                      class="border-b border-default px-1 py-3 font-mono text-sm last:border-b-0 sm:odd:border-r"
                    >
                      {{ skill }}
                    </li>
                  </ul>
                </div>

                <div class="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <code
                    tabindex="0"
                    class="block min-w-0 overflow-x-auto rounded-lg border border-default bg-muted px-3 py-3 font-mono text-sm whitespace-nowrap"
                  >{{ collectionInstallCmd(leadCollection.authorLogin, leadCollection.slug) }}</code>
                  <UButton
                    :icon="isCopied(leadCollection) ? 'i-lucide-check' : 'i-lucide-copy'"
                    :label="isCopied(leadCollection) ? 'Copied' : 'Copy command'"
                    color="neutral"
                    variant="outline"
                    class="min-h-11 justify-center"
                    @click="copyInstall(leadCollection.authorLogin, leadCollection.slug)"
                  />
                </div>

                <UButton
                  :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
                  label="Inspect this collection"
                  trailing-icon="i-lucide-arrow-right"
                  class="mt-5 min-h-11"
                />
              </article>

              <div v-if="supportingCollections.length" class="collection-supporting">
                <NuxtLink
                  v-for="collection in supportingCollections"
                  :key="collectionKey(collection)"
                  :to="`/@${collection.authorLogin}/${collection.slug}`"
                  class="collection-supporting-row group"
                >
                  <span class="flex items-center justify-between gap-4">
                    <span class="data-label">Supporting pick</span>
                    <UIcon
                      name="i-lucide-arrow-up-right"
                      class="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </span>
                  <span class="mt-4 block text-xl font-semibold leading-tight tracking-[-0.025em]">
                    {{ collection.name }}
                  </span>
                  <span
                    v-if="collection.preambleExcerpt || collection.preamble"
                    class="mt-2 block text-base leading-relaxed text-muted text-pretty"
                  >
                    {{ collection.preambleExcerpt || collection.preamble }}
                  </span>
                  <span class="mt-5 flex items-center gap-2">
                    <CollectionAvatar
                      :src="collection.authorAvatar"
                      :name="collection.authorDisplayName || collection.authorLogin"
                      size="sm"
                    />
                    <span class="font-mono text-xs">@{{ collection.authorLogin }}</span>
                    <span class="data-label ml-auto">{{ collection.skillCount }} skills</span>
                  </span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="directoryCollections.length"
        class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
        aria-labelledby="collections-directory-heading"
      >
        <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="section-label">
              Collection directory
            </p>
            <h2 id="collections-directory-heading" class="collections-section-title mt-3 max-w-[16ch]">
              More collections
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              These were updated most recently. The curator's note stays visible.
            </p>
          </div>
          <p class="data-label">
            {{ directoryCollections.length }} more
          </p>
        </div>

        <ul class="editorial-ledger list-none p-0">
          <li v-for="collection in directoryCollections" :key="collectionKey(collection)">
            <NuxtLink
              :to="`/@${collection.authorLogin}/${collection.slug}`"
              class="collection-directory-row group"
            >
              <CollectionAvatar
                :src="collection.authorAvatar"
                :name="collection.authorDisplayName || collection.authorLogin"
              />
              <span class="min-w-0">
                <span class="block text-lg font-semibold tracking-tight">{{ collection.name }}</span>
                <span
                  v-if="collection.preambleExcerpt || collection.preamble"
                  class="mt-1 block text-base leading-relaxed text-muted text-pretty"
                >
                  {{ collection.preambleExcerpt || collection.preamble }}
                </span>
                <span class="mt-2 block font-mono text-xs text-muted">@{{ collection.authorLogin }}</span>
              </span>
              <span class="data-label whitespace-nowrap">{{ collection.skillCount }} skills</span>
              <UIcon
                name="i-lucide-arrow-up-right"
                class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>

    <section
      class="editorial-band border-t border-default"
      aria-labelledby="collections-cta-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p class="section-label">
              Your setup
            </p>
            <h2 id="collections-cta-heading" class="collections-section-title mt-3 max-w-[14ch]">
              Got a setup others could use?
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Share the skills you use for one workflow. Add a short note about why they work together.
            </p>
          </div>
          <UButton
            to="/collections/new"
            label="Publish a collection"
            icon="i-lucide-plus"
            trailing-icon="i-lucide-arrow-right"
            size="lg"
            class="min-h-11 shrink-0 self-start lg:self-end"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.collections-section-title {
  font-size: clamp(2.25rem, 1.85rem + 1.8vw, 3.5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-wrap: balance;
}

.collections-featured-shell {
  container-name: featured-collections;
  container-type: inline-size;
}

.collections-featured-layout {
  display: grid;
  gap: 0.75rem;
}

.collection-lead,
.collection-supporting-row {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.collection-lead {
  padding: 1.25rem;
}

.collection-supporting {
  display: grid;
  gap: 0.75rem;
}

.collection-supporting-row {
  display: flex;
  min-height: 12rem;
  flex-direction: column;
  padding: 1.25rem;
  transition: border-color 200ms ease-out, background-color 200ms ease-out;
}

.collection-directory-row {
  display: grid;
  min-height: 7.5rem;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: start;
  gap: 1rem;
  padding-block: 1.25rem;
  color: var(--ui-text);
}

@container featured-collections (min-width: 52rem) {
  .collections-featured-layout {
    grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.5fr);
  }

  .collection-lead {
    padding: 1.5rem;
  }
}

@media (max-width: 39.999rem) {
  .collection-directory-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .collection-directory-row > .data-label {
    grid-column: 2;
  }
}

@media (hover: hover) {
  .collection-supporting-row:hover {
    border-color: var(--ui-text-muted);
    background: var(--ui-bg-muted);
  }
}
</style>
