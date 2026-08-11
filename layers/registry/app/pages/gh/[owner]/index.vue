<script setup lang="ts">
import type { OrgProfile } from '../../../../server/api/orgs/[owner].get'
import { resolveOwnerProfileHandoff } from '../../../utils/owner-profile-handoff'

const route = useRoute()
const ownerParam = computed(() => (route.params.owner as string).toLowerCase())
const { isAuthenticated, user, loginUrl } = useAuth()

const { isBot } = useBotDetection()

const { data, status, error, refresh } = useFetch<OrgProfile>(
  () => `/api/orgs/${ownerParam.value}`,
  {
    key: `org-${ownerParam.value}`,
    watch: [ownerParam],
    lazy: !isBot.value,
  },
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = computed(() => `${siteOrigin}${ownerHubPath(ownerParam.value)}`)

const isUser = computed(() => data.value?.kind === 'user')
const kindLabel = computed(() => isUser.value ? 'person' : 'org')
const profileHandoff = computed(() => {
  const profile = data.value
  if (!profile)
    return { _tag: 'hidden' } as const

  const viewer = isAuthenticated.value && user.value
    ? { _tag: 'signed-in' as const, login: user.value.login }
    : { _tag: 'anonymous' as const }

  return resolveOwnerProfileHandoff(profile.kind, profile.owner, viewer)
})
const profileLoginHref = computed(() => loginUrl({ returnTo: route.fullPath }))

const headline = computed(() => {
  if (!data.value)
    return ''
  return isUser.value
    ? `Curated skills from @${data.value.owner}`
    : `Skills published by ${data.value.displayName}`
})

const fingerprint = computed(() => data.value?.topTags.slice(0, 3).map(t => t.label).join(', ') ?? '')

// Bound once in setup. Calling useTimeAgo from the template registered a new
// interval on every re-render, none of which were ever disposed.
const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? 0)

const now = useTimestamp({ interval: 60_000 })
const syncStale = computed(() => {
  const profile = data.value
  if (!profile)
    return false
  if (profile.syncStatus === 'never' || profile.syncStatus === 'failed')
    return true
  if (!profile.lastSyncedAt)
    return false
  const ageHours = (now.value / 1000 - profile.lastSyncedAt) / 3600
  return ageHours > 24
})

const { copy: copyRepoInstall } = useClipboard()
const repoCopiedKey = ref<string | null>(null)
function copyRepoCmd(repoKey: string, cmd: string) {
  copyRepoInstall(cmd)
  repoCopiedKey.value = repoKey
  setTimeout(() => {
    if (repoCopiedKey.value === repoKey)
      repoCopiedKey.value = null
  }, 2000)
}

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return repoSkillPath(skill.owner, skill.repo, skill.name)
}

function ensureProtocol(url: string): string {
  if (!url)
    return ''
  if (url.startsWith('http://') || url.startsWith('https://'))
    return url
  return `https://${url}`
}

const skillsByRepo = computed(() => {
  if (!data.value)
    return new Map<string, OrgProfile['skills']>()
  const map = new Map<string, OrgProfile['skills']>()
  for (const skill of data.value.skills) {
    const list = map.get(skill.repo) ?? []
    list.push(skill)
    map.set(skill.repo, list)
  }
  return map
})

