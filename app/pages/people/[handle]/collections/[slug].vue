<script setup lang="ts">
const route = useRoute()
const handle = computed(() => route.params.handle as string)
const slug = computed(() => route.params.slug as string)

const { user, isAuthenticated } = useAuth()
const isOwner = computed(() => isAuthenticated.value && user.value?.handle === handle.value)
const { remove, deleting } = useCollectionMutations()

const { isBot } = useBotDetection()

// SSR-friendly handle resolution
const { data: profile, status: profileStatus } = useFetch(
  () => `/api/resolve/${handle.value}`,
  { watch: [handle], lazy: !isBot.value },
)

const did = computed(() => profile.value?.did ?? '')
const resolving = computed(() => profileStatus.value === 'pending')

const { data, status, error } = useCollection(did, slug, { lazy: !isBot.value })

interface RelatedCollection {
  name: string
  slug: string
  description: string
  preambleExcerpt?: string
  skillCount: number
  stacks: string[]
  curator: { did: string, handle: string, displayName?: string, avatar?: string }
}

const { data: related } = useFetch<{ byCurator: RelatedCollection[], byStack: RelatedCollection[] }>(
  () => did.value ? `/api/collections/related?did=${did.value}&slug=${slug.value}` : null!,
  { watch: [did, slug], lazy: true, default: () => ({ byCurator: [], byStack: [] }) },
)

