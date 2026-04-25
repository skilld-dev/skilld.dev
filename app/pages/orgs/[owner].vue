<script setup lang="ts">
import type { OrgProfile } from '../../../server/api/orgs/[owner].get'

const route = useRoute()
const ownerParam = computed(() => (route.params.owner as string).toLowerCase())

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
const canonicalUrl = computed(() => `${siteOrigin}/orgs/${ownerParam.value}`)

const isUser = computed(() => data.value?.kind === 'user')
const kindLabel = computed(() => isUser.value ? 'person' : 'org')

const headline = computed(() => {
  if (!data.value)
    return ''
  return isUser.value
    ? `Curated skills from @${data.value.owner}`
    : `Skills published by ${data.value.displayName}`
})

const fingerprint = computed(() => data.value?.topTags.slice(0, 3).map(t => t.label).join(', ') ?? '')

const isSingleRepo = computed(() => (data.value?.repos.length ?? 0) === 1)
const primaryRepo = computed(() => data.value?.repos[0])

const installCmd = computed(() => {
  if (!data.value || !primaryRepo.value)
    return ''
  return gitInstallCmd(data.value.owner, primaryRepo.value.repo)
})

const { copy: copyInstall } = useClipboard({ source: installCmd })
const installCopied = ref(false)
function handleCopyInstall() {
  copyInstall()
  installCopied.value = true
  setTimeout(() => (installCopied.value = false), 2000)
}

const { copy: copySkill } = useClipboard()
const copiedName = ref<string | null>(null)
function copySkillCmd(name: string, cmd: string) {
  copySkill(cmd)
  copiedName.value = name
  setTimeout(() => {
    if (copiedName.value === name)
      copiedName.value = null
  }, 2000)
}

function skillSlug(skill: { owner: string, repo: string, name: string }) {
  return `${skill.owner}/${skill.repo === 'skills' ? skill.name : `${skill.repo}/${skill.name}`}`
}

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return `/skills/${skillSlug(skill)}`
}