useSeoMeta({
  title: () => {
    if (!data.value)
      return `@${ownerParam.value}`
    const name = data.value.displayName
    const handleSuffix = data.value.displayName === data.value.owner ? '' : ` (@${data.value.owner})`
    return `${name}${handleSuffix} skills`
  },
  description: () => {
    if (!data.value)
      return `Agent skills published by @${ownerParam.value} on skilld.`
    const tagPart = fingerprint.value ? ` ${fingerprint.value}.` : ''
    const verb = isUser.value ? 'curated by' : 'published by'
    return `${data.value.totalSkills} agent ${data.value.totalSkills === 1 ? 'skill' : 'skills'} ${verb} ${data.value.displayName} on skilld.${tagPart}`
  },
  ogTitle: () => data.value?.displayName ? `${data.value.displayName} on skilld` : `@${ownerParam.value} on skilld`,
  ogDescription: () => {
    if (!data.value)
      return ''
    const verb = isUser.value ? 'curated by' : 'published by'
    return `${data.value.totalSkills} agent skills ${verb} ${data.value.displayName}.`
  },
  ogUrl: canonicalUrl,
  robots: () => data.value?.seoIndexable ? 'index,follow' : 'noindex,follow',
  twitterCard: 'summary_large_image',
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

defineOgImage('Curator.takumi', {
  handle: () => data.value?.owner ?? ownerParam.value,
  displayName: () => data.value?.displayName ?? '',
  description: () => data.value?.description ?? '',
  avatar: () => data.value?.avatar ?? '',
  collectionCount: () => data.value?.repos.length ?? 0,
  skillCount: () => data.value?.totalSkills ?? 0,
}, {
  alt: () => data.value?.displayName
    ? `${data.value.displayName} skill profile on skilld`
    : `@${ownerParam.value} on skilld`,
})

useSchemaOrg(computed(() => {
  if (!data.value)
    return []
  const d = data.value
  const sameAs = [d.github]
  if (d.blog)
    sameAs.push(ensureProtocol(d.blog))
  return [
    {
      '@type': isUser.value ? ('Person' as const) : ('Organization' as const),
      '@id': `${canonicalUrl.value}#owner`,
      'name': d.displayName,
      'alternateName': d.displayName === d.owner ? undefined : `@${d.owner}`,
      'url': canonicalUrl.value,
      'image': {
        '@type': 'ImageObject' as const,
        '@id': `${canonicalUrl.value}#avatar`,
        'url': d.avatar,
        'width': 460,
        'height': 460,
        'contentUrl': d.avatar,
      },
      sameAs,
      'description': d.description ?? `Agent skills ${isUser.value ? 'curated by' : 'published by'} ${d.displayName} on skilld.`,
    },
    {
      '@type': 'CollectionPage' as const,
      '@id': `${canonicalUrl.value}#page`,
      'url': canonicalUrl.value,
      'name': `${d.displayName} skills on skilld`,
      'about': { '@id': `${canonicalUrl.value}#owner` },
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
    <!-- Identity hero -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="org-heading"
    >
      <!-- Loading -->
      <div
        v-if="status === 'pending'"
        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6"
        aria-busy="true"
      >
        <USkeleton class="size-20 sm:size-24 rounded-lg shrink-0" />
        <div class="space-y-3 flex-1 min-w-0">
          <USkeleton class="h-7 w-56" />
          <USkeleton class="h-4 w-32" />
          <USkeleton class="h-4 w-full max-w-md" />
          <USkeleton class="h-3 w-48" />
        </div>
      </div>

      <!-- Error: not found -->
      <div
        v-else-if="error || !data"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-user-x"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <h1
          id="org-heading"
          class="mt-3 font-mono text-lg font-medium"
        >
          Couldn't find that owner
        </h1>
        <p class="mt-1 text-sm text-muted">
          No skills published by <code class="font-mono">@{{ ownerParam }}</code>.
        </p>
        <div class="mt-4 flex items-center justify-center gap-2">
          <UButton
            to="/skills"
            label="Back to skills"
            variant="outline"
            color="neutral"
            size="sm"
          />
          <UButton
            label="Retry"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="refresh()"
          />
        </div>
      </div>

      <!-- Profile -->
      <div
        v-else
        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6"
      >
        <img
          :src="data.avatar"
          :alt="`Avatar for ${data.displayName}`"
          width="96"
          height="96"
          class="size-20 sm:size-24 shrink-0 border border-default object-cover bg-muted"
          :class="isUser ? 'rounded-full' : 'rounded-lg'"
          loading="eager"
        >
        <div class="min-w-0 flex-1">
          <h1
            id="org-heading"
            class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
          >
            {{ data.displayName }}
          </h1>
          <div class="mt-1 flex items-center gap-2 flex-wrap">
            <a
              :href="data.github"
              target="_blank"
              rel="noopener"
              class="font-mono text-sm text-muted hover:text-default transition-colors"
            >
              @{{ data.owner }}
            </a>
            <UBadge
              :label="kindLabel"
              variant="subtle"
              :color="isUser ? 'primary' : 'neutral'"
              size="xs"
              class="font-mono uppercase tracking-wider !text-default"
            />
          </div>

          <p
            v-if="data.description"
            class="mt-3 text-sm text-muted leading-relaxed max-w-lg"
          >
            {{ data.description }}
          </p>

          <!-- Stats -->
          <div class="mt-4 flex items-center gap-3 flex-wrap">
            <span class="data-label">
              {{ data.totalSkills }} {{ data.totalSkills === 1 ? 'skill' : 'skills' }}
            </span>
            <span
              v-if="data.repos.length > 1"
              class="data-label"
            >
              {{ data.repos.length }} repos
            </span>
            <span
              v-if="data.totalStars > 0"
              class="data-label inline-flex items-center gap-1"
              :title="`${data.totalStars.toLocaleString()} GitHub stars`"
            >
              <UIcon
                name="i-lucide-star"
                class="size-3"
                aria-hidden="true"
              />
              {{ formatGithubStars(data.totalStars) }}
            </span>
            <span
              v-if="data.location"
              class="data-label inline-flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-map-pin"
                class="size-3"
                aria-hidden="true"
              />
              {{ data.location }}
            </span>
            <span
              v-if="syncStale"
              class="data-label inline-flex items-center gap-1 text-amber-500"
              :title="data.lastSyncedAt ? `Last synced ${new Date(data.lastSyncedAt * 1000).toLocaleString()}` : 'Never synced'"
            >
              <UIcon
                name="i-lucide-clock-alert"
                class="size-3"
                aria-hidden="true"
              />
              <span v-if="!data.lastSyncedAt">Sync pending</span>
              <span v-else>
                Synced
                <NuxtTime
                  :datetime="data.lastSyncedAt * 1000"
                  relative
                />
              </span>
            </span>
          </div>

          <!-- Stack fingerprint -->
          <p
            v-if="fingerprint"
            class="mt-2 font-mono text-xs text-muted"
          >
            <span class="uppercase tracking-widest">Mostly</span>
            <span class="mx-1.5 opacity-50">·</span>
            <span>{{ fingerprint }}</span>
          </p>

          <!-- Actions -->
          <div class="mt-4 flex items-center gap-2 flex-wrap">
            <UButton
              :to="data.github"
              target="_blank"
              rel="noopener"
              icon="i-lucide-github"
              label="GitHub"
              color="neutral"
              variant="outline"
              size="sm"
              :aria-label="`${data.owner} on GitHub (opens in new tab)`"
            />
            <UButton
              v-if="data.blog"
              :to="ensureProtocol(data.blog)"
              target="_blank"
              rel="noopener"
              icon="i-lucide-external-link"
              label="Website"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`${data.displayName} website (opens in new tab)`"
            />
          </div>

          <div
            v-if="profileHandoff._tag === 'sign-in'"
            class="mt-5 max-w-2xl border-t border-default pt-4"
          >
            <p class="font-mono text-sm font-medium">
              Is this your GitHub account?
            </p>
            <div class="mt-1 max-w-xl space-y-1 text-sm leading-relaxed text-muted">
              <p>Sign in as @{{ data.owner }} with GitHub.</p>
              <p>Your indexed skills will appear in Community.</p>
              <p>skilld will also check your public repositories for other <code>SKILL.md</code> files.</p>
            </div>
            <UButton
              :href="profileLoginHref"
              icon="i-lucide-github"
              label="Sign in with GitHub"
              color="primary"
              variant="solid"
              size="md"
              class="mt-3 min-h-11"
            />
          </div>

          <div
            v-else-if="profileHandoff._tag === 'owner'"
            class="mt-5 max-w-2xl border-t border-default pt-4"
          >
            <p class="flex items-center gap-2 font-mono text-sm font-medium">
              <UIcon
                name="i-lucide-circle-check"
                class="size-4 text-primary"
                aria-hidden="true"
              />
              This is your skill profile
            </p>
            <div class="mt-1 max-w-xl space-y-1 text-sm leading-relaxed text-muted">
              <p>Your indexed skills appear on your Community profile.</p>
              <p>skilld also checks your public repositories for other <code>SKILL.md</code> files.</p>
            </div>
            <UButton
              :to="`/@${data.owner}`"
              icon="i-lucide-user-round"
              label="View Community profile"
              color="neutral"
              variant="outline"
              size="md"
              class="mt-3 min-h-11"
            />
          </div>
        </div>
      </div>
    </section>

    <template v-if="data && !error">
      <USeparator />

      <!-- Skills, grouped by GitHub repo -->
      <section
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="skills-heading"
      >
        <h2
          id="skills-heading"
          class="section-label mb-6"
        >
          Skills
        </h2>

        <div class="space-y-12">
          <div
            v-for="repo in data.repos"
            :key="repo.repo"
          >
            <!-- Repo header: name, stats, description, repo-level install -->
            <div class="mb-4 rounded-lg border border-default p-4">
              <div class="flex items-start gap-3 flex-wrap">
                <div class="min-w-0 flex-1">
                  <h3 class="font-mono text-sm font-medium">
                    <NuxtLink
                      :to="repoHubPath(data.owner, repo.repo)"
                      class="inline-flex items-center gap-1.5 hover:text-muted transition-colors"
                      :aria-label="`${data.owner}/${repo.repo} source page`"
                    >
                      <UIcon name="i-lucide-github" class="size-3.5" aria-hidden="true" />
                      {{ data.owner }}/{{ repo.repo }}
                    </NuxtLink>
                  </h3>
                  <p
                    v-if="repo.description"
                    class="mt-1.5 text-xs text-muted leading-relaxed line-clamp-2"
                  >
                    {{ repo.description }}
                  </p>
                  <div class="mt-2 flex items-center gap-3 flex-wrap">
                    <span class="data-label">{{ repo.count }} {{ repo.count === 1 ? 'skill' : 'skills' }}</span>
                    <span
                      v-if="repo.stars > 0"
                      class="data-label inline-flex items-center gap-1"
                    >
                      <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                      {{ formatGithubStars(repo.stars) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Install whole repo -->
              <div class="mt-3 flex items-center gap-2 rounded-md border border-default bg-muted/50 p-2">
                <code class="flex-1 font-mono text-xs truncate">{{ gitInstallCmd(data.owner, repo.repo) }}</code>
                <UButton
                  :icon="repoCopiedKey === repo.repo ? 'i-lucide-check' : 'i-lucide-clipboard'"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="repoCopiedKey === repo.repo ? 'Copied' : `Copy install command for ${data.owner}/${repo.repo}`"
                  @click="copyRepoCmd(repo.repo, gitInstallCmd(data.owner, repo.repo))"
                />
              </div>
            </div>

            <ul
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
              :aria-label="`${data.owner}/${repo.repo} skills`"
            >
              <li
                v-for="skill in skillsByRepo.get(repo.repo) ?? []"
                :key="skill.slug"
              >
                <SkillCard :skill />
              </li>
            </ul>
          </div>
        </div>
      </section>

      <p class="mx-auto max-w-5xl px-4 sm:px-6 pb-8 text-xs text-muted">
        <span class="sr-only">{{ headline }}.</span>
        Synced <span data-allow-mismatch="text">{{ syncedAgo }}</span>
      </p>
    </template>
  </div>
</template>
