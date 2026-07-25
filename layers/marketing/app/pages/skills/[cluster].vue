<script setup lang="ts">
interface ClusterSkill {
  owner: string
  name: string
  repo: string
  displayName: string
  description: string | null
  installs: number
  stars: number
  modifiedAt: number | null
  slug: string
}

interface ClusterDetailResponse {
  cluster: {
    slug: string
    label: string
    icon: string
    userVoice: string
  }
  items: ClusterSkill[]
  total: number
  page: number
  pages: number
}

const route = useRoute()
const clusterSlug = computed(() => route.params.cluster as string)

const { data, error } = await useFetch<ClusterDetailResponse>(
  () => `/api/clusters/${clusterSlug.value}`,
)

if (error.value || !data.value)
  throw createError({ statusCode: 404, statusMessage: 'Unknown cluster' })

const cluster = computed(() => data.value!.cluster)
const skills = computed(() => data.value!.items)
const total = computed(() => data.value!.total)
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

const title = computed(() => `${cluster.value.label} · skilld`)
const description = computed(
  () => `${cluster.value.userVoice} ${total.value} curated skills.`,
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

defineOgImage('Page.takumi', {
  title: cluster.value.label,
  description: cluster.value.userVoice,
}, { alt: `${cluster.value.label} on skilld` })
</script>

<template>
  <div class="overflow-clip">
    <EditorialMasthead
      label="Outcome"
      :title="cluster.label"
      :description="cluster.userVoice"
      palette="rose"
      heading-id="cluster-heading"
    >
      <template #eyebrow>
        <NuxtLink
          to="/skills"
          class="section-label inline-flex min-h-11 items-center gap-2 transition-colors hover:text-default"
        >
          <UIcon name="i-lucide-arrow-left" class="size-3.5" aria-hidden="true" />
          Skills / outcome
        </NuxtLink>
      </template>

      <template #aside>
        <dl class="editorial-ledger">
          <div class="flex items-center justify-between gap-4 py-3">
            <dt class="data-label">
              Skills
            </dt>
            <dd class="font-mono text-sm tabular-nums">
              {{ total }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <dt class="data-label">
              Source repos
            </dt>
            <dd class="font-mono text-sm tabular-nums">
              {{ sourceCount }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <dt class="data-label">
              Maintainers
            </dt>
            <dd class="flex -space-x-2">
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
          label="Browse every outcome"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-right"
          class="min-h-11"
        />
        <UButton
          to="/collections"
          label="Find curated stacks"
          color="neutral"
          variant="ghost"
          class="min-h-11"
        />
      </div>
    </EditorialMasthead>

    <section
      v-if="leadingSkills.length"
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
            <p class="section-label">
              A quick first pass
            </p>
            <h2 id="starting-sequence-heading" class="cluster-section-title mt-4 max-w-[13ch]">
              Open these three first.
            </h2>
            <p class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
              Descriptions are brief. Open the repository for the full instructions.
            </p>
          </div>

          <ol class="editorial-ledger list-none p-0">
            <li v-for="(skill, index) in leadingSkills" :key="skill.slug">
              <NuxtLink
                :to="repoSkillPath(skill.owner, skill.repo, skill.name)"
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
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="cluster-directory-heading"
    >
      <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="section-label">
            All matching skills
          </p>
          <h2 id="cluster-directory-heading" class="cluster-section-title mt-3">
            Browse the rest.
          </h2>
          <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            These all target the same kind of work. We show install counts for context.
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
            signal="installs"
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
          label="Browse outcomes"
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

.cluster-sequence-number {
  padding-top: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
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
