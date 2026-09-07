<script setup lang="ts">
import { resolveClusterViewState } from '../../utils/cluster-view-state'

interface ClusterSkill {
  owner: string
  name: string
  repo: string
  displayName: string
  description: string | null
  stars: number
  modifiedAt: number | null
  slug: string
  registryPath: string
}

interface ClusterDetailResponse {
  cluster: {
    slug: string
    label: string
    icon: string
    userVoice: string
    /** Keyword-shaped <title>; the H1 keeps `label`. */
    seoTitle: string
    seoDescription: string
    /** Preamble inherited from the collection merged into this category. */
    curatorNote: string | null
  }
  items: ClusterSkill[]
  total: number
  page: number
  pages: number
}

const route = useRoute()
const clusterSlug = computed(() => route.params.cluster as string)

// Blocking, not lazy. `useLazyFetch` does not hold SSR, so the server rendered
// this page with `data === null`: every category served the fallback title
// ("Outcome skills", now "Agent skills by category") and, once the thin-category
// guard landed, `noindex` as well. Only the client filled in the real title
// after hydration, which is precisely what a crawler never runs. This page
// exists to rank, so it has to be right in the server response.
// `await`, and that word is the whole fix. Without it `setup` stays synchronous,
// so Vue renders before the request settles and the result only reaches the
// payload: the server response had the data embedded but no <h1> and the
// fallback <title>, plus `noindex` once the thin-category guard landed. Only
// hydration repaired it, which is exactly what a crawler does not do.
//
// Suspense holds the render while this resolves, so the server response now
// carries the real title and skills. The loading branch below is still reached
// on client-side navigation.
const { data, error, status, refresh } = await useFetch<ClusterDetailResponse>(
  () => `/api/clusters/${clusterSlug.value}`,
)

const clusterView = computed(() => resolveClusterViewState({
  data: data.value,
  error: error.value,
  status: status.value,
}))

watch(clusterView, (view) => {
  if (view._tag === 'not-found')
    showError(createError({ statusCode: 404, statusMessage: 'Unknown cluster' }))
}, { immediate: true })

const clusterData = computed(() =>
  clusterView.value._tag === 'ready' ? clusterView.value.data : null,
)
const skills = computed(() => clusterData.value?.items ?? [])
const total = computed(() => clusterData.value?.total ?? 0)
const leadingSkills = computed(() => skills.value.slice(0, 3))
const remainingSkills = computed(() => skills.value.slice(3))
const visibleCount = ref(15)
const visibleSkills = computed(() => remainingSkills.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < remainingSkills.value.length)
const sourceCount = computed(() =>
  new Set(skills.value.map(skill => `${skill.owner}/${skill.repo}`)).size,
)
const maintainerOwners = computed(() =>
  [...new Set(skills.value.map(skill => skill.owner))].slice(0, 4),
)

function showMore() {
  visibleCount.value += 15
}

// The <title> is keyword-shaped ("Agent Skills for UI and Design") while the
// H1 below keeps the editorial label. VISION principle 6 grants that carve-out
// for search surfaces only; it never reaches product UI. The skill count is
// appended rather than baked into seoDescription so the copy stays honest when
// a category is thin.
// No ` · skilld` suffix here: a global titleTemplate already appends it, and
// adding one produced "... · skilld · skilld".
const title = computed(() =>
  clusterData.value
    ? clusterData.value.cluster.seoTitle
    : 'Agent skills by track',
)
const description = computed(
  () => clusterData.value
    ? `${clusterData.value.cluster.seoDescription} ${total.value} curated skills.`
    : 'Browse curated agent skills grouped by the work you are doing.',
)

// The 2026-06 suppression came from publishing pages before they had anything
// on them. A category admitted ahead of its curation is exactly that shape, so
// it stays out of the index until a curator has filled it. Under the threshold
// the page still renders and still serves internal nav; it just does not ask
// Google to rank an empty list.
const MIN_INDEXABLE_SKILLS = 3

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  robots: () => (total.value >= MIN_INDEXABLE_SKILLS ? 'index,follow' : 'noindex,follow'),
})

useHead({
  link: [{
    rel: 'canonical',
    href: computed(() => `https://skilld.dev/skills/${clusterSlug.value}`),
  }],
})

defineOgImage('Page.takumi', {
  title: () => clusterData.value?.cluster.label ?? 'Agent skills',
  description: () => clusterData.value?.cluster.userVoice ?? 'Browse skills by track.',
}, { alt: () => `${clusterData.value?.cluster.label ?? 'Agent skills'} on skilld` })
</script>

