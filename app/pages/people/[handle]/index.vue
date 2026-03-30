<script setup lang="ts">
import { PERSONAL_COLLECTION_SLUG } from '~/composables/useOnboarding'

const route = useRoute()
const handle = computed(() => route.params.handle as string)

const { isBot } = useBotDetection()
const { user, isAuthenticated } = useAuth()
const isOwnProfile = computed(() => isAuthenticated.value && user.value?.handle === handle.value)

// SSR-friendly profile resolution via server endpoint
const { data: resolvedProfile, status: profileStatus, error: profileError } = useFetch(
  () => `/api/resolve/${handle.value}`,
  { watch: [handle], lazy: !isBot.value },
)

const did = computed(() => resolvedProfile.value?.did)
const { data: collectionsData, status: collectionsStatus } = useCollections(did, { lazy: !isBot.value })
const { copy: copyInstall } = useClipboard({ source: computed(() => `skilld add @${handle.value}`) })

// Split personal vs named collections
const personalCollection = computed(() =>
  collectionsData.value?.collections.find(c => c.rkey === PERSONAL_COLLECTION_SLUG),
)
const namedCollections = computed(() =>
  collectionsData.value?.collections.filter(c => c.rkey !== PERSONAL_COLLECTION_SLUG) ?? [],
)

const curatorLabels = computed(() => resolvedProfile.value?.labels ?? [])

useSeoMeta({
  title: () => resolvedProfile.value?.displayName
    ? `${resolvedProfile.value.displayName} (@${handle.value})`
    : `@${handle.value}`,
  description: () => resolvedProfile.value?.description ?? `Skills curated by @${handle.value}`,
})

