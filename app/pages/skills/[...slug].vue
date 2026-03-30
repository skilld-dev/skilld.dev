<script setup lang="ts">
const route = useRoute()
const slug = computed(() => {
  const params = route.params.slug
  return Array.isArray(params) ? params.join('/') : params
})

const { data, status, error, refresh } = useFetch(
  () => `/api/skills/${slug.value}`,
  { watch: [slug] },
) as ReturnType<typeof useFetch<{ content: string | null, curators: { did: string, handle: string, displayName?: string, avatar?: string, collectionName: string, collectionSlug: string, reason?: string }[], url: string, repo: string, owner: string, name: string, githubUrl: string }>>

const { copy, copied } = useClipboard()

const installCmd = computed(() => {
  if (!data.value)
    return ''
  const { owner, repo, name } = data.value
  return `skilld add ${owner}/${repo === 'skills' ? name : `${repo}/${name}`}`
})

const githubUrl = computed(() => data.value?.githubUrl ?? '')
const skillsShUrl = computed(() => data.value?.url ?? '')

useSeoMeta({
  title: () => data.value ? `${data.value.name} by ${data.value.owner}` : 'Skill',
  description: () => data.value
    ? `${data.value.name} skill by ${data.value.owner}. Install with: ${installCmd.value}`
    : 'View skill details on skilld.',
})

defineOgImage('Skill.takumi', {
  name: () => data.value?.name ?? '',
  owner: () => data.value?.owner ?? '',
  repo: () => data.value?.repo ?? 'skills',
  curatorCount: () => data.value?.curators.length ?? 0,
}, {
  alt: () => `${data.value?.name ?? 'Skill'} by ${data.value?.owner ?? ''} on skilld`,
})
</script>

<template>
  <div>
    <!-- Header -->
    <section
      class="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-6 md:pt-16"
      :aria-labelledby="data && !error ? 'skill-heading' : undefined"
      :aria-label="!data || error ? 'Skill details' : undefined"
    >
      <!-- Back link -->
      <NuxtLink
        to="/skills"
        class="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-default transition-colors mb-6"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-3.5"
          aria-hidden="true"
        />
        All skills
      </NuxtLink>

      <!-- Loading skeleton -->
      <div
        v-if="status === 'pending' && !data"
        aria-busy="true"
      >
        <USkeleton class="h-6 w-2/3" />
        <USkeleton class="mt-2 h-4 w-1/3" />
        <USkeleton class="mt-6 h-10 w-full" />
      </div>

      <!-- Error state -->
      <div
        v-else-if="error || !data"
        class="py-12 text-center"
        role="alert"
      >
        <h1
          id="skill-heading"
          class="sr-only"
        >
          Skill not found
        </h1>
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          {{ error?.statusCode === 404 ? "Couldn't find this skill. It may have been removed or the URL is incorrect." : "Couldn't load this skill. Check your connection and try again." }}
        </p>
        <div class="mt-4 flex items-center justify-center gap-3">
          <UButton
            v-if="error?.statusCode !== 404"
            label="Retry"
            size="sm"
            variant="outline"
            color="neutral"
            @click="refresh()"
          />
          <UButton
            to="/skills"
            label="Browse skills"
            size="sm"
            variant="outline"
            color="neutral"
          />
        </div>
      </div>

      <!-- Skill header -->
      <template v-else>
        <div>
          <h1
            id="skill-heading"
            class="font-mono text-xl font-medium"
          >
            {{ data.name }}
          </h1>
          <p class="mt-1 font-mono text-sm text-muted">
            {{ data.owner }}{{ data.repo !== 'skills' ? `/${data.repo}` : '' }}
          </p>
        </div>

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

        <!-- Source links -->
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UButton
            :href="skillsShUrl"
            target="_blank"
            rel="noopener"
            label="View on skills.sh"
            icon="i-lucide-external-link"
            size="xs"
            color="neutral"
            variant="ghost"
          />
          <UButton
            :href="githubUrl"
            target="_blank"
            rel="noopener"
            label="View source"
            icon="i-lucide-github"
            size="xs"
            color="neutral"
            variant="ghost"
          />
        </div>
      </template>
    </section>

    <template v-if="data && status !== 'pending'">
      <!-- Curators section -->
      <USeparator />

      <section
        class="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="curators-heading"
      >
        <h2
          id="curators-heading"
          class="section-label mb-4"
        >
          {{ data.curators.length ? `${data.curators.length} ${data.curators.length === 1 ? 'curator' : 'curators'} using this skill` : 'Curators' }}
        </h2>

        <!-- Curator endorsements -->
        <div
          v-if="data.curators.length"
          class="divide-y divide-default rounded-lg border border-default"
          role="list"
        >
          <div
            v-for="curator in data.curators"
            :key="`${curator.did}-${curator.collectionSlug}`"
            role="listitem"
            class="flex items-center gap-3 px-4 py-3"
          >
            <NuxtLink
              :to="`/people/${curator.handle}`"
              class="shrink-0"
            >
              <img
                v-if="curator.avatar"
                :src="curator.avatar"
                :alt="`Avatar for ${curator.displayName || curator.handle}`"
                width="32"
                height="32"
                class="size-8 rounded-full"
              >
              <div
                v-else
                class="flex size-8 items-center justify-center rounded-full bg-muted"
              >
                <UIcon
                  name="i-lucide-user"
                  class="size-4 text-muted"
                  aria-hidden="true"
                />
              </div>
            </NuxtLink>

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <NuxtLink
                  :to="`/people/${curator.handle}`"
                  class="text-sm font-medium hover:text-muted transition-colors truncate"
                >
                  {{ curator.displayName || curator.handle }}
                </NuxtLink>
                <span class="data-label shrink-0">in</span>
                <NuxtLink
                  :to="`/people/${curator.handle}/${curator.collectionSlug}`"
                  class="font-mono text-xs text-muted hover:text-default transition-colors truncate"
                >
                  {{ curator.collectionName }}
                </NuxtLink>
              </div>
              <p
                v-if="curator.reason"
                class="mt-0.5 text-xs text-muted truncate"
              >
                {{ curator.reason }}
              </p>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-else
          class="rounded-lg border border-default p-6 text-center"
        >
          <UIcon
            name="i-lucide-users"
            class="mx-auto size-8 text-muted"
            aria-hidden="true"
          />
          <p class="mt-3 text-sm text-muted">
            No curators have added this skill yet. Be the first to include it in a collection.
          </p>
        </div>
      </section>

      <!-- SKILL.md content -->
      <template v-if="data.content">
        <USeparator />

        <section
          class="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12"
          aria-labelledby="content-heading"
        >
          <h2
            id="content-heading"
            class="section-label mb-4"
          >
            Skill content
          </h2>

          <div class="rounded-lg border border-default p-4 sm:p-5">
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted overflow-x-auto">{{ data.content }}</pre>
          </div>

          <p class="mt-3 text-xs text-muted">
            Source:
            <a
              :href="`${githubUrl}/blob/main/${data.repo === 'skills' ? `${data.name}/` : ''}SKILL.md`"
              target="_blank"
              rel="noopener"
              class="font-mono hover:text-default transition-colors"
            >
              SKILL.md on GitHub
            </a>
          </p>
        </section>
      </template>
    </template>
  </div>
</template>