<template>
  <div class="overflow-clip">
    <section
      v-if="clusterView._tag === 'loading'"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-busy="true"
      aria-label="Loading outcome skills"
    >
      <div class="editorial-state">
        <USkeleton class="h-4 w-28" />
        <USkeleton class="mt-4 h-10 w-72 max-w-full" />
        <USkeleton class="mt-4 h-4 w-full max-w-xl" />
      </div>
    </section>

    <section
      v-else-if="clusterView._tag === 'error'"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="cluster-error-heading"
    >
      <div class="editorial-state" role="alert">
        <h1 id="cluster-error-heading" class="text-xl font-semibold">
          Could not load this outcome.
        </h1>
        <p class="mt-2 text-base text-muted">
          Check your connection and try this outcome again.
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <UButton
            label="Retry outcome"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="() => refresh()"
          />
          <UButton
            to="/skills"
            label="Browse outcomes"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </section>

    <CompactPageHeader
      v-else-if="clusterData"
      :title="clusterData.cluster.label"
      :description="clusterData.cluster.userVoice"
      heading-id="cluster-heading"
    >
      <template #aside>
        <dl class="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
          <div>
            <dt class="data-label">
              Skills
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ total }}
            </dd>
          </div>
          <div>
            <dt class="data-label">
              Source repos
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ sourceCount }}
            </dd>
          </div>
          <div>
            <dt class="data-label">
              Maintainers
            </dt>
            <dd class="mt-1 flex -space-x-2">
              <img
                v-for="owner in maintainerOwners"
                :key="owner"
                :src="`https://github.com/${owner}.png?size=64`"
                alt=""
                width="32"
                height="32"
                class="size-8 rounded-full border-2 border-[var(--ui-bg)] bg-muted"
                loading="lazy"
                decoding="async"
              >
            </dd>
          </div>
        </dl>
      </template>

      <div class="flex flex-wrap gap-3">
        <UButton
          to="/skills"
          label="Browse tracks"
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-left"
          class="min-h-11"
        />
      </div>
    </CompactPageHeader>

    <section
      v-if="clusterData && leadingSkills.length"
      class="editorial-band border-b border-default bg-muted"
      aria-labelledby="starting-sequence-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-12">
          <div>
            <h2 id="starting-sequence-heading" class="cluster-section-title max-w-[13ch]">
              Three skills to inspect.
            </h2>
            <p v-if="clusterData.cluster.curatorNote" class="data-label mt-3">
              Curated by Harlan
            </p>
            <p class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
              {{
                clusterData.cluster.curatorNote
                  ?? 'Descriptions are brief. Open the repository for the full instructions.'
              }}
            </p>
          </div>

          <ol class="editorial-ledger list-none p-0">
            <li v-for="(skill, index) in leadingSkills" :key="skill.slug">
              <NuxtLink
                :to="skill.registryPath"
                class="cluster-sequence-row group"
              >
                <span class="cluster-sequence-number">{{ String(index + 1).padStart(2, '0') }}</span>
                <img
                  :src="`https://github.com/${skill.owner}.png?size=80`"
                  alt=""
                  width="40"
                  height="40"
                  class="size-10 rounded-full border-2 border-[var(--ui-bg)] bg-muted outline outline-1 outline-[var(--ui-border)]"
                  loading="lazy"
                  decoding="async"
                >
                <span class="min-w-0">
                  <span class="block font-mono text-base font-medium">/{{ skill.name }}</span>
                  <span class="mt-1 block text-sm text-muted">{{ skill.owner }}/{{ skill.repo }}</span>
                  <span v-if="skill.description" class="mt-2 block text-base leading-relaxed text-muted text-pretty">
                    {{ skill.description }}
                  </span>
                </span>
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </NuxtLink>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <section
      v-if="clusterData"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="cluster-directory-heading"
    >
      <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="cluster-directory-heading" class="cluster-section-title">
            Browse the rest.
          </h2>
          <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            These all target the same kind of work.
          </p>
        </div>
        <p class="data-label">
          Showing {{ visibleSkills.length + leadingSkills.length }} of {{ total }}
        </p>
      </div>

      <ul
        v-if="visibleSkills.length"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
      >
        <li v-for="skill in visibleSkills" :key="skill.slug">
          <SkillCard
            :skill
            variant="grid"
            signal="stars"
            show-owner-path
          />
        </li>
      </ul>

      <div v-else-if="!leadingSkills.length" class="editorial-state" role="status">
        <p class="font-medium">
          No skills here yet.
        </p>
        <p class="mt-1 text-base text-muted">
          Try another outcome. This one has no indexed skills yet.
        </p>
        <UButton
          to="/skills"
          label="Browse tracks"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
        />
      </div>

      <div v-if="hasMore" class="mt-8 flex justify-center">
        <UButton
          label="Show 15 more"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-chevron-down"
          class="min-h-11"
          @click="showMore"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.cluster-section-title {
  font-size: clamp(2.25rem, 1.85rem + 1.8vw, 3.5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-wrap: balance;
}

.cluster-sequence-row {
  display: grid;
  min-height: 8rem;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 1rem;
  padding-block: 1.25rem;
  color: var(--ui-text);
}

/* Printed in the dot grid and inked rose, the same numerals the homepage
   uses for the taste test. One brand, whichever page you land on. */
.cluster-sequence-number {
  padding-top: 0.7rem;
  font-family: var(--font-mono);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ui-primary);
  opacity: 0.85;
  mask-image: radial-gradient(circle, #000 1.1px, transparent 1.4px);
  mask-size: 3px 3px;
}

@media (max-width: 39.999rem) {
  .cluster-sequence-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .cluster-sequence-row > img {
    display: none;
  }
}
</style>