function formatStars(n: number): string {
  if (n >= 10000)
    return `${Math.round(n / 1000)}k`
  if (n >= 1000)
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toLocaleString()
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
              {{ formatStars(data.totalStars) }}
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
        </div>
      </div>
    </section>

    <template v-if="data && !error">
      <USeparator />

      <!-- Install command (single-repo only) -->
      <section
        v-if="isSingleRepo && primaryRepo"
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-10"
        aria-labelledby="install-heading"
      >
        <h2
          id="install-heading"
          class="section-label mb-3"
        >
          Install
        </h2>
        <div class="flex items-center gap-2 rounded-lg border border-default p-3">
          <code class="flex-1 font-mono text-sm truncate">{{ installCmd }}</code>
          <UButton
            :icon="installCopied ? 'i-lucide-check' : 'i-lucide-clipboard'"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="installCopied ? 'Copied' : 'Copy install command'"
            @click="handleCopyInstall"
          />
        </div>
        <p class="mt-2 text-xs text-muted leading-relaxed">
          Installs all {{ data.totalSkills }} {{ data.totalSkills === 1 ? 'skill' : 'skills' }} from
          <a
            :href="`https://github.com/${data.owner}/${primaryRepo.repo}`"
            target="_blank"
            rel="noopener"
            class="font-mono hover:text-default transition-colors"
          >{{ data.owner }}/{{ primaryRepo.repo }}</a>.
        </p>
      </section>

      <USeparator v-if="isSingleRepo && primaryRepo" />

      <!-- Skills -->
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

        <!-- Multi-repo: grouped -->
        <div
          v-if="!isSingleRepo"
          class="space-y-10"
        >
          <div
            v-for="repo in data.repos"
            :key="repo.repo"
          >
            <div class="mb-3 flex items-center gap-3 flex-wrap">
              <h3 class="font-mono text-sm font-medium">
                <a
                  :href="`https://github.com/${data.owner}/${repo.repo}`"
                  target="_blank"
                  rel="noopener"
                  class="hover:text-muted transition-colors"
                  :aria-label="`${data.owner}/${repo.repo} on GitHub (opens in new tab)`"
                >{{ data.owner }}/{{ repo.repo }}</a>
              </h3>
              <span class="data-label">{{ repo.count }} {{ repo.count === 1 ? 'skill' : 'skills' }}</span>
              <span
                v-if="repo.stars > 0"
                class="data-label inline-flex items-center gap-1"
              >
                <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                {{ formatStars(repo.stars) }}
              </span>
            </div>

            <ul
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
              :aria-label="`${data.owner}/${repo.repo} skills`"
            >
              <li
                v-for="skill in skillsByRepo.get(repo.repo) ?? []"
                :key="skill.slug"
                class="group relative"
              >
                <NuxtLink
                  :to="skillPath(skill)"
                  :aria-label="`${skill.name} by ${skill.owner}`"
                  class="block rounded-lg border border-default p-4 pr-12 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
                >
                  <div class="flex items-center gap-1.5">
                    <p class="font-mono text-sm font-medium truncate">
                      {{ skill.name }}
                    </p>
                    <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                  </div>
                  <p
                    v-if="skill.description"
                    class="mt-1.5 text-xs text-muted leading-relaxed line-clamp-2"
                  >
                    {{ skill.description }}
                  </p>
                  <code class="mt-3 block truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
                    {{ gitInstallCmd(skill.owner, skill.repo, skill.name) }}
                  </code>
                </NuxtLink>
                <UButton
                  :icon="copiedName === skill.name ? 'i-lucide-check' : 'i-lucide-copy'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  :aria-label="copiedName === skill.name ? 'Copied' : `Copy install command for ${skill.name}`"
                  @click="copySkillCmd(skill.name, gitInstallCmd(skill.owner, skill.repo, skill.name))"
                />
              </li>
            </ul>
          </div>
        </div>

        <!-- Single-repo: flat grid -->
        <ul
          v-else
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
        >
          <li
            v-for="skill in data.skills"
            :key="skill.slug"
            class="group relative"
          >
            <NuxtLink
              :to="skillPath(skill)"
              :aria-label="`${skill.name} by ${skill.owner}`"
              class="block rounded-lg border border-default p-4 pr-12 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            >
              <div class="flex items-center gap-1.5">
                <p class="font-mono text-sm font-medium truncate">
                  {{ skill.name }}
                </p>
                <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                <span
                  v-if="skill.stars"
                  class="inline-flex items-center gap-0.5 shrink-0 font-mono text-xs text-muted"
                  :title="`${skill.stars.toLocaleString()} GitHub stars`"
                >
                  <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                  {{ formatStars(skill.stars) }}
                </span>
              </div>
              <p
                v-if="skill.description"
                class="mt-1.5 text-xs text-muted leading-relaxed line-clamp-2"
              >
                {{ skill.description }}
              </p>
              <code class="mt-3 block truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
                {{ gitInstallCmd(skill.owner, skill.repo, skill.name) }}
              </code>
            </NuxtLink>
            <UButton
              :icon="copiedName === skill.name ? 'i-lucide-check' : 'i-lucide-copy'"
              size="xs"
              color="neutral"
              variant="ghost"
              class="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              :aria-label="copiedName === skill.name ? 'Copied' : `Copy install command for ${skill.name}`"
              @click="copySkillCmd(skill.name, gitInstallCmd(skill.owner, skill.repo, skill.name))"
            />
          </li>
        </ul>
      </section>

      <p class="mx-auto max-w-5xl px-4 sm:px-6 pb-8 text-xs text-muted">
        <span class="sr-only">{{ headline }}.</span>
        Synced {{ useTimeAgo(data.fetchedAt).value }}
      </p>
    </template>
  </div>
</template>