const installCmd = computed(() => collectionInstallCmd(handle.value, slug.value))
const { copy, copied } = useInstallCopy(
  installCmd,
  'collection-page-hero',
  () => ({ kind: 'collection', handle: handle.value, slug: slug.value }),
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = computed(() => `${siteOrigin}/people/${handle.value}/collections/${slug.value}`)

function skillPath(skill: { packageName: string, owner?: string, repo?: string }): string | null {
  if (!skill.owner || !skill.repo)
    return null
  return repoSkillPath(skill.owner, skill.repo, skill.packageName)
}

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

const commonSource = computed(() => {
  const skills = data.value?.record.skills
  if (!skills?.length)
    return null
  const first = skills[0]
  if (!first?.owner || !first?.repo)
    return null
  const allSame = skills.every(s => s.owner === first.owner && s.repo === first.repo)
  return allSame ? { owner: first.owner, repo: first.repo } : null
})

const firstSkillReason = computed(() => {
  const skills = data.value?.record.skills ?? []
  for (const s of skills) {
    if (s.reason && s.reason.trim().length > 0)
      return { packageName: s.packageName, reason: s.reason.replace(/\s+/g, ' ').trim() }
  }
  return null
})

function joinMeta(base: string, quote: string, max: number): string {
  const headline = `${base} · "${quote}"`
  if (headline.length <= max)
    return headline
  const remaining = max - base.length - 4
  if (remaining < 24)
    return base
  return `${base} · "${quote.slice(0, remaining - 1).replace(/\s+\S*$/, '')}…"`
}

const collectionTitle = computed(() => data.value?.record.name ?? slug.value)
const collectionDescription = computed(() => {
  const base = metaExcerpt(
    data.value?.record.preamble,
    data.value?.record.description ?? `Collection by @${handle.value}`,
  )
  const quote = firstSkillReason.value
  return quote ? joinMeta(base, quote.reason, 200) : base
})

useSeoMeta({
  title: () => collectionTitle.value,
  description: () => collectionDescription.value,
  ogTitle: () => collectionTitle.value,
  ogDescription: () => collectionDescription.value,
  twitterTitle: () => collectionTitle.value,
  twitterDescription: () => collectionDescription.value,
  ogUrl: canonicalUrl,
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

useSchemaOrg(computed(() => {
  if (!data.value)
    return []
  const d = data.value.record
  const url = canonicalUrl.value
  const reasonReviews = d.skills.filter(s => s.reason && s.reason.trim().length >= 20)
  return [
    {
      '@type': 'Article' as const,
      '@id': `${url}#article`,
      'headline': d.name,
      'description': metaExcerpt(d.preamble, d.description || `Collection by @${handle.value}`),
      'articleBody': d.preamble || d.description,
      'datePublished': d.createdAt,
      'dateModified': d.updatedAt,
      'url': url,
      'author': {
        '@type': 'Person' as const,
        'name': profile.value?.displayName || handle.value,
        'url': `${siteOrigin}/people/${handle.value}`,
        'identifier': `https://bsky.app/profile/${handle.value}`,
      },
      'about': d.stacks.map(s => ({ '@type': 'Thing' as const, 'name': s })),
    },
    {
      '@type': 'ItemList' as const,
      '@id': `${url}#list`,
      'itemListElement': d.skills.map((s, i) => {
        const path = skillPath(s)
        const review = reasonReviews.includes(s)
          ? {
              review: {
                '@type': 'Review' as const,
                'reviewBody': s.reason!,
                'author': { '@type': 'Person' as const, 'name': profile.value?.displayName || handle.value },
              },
            }
          : {}
        return {
          '@type': 'ListItem' as const,
          'position': i + 1,
          'item': {
            '@type': 'SoftwareApplication' as const,
            'name': s.packageName,
            ...(path ? { url: `${siteOrigin}${path}` } : {}),
            'applicationCategory': 'DeveloperApplication',
            'operatingSystem': 'Any',
            ...review,
          },
        }
      }),
    },
  ]
}))

defineOgImage('Collection.takumi', {
  name: () => data.value?.record.name ?? slug.value,
  description: () => data.value?.record.description ?? '',
  curatorHandle: () => handle.value,
  curatorName: () => profile.value?.displayName ?? '',
  curatorAvatar: () => profile.value?.avatar ?? '',
  skillCount: () => data.value?.record.skills.length ?? 0,
  skills: () => data.value?.record.skills.map((s: { packageName: string }) => s.packageName) ?? [],
  reason: () => firstSkillReason.value?.reason ?? '',
  reasonSkill: () => firstSkillReason.value?.packageName ?? '',
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
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2
            id="skills-list-heading"
            class="section-label"
          >
            {{ data.record.skills.length }} skills
          </h2>
          <NuxtLink
            v-if="commonSource"
            :to="repoHubPath(commonSource.owner, commonSource.repo)"
            class="flex items-center gap-1.5 text-xs text-muted font-mono hover:text-default"
          >
            <UIcon name="i-lucide-github" class="size-3.5" aria-hidden="true" />
            {{ commonSource.owner }}/{{ commonSource.repo }}
          </NuxtLink>
        </div>

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
                <h3 class="font-mono text-sm truncate font-normal">
                  <NuxtLink
                    v-if="skillPath(skill)"
                    :to="skillPath(skill)!"
                    class="hover:text-muted transition-colors"
                  >
                    {{ skill.packageName }}
                  </NuxtLink>
                  <template v-else>
                    {{ skill.packageName }}
                  </template>
                </h3>
                <UBadge v-if="!skill.owner" label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
              </div>
              <NuxtLink
                v-if="!commonSource && skill.owner && skill.repo"
                :to="repoHubPath(skill.owner, skill.repo)"
                class="mt-0.5 block text-xs text-muted font-mono hover:text-default"
              >
                {{ skill.owner }}/{{ skill.repo }}
              </NuxtLink>
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

        <!-- Related collections -->
        <template v-if="related && (related.byCurator.length || related.byStack.length)">
          <section
            v-if="related.byCurator.length"
            class="mt-8"
            aria-labelledby="related-curator-heading"
          >
            <h2
              id="related-curator-heading"
              class="section-label mb-4"
            >
              More from @{{ handle }}
            </h2>
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="c in related.byCurator"
                :key="c.slug"
              >
                <NuxtLink
                  :to="`/people/${handle}/collections/${c.slug}`"
                  class="block px-4 py-3 hover:bg-muted transition-colors"
                >
                  <p class="font-mono text-sm">
                    {{ c.name }}
                  </p>
                  <p
                    v-if="c.description"
                    class="mt-0.5 text-xs text-muted truncate"
                  >
                    {{ c.description }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ c.skillCount }} {{ c.skillCount === 1 ? 'skill' : 'skills' }}
                  </p>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section
            v-if="related.byStack.length"
            class="mt-8"
            aria-labelledby="related-stack-heading"
          >
            <h2
              id="related-stack-heading"
              class="section-label mb-4"
            >
              Related collections
            </h2>
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="c in related.byStack"
                :key="`${c.curator.did}/${c.slug}`"
              >
                <NuxtLink
                  :to="`/people/${c.curator.handle}/collections/${c.slug}`"
                  class="block px-4 py-3 hover:bg-muted transition-colors"
                >
                  <p class="font-mono text-sm">
                    {{ c.name }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    by @{{ c.curator.handle }} · {{ c.skillCount }} {{ c.skillCount === 1 ? 'skill' : 'skills' }}
                  </p>
                </NuxtLink>
              </li>
            </ul>
          </section>
        </template>

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
