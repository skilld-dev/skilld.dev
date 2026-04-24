<script setup lang="ts">
const route = useRoute()
const handle = computed(() => route.params.handle as string)
const slug = computed(() => route.params.slug as string)

const { user, isAuthenticated } = useAuth()
const isOwner = computed(() => isAuthenticated.value && user.value?.handle === handle.value)
const { remove, deleting } = useCollectionMutations()
const { copy, copied } = useClipboard()

const { isBot } = useBotDetection()

// SSR-friendly handle resolution
const { data: profile, status: profileStatus } = useFetch(
  () => `/api/resolve/${handle.value}`,
  { watch: [handle], lazy: !isBot.value },
)

const did = computed(() => profile.value?.did ?? '')
const resolving = computed(() => profileStatus.value === 'pending')

const { data, status, error } = useCollection(did, slug, { lazy: !isBot.value })

const installCmd = computed(() => `skilld add @${handle.value}/${slug.value}`)

async function handleDelete() {
  await remove(slug.value)
  await navigateTo(`/people/${handle.value}`)
}

function metaExcerpt(source: string | undefined, fallback: string): string {
  if (!source)
    return fallback
  const stripped = source.replace(/[#>*_`~[\]()!]/g, '').replace(/\s+/g, ' ').trim()
  if (stripped.length <= 160)
    return stripped
  return `${stripped.slice(0, 160).replace(/\s+\S*$/, '')}...`
}

useSeoMeta({
  title: () => data.value?.record.name ?? slug.value,
  description: () => metaExcerpt(
    data.value?.record.preamble,
    data.value?.record.description ?? `Collection by @${handle.value}`,
  ),
})

defineOgImage('Collection.takumi', {
  name: () => data.value?.record.name ?? slug.value,
  description: () => data.value?.record.description ?? '',
  curatorHandle: () => handle.value,
  curatorName: () => profile.value?.displayName ?? '',
  curatorAvatar: () => profile.value?.avatar ?? '',
  skillCount: () => data.value?.record.skills.length ?? 0,
  skills: () => data.value?.record.skills.map((s: { packageName: string }) => s.packageName) ?? [],
}, {
  alt: () => `${data.value?.record.name ?? slug.value} collection by @${handle.value} on skilld`,
})
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-6 md:pt-16"
      aria-labelledby="collection-heading"
    >
      <!-- Loading -->
      <div
        v-if="resolving || status === 'pending'"
        aria-busy="true"
      >
        <USkeleton class="h-6 w-2/3" />
        <USkeleton class="mt-2 h-4 w-1/3" />
        <USkeleton class="mt-4 h-20 w-full" />
      </div>

      <!-- Error -->
      <div
        v-else-if="error || !data"
        class="py-12 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load this collection. It may have been removed.
        </p>
        <UButton
          :to="`/people/${handle}`"
          label="View curator"
          variant="outline"
          color="neutral"
          size="sm"
          class="mt-4"
        />
      </div>

      <!-- Collection detail -->
      <template v-else>
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1
              id="collection-heading"
              class="font-mono text-xl font-medium"
            >
              {{ data.record.name }}
            </h1>
            <NuxtLink
              :to="`/people/${handle}`"
              class="font-mono text-sm text-muted hover:text-default transition-colors"
            >
              @{{ handle }}
            </NuxtLink>
          </div>
          <UButton
            v-if="isOwner"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Delete collection"
            :loading="deleting"
            @click="handleDelete"
          />
        </div>

        <p
          v-if="data.record.description"
          class="mt-4 text-sm text-muted leading-relaxed"
        >
          {{ data.record.description }}
        </p>

        <!-- Install command -->
        <div class="mt-6 flex items-center gap-2">
          <code class="flex-1 truncate rounded-lg border border-default bg-muted px-3 py-2 font-mono text-sm">
            {{ installCmd }}
          </code>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="outline"
            size="sm"
            :aria-label="copied ? 'Copied' : 'Copy install command'"
            @click="copy(installCmd)"
          />
        </div>

        <!-- Stacks -->
        <div
          v-if="data.record.stacks.length"
          class="mt-4 flex flex-wrap gap-1.5"
        >
          <UBadge
            v-for="stack in data.record.stacks"
            :key="stack"
            :label="stack"
            variant="subtle"
            color="primary"
            size="xs"
          />
        </div>
      </template>
    </section>

    <!-- Preamble (long-form intro) -->
    <template v-if="data?.record.preamble && !resolving">
      <USeparator />

      <section
        class="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-10"
        aria-labelledby="preamble-heading"
      >
        <h2
          id="preamble-heading"
          class="section-label mb-4"
        >
          About this collection
        </h2>
        <div class="space-y-4 text-sm leading-relaxed text-default">
          <p
            v-for="(para, i) in data.record.preamble.split(/\n{2,}/).filter(Boolean)"
            :key="i"
            class="whitespace-pre-line"
          >
            {{ para }}
          </p>
        </div>
      </section>
    </template>

    <!-- Skills list -->
    <template v-if="data && !resolving">
      <USeparator />

      <section
        class="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="skills-list-heading"
      >
        <h2
          id="skills-list-heading"
          class="section-label mb-4"
        >
          {{ data.record.skills.length }} skills
        </h2>

        <div
          class="divide-y divide-default rounded-lg border border-default"
          role="list"
        >
          <div
            v-for="skill in data.record.skills"
            :key="skill.packageName"
            role="listitem"
            class="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <p class="font-mono text-sm truncate">
                  {{ skill.packageName }}
                </p>
                <UBadge v-if="!skill.owner" label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
              </div>
              <a
                v-if="skill.owner && skill.repo"
                :href="`https://github.com/${skill.owner}/${skill.repo}`"
                target="_blank"
                class="mt-0.5 block text-xs text-muted font-mono hover:text-default"
              >{{ skill.owner }}/{{ skill.repo }}</a>
              <p
                v-if="skill.reason"
                class="mt-0.5 text-xs text-muted truncate"
              >
                {{ skill.reason }}
              </p>
            </div>
          </div>
        </div>

        <!-- Discussion (Bluesky thread) -->
        <section
          v-if="data.record.postRef"
          class="mt-8"
          aria-labelledby="discussion-heading"
        >
          <h2
            id="discussion-heading"
            class="section-label mb-4"
          >
            Discussion
          </h2>
          <BlueskyThread :post-uri="data.record.postRef.uri" />
        </section>

        <!-- AT Protocol provenance -->
        <div class="mt-6 rounded-lg border border-default p-4">
          <p class="section-label mb-2">
            Provenance
          </p>
          <dl class="space-y-1 font-mono text-xs text-muted">
            <div class="flex gap-2">
              <dt class="shrink-0">
                AT URI
              </dt>
              <dd class="truncate">
                {{ data.uri }}
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="shrink-0">
                CID
              </dt>
              <dd class="truncate">
                {{ data.cid }}
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="shrink-0">
                Created
              </dt>
              <dd>{{ new Date(data.record.createdAt).toLocaleDateString() }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="shrink-0">
                Updated
              </dt>
              <dd>{{ new Date(data.record.updatedAt).toLocaleDateString() }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </template>
  </div>
</template>
