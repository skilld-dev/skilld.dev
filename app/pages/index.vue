<script setup lang="ts">
defineOgImage('Splash.takumi', {}, { alt: 'skilld — curated agent skills from trusted open-source developers' })

const authModalOpen = inject<Ref<boolean>>('authModalOpen', ref(false))
const { user, isAuthenticated } = useAuth()
const { stage } = useOnboarding()
const { data: followingData, execute: fetchFollowing } = useFollowingCurators()

// Fetch real homepage data from curator index + PDS
const { data: homepageData } = useFetch('/api/homepage')

const popularSkills = computed(() => homepageData.value?.popularSkills ?? [])
const featuredOrgs = computed(() => homepageData.value?.featuredOrgs ?? [])
const featuredUsers = computed(() => homepageData.value?.featuredUsers ?? [])

function skillSlug(skill: { owner: string, repo: string, name: string }) {
  return `${skill.owner}/${skill.repo === 'skills' ? skill.name : `${skill.repo}/${skill.name}`}`
}

function skillInstallCmd(skill: { owner: string, repo: string, name: string }) {
  return gitInstallCmd(skill.owner, skill.repo, skill.name)
}

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return `/skills/${skillSlug(skill)}`
}

// Fetch following curators when authenticated
watch(isAuthenticated, (authed) => {
  if (authed)
    fetchFollowing()
}, { immediate: true })

const stats = computed(() => homepageData.value?.stats ?? { curators: 0, collections: 0, skills: 0 })

// Copy collection install command
const copiedCollectionSlug = ref<string | null>(null)
function copyCollectionCmd(handle: string, slug: string) {
  navigator.clipboard.writeText(collectionInstallCmd(handle, slug))
  copiedCollectionSlug.value = slug
  setTimeout(() => {
    if (copiedCollectionSlug.value === slug)
      copiedCollectionSlug.value = null
  }, 2000)
}

const expandedCollection = ref<string | null>(null)

