<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'

const { isBot } = useBotDetection()

const { data, status, error, refresh } = useFetch<TagProfile>(
  () => '/api/tags/react?view=data',
  {
    key: 'tag-react',
    lazy: !isBot.value,
  },
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = `${siteOrigin}/frameworks/react`

const skillsByOwner = computed(() => {
  if (!data.value)
    return [] as Array<{ owner: string, skills: TagProfile['skills'] }>
  const map = new Map<string, TagProfile['skills']>()
  for (const skill of data.value.skills) {
    const list = map.get(skill.owner) ?? []
    list.push(skill)
    map.set(skill.owner, list)
  }
  return [...map.entries()]
    .map(([owner, skills]) => ({ owner, skills }))
    .sort((a, b) => b.skills.length - a.skills.length || a.owner.localeCompare(b.owner))
})

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return repoSkillPath(skill.owner, skill.repo, skill.name)
}

const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? 0)

useSeoMeta({
  title: 'Skills for React',
  description: () => {
    if (!data.value)
      return 'Agent skills for React components, hooks, state management, and current patterns.'
    return `Browse ${data.value.totalSkills} React agent skills from ${data.value.topOwners.length}+ maintainers. Every result links to source.`
  },
  ogTitle: 'Skills for React',
  ogDescription: 'Agent skills for React components, hooks, state management, and current patterns.',
  ogUrl: canonicalUrl,
  twitterCard: 'summary_large_image',
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

defineOgImage('Page.takumi', {
  title: 'Skills for React',
  description: 'Agent skills for React components, hooks, state management, and current patterns.',
}, {
  alt: 'Skills for React on skilld',
})

useSchemaOrg(computed(() => {
  if (!data.value)
    return []
  const d = data.value
  return [
    {
      '@type': 'CollectionPage' as const,
      '@id': `${canonicalUrl}#page`,
      'url': canonicalUrl,
      'name': 'Skills for React on skilld',
      'description': `${d.totalSkills} agent skills for React curated on skilld.`,
      'hasPart': d.skills.slice(0, 25).map(s => ({
        '@type': 'SoftwareApplication' as const,
        'name': s.name,
        'url': `${siteOrigin}${skillPath(s)}`,
        'applicationCategory': 'DeveloperApplication',
        'operatingSystem': 'Any',
      })),
    },
  ]
}))
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="react-heading"
    >
      <div
        v-if="status === 'pending'"
        class="space-y-4"
        aria-busy="true"
      >
        <USkeleton class="h-6 w-24" />
        <USkeleton class="h-10 w-72" />
        <USkeleton class="h-4 w-full max-w-xl" />
        <div class="flex items-center gap-4 pt-2">
          <USkeleton class="h-3 w-20" />
          <USkeleton class="h-3 w-24" />
          <USkeleton class="h-3 w-16" />
        </div>
      </div>

      <div
        v-else-if="error"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-cloud-off"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <h1
          id="react-heading"
          class="mt-3 font-mono text-lg font-medium"
        >
          Couldn't load React skills
        </h1>
        <p class="mt-1 text-sm text-muted">
          Check your connection and try again.
        </p>
        <div class="mt-4 flex items-center justify-center">
          <UButton
            label="Retry"
            color="neutral"
            variant="outline"
            size="sm"
            @click="refresh()"
          />
        </div>
      </div>

      <div
        v-else-if="!data"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-package-x"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <h1
          id="react-heading"
          class="mt-3 font-mono text-lg font-medium"
        >
          No React skills indexed yet
        </h1>
        <p class="mt-1 text-sm text-muted">
          Browse the full registry to find what you need.
        </p>
        <div class="mt-4 flex items-center justify-center">
          <UButton
            to="/skills"
            label="Browse all skills"
            variant="outline"
            color="neutral"
            size="sm"
          />
        </div>
      </div>

      <div v-else>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-simple-icons-react"
            class="size-5 text-muted"
            aria-hidden="true"
          />
          <span class="section-label">Framework</span>
        </div>
        <h1
          id="react-heading"
          class="mt-3 font-mono text-3xl sm:text-4xl font-medium tracking-tight"
        >
          Skills for React
        </h1>
        <p class="mt-3 text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          Agent skills for React components, hooks, state management, and current patterns. Every result links to its SKILL.md source.
        </p>
        <div class="mt-5 flex items-center gap-3 flex-wrap">
          <span class="data-label">
            {{ data.totalSkills }} {{ data.totalSkills === 1 ? 'skill' : 'skills' }}
          </span>
          <span class="data-label">
            {{ data.topOwners.length }}{{ data.topOwners.length === 8 ? '+' : '' }} {{ data.topOwners.length === 1 ? 'contributor' : 'contributors' }}
          </span>
          <span
            v-if="data.totalStars > 0"
            class="data-label inline-flex items-center gap-1"
            :title="`${data.totalStars.toLocaleString()} GitHub stars combined`"
          >
            <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
            {{ formatGithubStars(data.totalStars) }}
          </span>
        </div>
        <div class="mt-5 flex items-center gap-2 flex-wrap">
          <UButton
            to="https://react.dev"
            target="_blank"
            rel="noopener"
            icon="i-lucide-external-link"
            label="react.dev"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="React official site (opens in new tab)"
          />
          <UButton
            to="/skills"
            icon="i-lucide-arrow-right"
            label="Browse all skills"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
      </div>
    </section>

    <template v-if="data && !error">
      <USeparator />

      <section
        v-if="data.topOwners.length"
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="contributors-heading"
      >
        <h2
          id="contributors-heading"
          class="section-label mb-6"
        >
          Top contributors
        </h2>
        <ul
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 list-none p-0"
          aria-label="Owners with the most React-related skills"
        >
          <li
            v-for="o in data.topOwners"
            :key="o.owner"
          >
            <NuxtLink
              :to="ownerHubPath(o.owner)"
              :aria-label="`@${o.owner}, ${o.count} React ${o.count === 1 ? 'skill' : 'skills'}`"
              class="block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            >
              <img
                :src="o.avatar"
                :alt="`Avatar for ${o.owner}`"
                width="40"
                height="40"
                loading="lazy"
                class="size-10 rounded-full border border-default object-cover bg-muted"
              >
              <p class="mt-3 font-mono text-sm font-medium truncate">
                @{{ o.owner }}
              </p>
              <div class="mt-1 flex items-center gap-2 flex-wrap">
                <span class="data-label">
                  {{ o.count }} {{ o.count === 1 ? 'skill' : 'skills' }}
                </span>
                <span
                  v-if="o.stars > 0"
                  class="data-label inline-flex items-center gap-1"
                >
                  <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                  {{ formatGithubStars(o.stars) }}
                </span>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <USeparator />

      <section
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="skills-heading"
      >
        <h2
          id="skills-heading"
          class="section-label mb-6"
        >
          All skills
        </h2>

        <div class="space-y-10">
          <div
            v-for="group in skillsByOwner"
            :key="group.owner"
          >
            <div class="mb-3 flex items-baseline gap-3">
              <h3 class="font-mono text-sm font-medium">
                <NuxtLink
                  :to="ownerHubPath(group.owner)"
                  class="hover:text-muted transition-colors"
                >
                  @{{ group.owner }}
                </NuxtLink>
              </h3>
              <span class="data-label">
                {{ group.skills.length }} {{ group.skills.length === 1 ? 'skill' : 'skills' }}
              </span>
            </div>
            <ul
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
              :aria-label="`Skills by @${group.owner}`"
            >
              <li
                v-for="skill in group.skills"
                :key="skill.slug"
              >
                <SkillCard :skill />
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section
        v-if="data.relatedTags.length"
        class="mx-auto max-w-5xl px-4 sm:px-6 pb-12"
        aria-labelledby="related-heading"
      >
        <h2
          id="related-heading"
          class="section-label mb-3"
        >
          Often appears with
        </h2>
        <ul class="flex flex-wrap items-center gap-2 list-none p-0">
          <li
            v-for="t in data.relatedTags"
            :key="t.slug"
          >
            <UBadge
              variant="subtle"
              color="neutral"
              size="sm"
              class="font-mono"
            >
              {{ t.label }}
              <span class="ml-1.5 opacity-60">{{ t.count }}</span>
            </UBadge>
          </li>
        </ul>
      </section>

      <p class="mx-auto max-w-5xl px-4 sm:px-6 pb-8 text-xs text-muted">
        Synced {{ syncedAgo }}
      </p>
    </template>
  </div>
</template>