defineOgImage('Curator.takumi', {
  handle: () => handle.value,
  displayName: () => resolvedProfile.value?.displayName ?? '',
  description: () => resolvedProfile.value?.description ?? '',
  avatar: () => resolvedProfile.value?.avatar ?? '',
  collectionCount: () => collectionsData.value?.collections.length ?? 0,
  skillCount: () => personalCollection.value?.record.skills.length ?? 0,
}, {
  alt: () => `${resolvedProfile.value?.displayName || `@${handle.value}`} curator profile on skilld`,
})
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="curator-heading"
    >
      <!-- Loading -->
      <div
        v-if="profileStatus === 'pending'"
        class="flex items-center gap-4"
        aria-busy="true"
      >
        <USkeleton class="size-16 rounded-full" />
        <div class="space-y-2">
          <USkeleton class="h-5 w-40" />
          <USkeleton class="h-4 w-24" />
        </div>
      </div>

      <!-- Profile not found -->
      <div
        v-else-if="profileError || !resolvedProfile"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-user-x"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't find a profile for @{{ handle }}.
        </p>
        <UButton
          to="/"
          label="Back to home"
          variant="outline"
          color="neutral"
          size="sm"
          class="mt-4"
        />
      </div>

      <!-- Profile -->
      <div
        v-else
        class="flex items-start gap-4"
      >
        <img
          v-if="resolvedProfile.avatar"
          :src="resolvedProfile.avatar"
          :alt="`Avatar for ${resolvedProfile.displayName || resolvedProfile.handle}`"
          width="64"
          height="64"
          class="size-16 rounded-full"
        >
        <div
          v-else
          class="flex size-16 items-center justify-center rounded-full bg-muted"
        >
          <UIcon
            name="i-lucide-user"
            class="size-8 text-muted"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0 flex-1">
          <h1
            id="curator-heading"
            class="font-mono text-xl font-medium"
          >
            {{ resolvedProfile.displayName || resolvedProfile.handle }}
          </h1>
          <p class="font-mono text-sm text-muted">
            @{{ resolvedProfile.handle }}
          </p>
          <CuratorLabels
            v-if="curatorLabels.length"
            :labels="curatorLabels"
            class="mt-2"
          />
          <p
            v-if="resolvedProfile.description"
            class="mt-2 text-sm text-muted leading-relaxed max-w-lg"
          >
            {{ resolvedProfile.description }}
          </p>
        </div>
        <UButton
          v-if="isOwnProfile"
          :to="`/people/${handle}/edit-skills`"
          :label="personalCollection ? 'Edit skills' : 'Add your skills'"
          :icon="personalCollection ? 'i-lucide-pencil' : 'i-lucide-plus'"
          size="sm"
          class="shrink-0"
        />
      </div>
    </section>

    <template v-if="resolvedProfile && !profileError">
      <USeparator />

      <!-- Personal skills -->
      <section
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="curator-skills-heading"
      >
        <h2
          id="curator-skills-heading"
          class="section-label mb-6"
        >
          Skills
        </h2>

        <!-- Loading -->
        <div
          v-if="collectionsStatus === 'pending'"
          class="space-y-2"
          aria-busy="true"
        >
          <div
            v-for="i in 4"
            :key="i"
            class="rounded-lg border border-default p-3"
          >
            <USkeleton class="h-4 w-1/3" />
            <USkeleton class="mt-1 h-3 w-2/3" />
          </div>
        </div>

        <!-- No personal collection: empty state -->
        <div
          v-else-if="!personalCollection"
          class="rounded-lg border border-default p-6 text-center"
        >
          <UIcon
            name="i-lucide-sparkles"
            class="mx-auto size-8 text-muted"
            aria-hidden="true"
          />
          <template v-if="isOwnProfile">
            <p class="mt-3 text-sm font-medium">
              Share the tools you use every day.
            </p>
            <p class="mt-1 text-xs text-muted leading-relaxed max-w-sm mx-auto">
              Add your skills with a note about why each one matters.
              Anyone can run <code class="font-mono">skilld add @{{ handle }}</code> to get your setup.
            </p>
            <div class="mt-4 flex items-center justify-center gap-3">
              <UButton
                :to="`/people/${handle}/edit-skills`"
                label="Add your skills"
                icon="i-lucide-plus"
                size="sm"
              />
              <UButton
                to="/skills"
                label="Browse skills first"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-search"
              />
            </div>
          </template>
          <template v-else>
            <p class="mt-3 text-sm">
              @{{ handle }} hasn't published their skills yet.
            </p>
          </template>
        </div>

        <!-- Personal skills list -->
        <template v-else>
          <div
            class="space-y-2"
            role="list"
            aria-label="Skills"
          >
            <div
              v-for="skill in personalCollection.record.skills"
              :key="skill.packageName"
              role="listitem"
              class="flex items-start gap-3 rounded-lg border border-default p-3"
            >
              <div class="min-w-0 flex-1">
                <p class="font-mono text-sm font-medium">
                  {{ skill.packageName }}
                </p>
                <p
                  v-if="skill.reason"
                  class="mt-0.5 text-xs text-muted leading-relaxed"
                >
                  {{ skill.reason }}
                </p>
              </div>
            </div>
          </div>

          <!-- Install command -->
          <div class="mt-4 flex items-center gap-2 rounded-lg border border-default p-3">
            <code class="flex-1 font-mono text-sm">skilld add @{{ handle }}</code>
            <UButton
              icon="i-lucide-clipboard"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Copy install command"
              @click="copyInstall()"
            />
          </div>
        </template>
      </section>

      <!-- Named collections -->
      <template v-if="namedCollections.length || isOwnProfile">
        <USeparator />

        <section
          class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
          aria-labelledby="curator-collections-heading"
        >
          <div class="flex items-center justify-between mb-6">
            <h2
              id="curator-collections-heading"
              class="section-label"
            >
              Collections
            </h2>
            <UButton
              v-if="isOwnProfile"
              :to="`/people/${handle}/collections/new`"
              label="New collection"
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="xs"
            />
          </div>

          <div
            v-if="namedCollections.length"
            class="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            <NuxtLink
              v-for="item in namedCollections"
              :key="item.rkey"
              :to="`/people/${handle}/${item.rkey}`"
              class="group rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            >
              <h3 class="font-mono text-sm font-medium">
                {{ item.record.name }}
              </h3>
              <p
                v-if="item.record.description"
                class="mt-1 text-xs text-muted leading-relaxed line-clamp-2"
              >
                {{ item.record.description }}
              </p>
              <div class="mt-3 flex items-center gap-3">
                <span class="data-label">{{ item.record.skills.length }} skills</span>
                <span
                  v-if="item.record.stacks.length"
                  class="data-label"
                >{{ item.record.stacks.join(', ') }}</span>
              </div>
            </NuxtLink>
          </div>

          <div
            v-else-if="isOwnProfile"
            class="rounded-lg border border-default p-6 text-center"
          >
            <p class="text-sm text-muted">
              Named collections are for themed sets, like "My Nuxt Stack" or "Vue Essentials."
            </p>
          </div>
        </section>
      </template>

      <!-- Sync info -->
      <p
        v-if="collectionsData?.fetchedAt"
        class="mx-auto max-w-5xl px-4 sm:px-6 pb-8 text-xs text-muted"
      >
        Synced from PDS {{ useTimeAgo(collectionsData.fetchedAt).value }}
      </p>
    </template>
  </div>
</template>