function toggleCollection(slug: string) {
  expandedCollection.value = expandedCollection.value === slug ? null : slug
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
            Curated agent skills from trusted open-source developers
          </h1>
          <p class="mt-3 text-sm text-muted max-w-lg leading-relaxed">
            Developers curate the skills that power their workflow.
            Follow curators, install collections, keep your agent current.
          </p>

          <div class="mt-6 flex flex-wrap items-center gap-3">
            <UButton
              to="/people"
              label="Browse curators"
              icon="i-lucide-users"
              size="sm"
            />
            <UButton
              to="/skills"
              label="Browse skills"
              icon="i-lucide-search"
              size="sm"
              color="neutral"
              variant="outline"
            />
          </div>
        </div>

        <dl class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div class="data-label">
            <dt class="sr-only">
              Curators
            </dt>
            <dd>{{ stats.curators }} curators</dd>
          </div>
          <div class="data-label">
            <dt class="sr-only">
              Collections
            </dt>
            <dd>{{ stats.collections }} collections</dd>
          </div>
          <div class="data-label">
            <dt class="sr-only">
              Skills
            </dt>
            <dd>{{ stats.skills }} skills</dd>
          </div>
        </dl>
      </section>
    </div>

    <!-- Curators you follow (authenticated only) -->
    <template v-if="followingData?.curators.length">
      <USeparator />

      <section
        class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
        aria-labelledby="following-heading"
      >
        <h2
          id="following-heading"
          class="section-label mb-6"
        >
          Curators you follow
        </h2>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="curator in followingData.curators"
            :key="curator.did"
            :to="`/people/${curator.handle}`"
            :aria-label="`${curator.displayName || curator.handle}, ${curator.collectionCount} collections`"
            class="group flex items-center gap-3 rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <img
              v-if="curator.avatar"
              :src="curator.avatar"
              :alt="`Avatar for ${curator.displayName || curator.handle}`"
              width="36"
              height="36"
              loading="lazy"
              decoding="async"
              class="size-9 rounded-full"
            >
            <div
              v-else
              class="flex size-9 items-center justify-center rounded-full bg-muted"
            >
              <UIcon
                name="i-lucide-user"
                class="size-4 text-muted"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ curator.displayName || curator.handle }}
              </p>
              <p class="font-mono text-xs text-muted">
                @{{ curator.handle }}
              </p>
              <CuratorLabels
                v-if="curator.labels?.length"
                :labels="curator.labels"
                class="mt-1.5"
              />
            </div>
            <span class="data-label shrink-0">{{ curator.collectionCount }} {{ curator.collectionCount === 1 ? 'collection' : 'collections' }}</span>
          </NuxtLink>
        </div>
      </section>
    </template>

    <USeparator />

    <!-- Official skills: devs -->
    <section
      v-if="featuredUsers.length"
      id="official-users"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="official-users-heading"
    >
      <div class="flex items-end justify-between mb-2">
        <h2
          id="official-users-heading"
          class="section-label"
        >
          Official skills · Devs
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
        Skill repos maintained by individual developers. Their personal stack, made installable.
      </p>

      <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
        <li v-for="entry in featuredUsers" :key="`user-${entry.owner}`">
          <NuxtLink
            :to="`/orgs/${entry.owner}`"
            :aria-label="`${entry.owner}/${entry.repo}, ${entry.totalSkills} skills`"
            class="group flex items-center gap-3 rounded-lg border border-default p-3 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <img
              :src="`https://github.com/${entry.owner}.png?size=64`"
              :alt="`${entry.owner} avatar`"
              width="36"
              height="36"
              loading="lazy"
              decoding="async"
              class="size-9 shrink-0 rounded-full bg-muted"
            >
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-medium truncate">
                {{ entry.owner }}
              </p>
              <p class="font-mono text-xs text-muted truncate">
                /{{ entry.repo }}
              </p>
            </div>
            <span class="data-label shrink-0">{{ entry.totalSkills }} {{ entry.totalSkills === 1 ? 'skill' : 'skills' }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <USeparator v-if="featuredUsers.length" />

    <!-- Official skills: orgs -->
    <section
      v-if="featuredOrgs.length"
      id="official-orgs"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="official-orgs-heading"
    >
      <div class="flex items-end justify-between mb-2">
        <h2
          id="official-orgs-heading"
          class="section-label"
        >
          Official skills · Orgs
        </h2>
        <UButton
          to="/skills?official=true"
          label="View all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
      <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
        Skills published by the companies that build the underlying technology.
      </p>

      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 list-none p-0">
        <li v-for="entry in featuredOrgs" :key="`org-${entry.owner}`">
          <NuxtLink
            :to="`/orgs/${entry.owner}`"
            :aria-label="`${entry.owner}, ${entry.totalSkills} skills`"
            class="group flex items-center gap-3 rounded-lg border border-default p-3 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <img
              :src="`https://github.com/${entry.owner}.png?size=64`"
              :alt="`${entry.owner} avatar`"
              width="32"
              height="32"
              loading="lazy"
              decoding="async"
              class="size-8 shrink-0 rounded bg-muted"
            >
            <div class="min-w-0 flex-1">
              <p class="font-mono text-xs font-medium truncate">
                {{ entry.owner }}
              </p>
              <p class="text-xs text-muted">
                {{ entry.totalSkills }} {{ entry.totalSkills === 1 ? 'skill' : 'skills' }}
              </p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <USeparator v-if="featuredOrgs.length" />

    <!-- Popular Skills -->
    <section
      v-if="popularSkills.length"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="popular-skills-heading"
    >
      <div class="flex items-center justify-between mb-6">
        <h2
          id="popular-skills-heading"
          class="section-label"
        >
          Popular skills
        </h2>
        <UButton
          to="/skills"
          label="View all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>

      <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
        <li v-for="skill in popularSkills" :key="skill.slug">
          <NuxtLink
            :to="skillPath(skill)"
            :aria-label="`${skill.name} by ${skill.owner}`"
            class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <img
                  v-if="skill.official"
                  :src="`https://github.com/${skill.owner}.png?size=32`"
                  :alt="skill.owner"
                  class="size-4 shrink-0 rounded-full"
                  loading="lazy"
                >
                <p class="font-mono text-sm font-medium truncate">
                  {{ skill.name }}
                </p>
                <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
              </div>
              <p class="mt-0.5 text-xs text-muted truncate">
                {{ skill.owner }}{{ skill.repo !== 'skills' ? `/${skill.repo}` : '' }}
              </p>
            </div>
            <code class="mt-3 block truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
              {{ skillInstallCmd(skill) }}
            </code>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <USeparator />

    <!-- Collections -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="collections-heading"
    >
      <div class="flex items-center justify-between mb-6">
        <h2
          id="collections-heading"
          class="section-label"
        >
          Collections
        </h2>
        <UButton
          v-if="homepageData?.collections.length"
          to="/collections"
          label="View all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>

      <span
        aria-live="polite"
        class="sr-only"
      >{{ copiedCollectionSlug ? 'Install command copied to clipboard' : '' }}</span>

      <!-- Real collections from PDS -->
      <div
        v-if="homepageData?.collections.length"
        class="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <article
          v-for="collection in homepageData.collections"
          :key="`${collection.curator.handle}/${collection.slug}`"
          class="rounded-lg border border-default transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
        >
          <div class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="font-mono text-sm font-medium">
                  <NuxtLink
                    :to="`/people/${collection.curator.handle}/${collection.slug}`"
                    class="hover:text-muted transition-colors"
                  >
                    {{ collection.name }}
                  </NuxtLink>
                </h3>
                <p class="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                  {{ collection.description }}
                </p>
              </div>
              <button
                class="mt-0.5 shrink-0 rounded p-1 text-muted transition-colors hover:text-default"
                :aria-label="`${expandedCollection === collection.slug ? 'Collapse' : 'Expand'} ${collection.name}`"
                :aria-expanded="expandedCollection === collection.slug"
                @click="toggleCollection(collection.slug)"
              >
                <UIcon
                  :name="expandedCollection === collection.slug ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div class="mt-3 flex items-center gap-3">
              <img
                v-if="collection.curator.avatar"
                :src="collection.curator.avatar"
                :alt="`Avatar for ${collection.curator.displayName || collection.curator.handle}`"
                width="20"
                height="20"
                loading="lazy"
                decoding="async"
                class="size-5 rounded-full"
              >
              <span class="text-xs">{{ collection.curator.displayName || collection.curator.handle }}</span>
              <span class="data-label ml-auto">{{ collection.skillCount }} skills</span>
            </div>
          </div>

          <div
            v-if="expandedCollection === collection.slug"
            class="border-t border-default px-4 py-3"
          >
            <div class="flex flex-wrap gap-1.5">
              <UBadge
                v-for="skill in collection.skills"
                :key="skill"
                :label="skill"
                variant="subtle"
                color="neutral"
                size="xs"
              />
            </div>

            <div class="mt-3 flex items-center gap-2">
              <code class="flex-1 truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
                {{ collectionInstallCmd(collection.curator.handle, collection.slug) }}
              </code>
              <UButton
                :icon="copiedCollectionSlug === collection.slug ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="copiedCollectionSlug === collection.slug ? 'Copied' : `Copy install command for ${collection.name}`"
                @click="copyCollectionCmd(collection.curator.handle, collection.slug)"
              />
            </div>
          </div>
        </article>
      </div>

      <!-- Empty state -->
      <CollectionsEmptyCTA v-else />
    </section>

    <USeparator v-if="homepageData?.curators.length" />

    <!-- Curators (compact) -->
    <section
      v-if="homepageData?.curators.length"
      id="curators"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="curators-heading"
    >
      <div class="flex items-end justify-between mb-2">
        <h2
          id="curators-heading"
          class="section-label"
        >
          Curators
        </h2>
        <UButton
          to="/people"
          label="View all"
          color="neutral"
          variant="ghost"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
      <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
        Developers sharing their personal stacks via Atmosphere.
      </p>

      <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
        <li v-for="curator in homepageData.curators.slice(0, 6)" :key="curator.did">
          <NuxtLink
            :to="`/people/${curator.handle}`"
            :aria-label="`${curator.displayName || curator.handle}, ${curator.collectionCount} collections`"
            class="group flex items-center gap-3 rounded-lg border border-default p-3 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <img
              v-if="curator.avatar"
              :src="curator.avatar"
              :alt="`Avatar for ${curator.displayName || curator.handle}`"
              width="32"
              height="32"
              loading="lazy"
              decoding="async"
              class="size-8 shrink-0 rounded-full"
            >
            <div
              v-else
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"
            >
              <UIcon
                name="i-lucide-user"
                class="size-4 text-muted"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ curator.displayName || curator.handle }}
              </p>
              <p class="font-mono text-xs text-muted truncate">
                @{{ curator.handle }}
              </p>
            </div>
            <span class="data-label shrink-0">{{ curator.collectionCount }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <USeparator />

    <LazyHomepageHowItWorks />

    <USeparator />

    <!-- CTA: stage-aware -->
    <section
      v-if="stage !== 'curator'"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="cta-heading"
    >
      <div class="rounded-lg border border-default p-6 sm:p-8 text-center">
        <!-- Browse: not signed in -->
        <template v-if="stage === 'browse'">
          <h2
            id="cta-heading"
            class="font-mono text-lg font-medium"
          >
            Share your skills
          </h2>
          <p class="mt-2 text-sm text-muted max-w-md mx-auto">
            Add the package skills you use every day, publish them so anyone can run <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx -y skilld add @you</code> to install your setup.
          </p>
          <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
            <UButton
              label="Connect with your Atmosphere account"
              icon="i-lucide-cloud"
              trailing-icon="i-lucide-arrow-right"
              size="sm"
              @click="authModalOpen = true"
            />
            <UButton
              to="/skills"
              label="Browse skills"
              icon="i-lucide-search"
              size="sm"
              color="neutral"
              variant="outline"
            />
          </div>
        </template>

        <!-- Connected: signed in, no personal collection -->
        <template v-else-if="stage === 'connected'">
          <h2
            id="cta-heading"
            class="font-mono text-lg font-medium"
          >
            Add your skills
          </h2>
          <p class="mt-2 text-sm text-muted max-w-md mx-auto">
            You're connected. Add the tools you reach for every day, with a note about why each one matters.
          </p>
          <div class="mt-5">
            <UButton
              :to="`/people/${user?.handle}/edit-skills`"
              label="Add your skills"
              icon="i-lucide-plus"
              trailing-icon="i-lucide-arrow-right"
              size="sm"
            />
          </div>
        </template>

        <!-- Published: has personal collection -->
        <template v-else-if="stage === 'published'">
          <h2
            id="cta-heading"
            class="font-mono text-lg font-medium"
          >
            Create a named collection
          </h2>
          <p class="mt-2 text-sm text-muted max-w-md mx-auto">
            Group skills into themed sets like "My Nuxt Stack" or "Vue Essentials."
          </p>
          <div class="mt-5">
            <UButton
              :to="`/people/${user?.handle}/collections/new`"
              label="New collection"
              icon="i-lucide-layers"
              size="sm"
              color="neutral"
              variant="outline"
            />
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
