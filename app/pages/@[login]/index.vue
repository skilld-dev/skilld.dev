<script setup lang="ts">
import type { OrgProfile } from '#layers/registry/server/api/orgs/[owner].get'

const route = useRoute()
const login = computed(() => String(route.params.login))

const { user } = useUserSession()
const isOwner = computed(() => user.value?.login?.toLowerCase() === login.value.toLowerCase())

const {
  data: collectionsData,
  error: collectionsError,
  refresh: refreshCollections,
} = await useFetch(
  () => `/api/collections/by-author/${login.value}`,
  { key: () => `author-collections-${login.value}` },
)
const collections = computed(() => collectionsData.value?.items ?? [])

const {
  data: skillsData,
  error: skillsError,
  refresh: refreshSkills,
} = await useFetch(
  () => `/api/users/${login.value}/skills`,
  { key: () => `author-skills-${login.value}` },
)
const skills = computed(() => skillsData.value?.items ?? [])
type AuthorSkill = NonNullable<typeof skillsData.value>['items'][number]

interface SkillGroup {
  key: string
  owner: string
  repo: string
  skills: AuthorSkill[]
}

const skillPreviewLimit = 6
const expandedRepositories = ref<string[]>([])
const skillGroups = computed<SkillGroup[]>(() => {
  const groups = new Map<string, SkillGroup>()
  for (const skill of skills.value) {
    const key = `${skill.owner}/${skill.repo}`
    const group = groups.get(key)
    if (group)
      group.skills.push(skill)
    else
      groups.set(key, { key, owner: skill.owner, repo: skill.repo, skills: [skill] })
  }
  return [...groups.values()]
})

watch(login, () => {
  expandedRepositories.value = []
})

const { data: profile } = await useFetch<OrgProfile>(
  () => `/api/orgs/${login.value}`,
  { key: () => `community-profile-${login.value}` },
)

const displayName = computed(() => profile.value?.displayName || `@${login.value}`)
const profileDescription = computed(() => profile.value?.description ?? '')
const avatar = computed(() => profile.value?.avatar || `https://github.com/${login.value}.png?size=192`)
const githubUrl = computed(() => profile.value?.github || `https://github.com/${login.value}`)
const websiteUrl = computed(() => {
  const url = profile.value?.blog
  if (!url)
    return null
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
})
const scanning = ref(false)
const scanResult = ref<{ reposFound: number, reposSynced: number, reposFailed: number } | null>(null)
const scanError = ref<string | null>(null)

async function scanRepos() {
  scanning.value = true
  scanError.value = null
  scanResult.value = null
  try {
    const res = await $fetch<{ reposFound: number, reposSynced: number, reposFailed: number }>(
      '/api/me/repos/scan',
      { method: 'POST', body: {} },
    )
    scanResult.value = res
    await refreshSkills()
  }
  catch (err: unknown) {
    const e = err as { data?: { message?: string }, message?: string }
    scanError.value = e?.data?.message ?? e?.message ?? 'Scan failed'
  }
  finally {
    scanning.value = false
  }
}

async function unpublish(owner: string, repo: string) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Unpublish ${owner}/${repo}? This removes all skills from this repo.`))
    return
  await $fetch(`/api/me/skills/${owner}/${repo}`, { method: 'DELETE' })
  await refreshSkills()
}

function cleanDescription(description: string | null): string {
  return description?.replace(/^>\s*-\s*/, '').trim() ?? ''
}

function githubSegment(value: string): string {
  return encodeURIComponent(value)
}

function githubPath(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map(githubSegment)
    .join('/')
}

function skillSourceUrl(skill: {
  owner: string
  repo: string
  skill_path: string | null
  source_owner: string | null
  source_repo: string | null
  default_branch: string | null
}): string | null {
  if (!skill.skill_path)
    return null
  const owner = githubSegment(skill.source_owner || skill.owner)
  const repo = githubSegment(skill.source_repo || skill.repo)
  const branch = githubSegment(skill.default_branch || 'main')
  return `https://github.com/${owner}/${repo}/blob/${branch}/${githubPath(skill.skill_path)}`
}

function timestampDate(timestamp: number): Date {
  return new Date(timestamp * 1000)
}

function repositoryIsExpanded(group: SkillGroup): boolean {
  return expandedRepositories.value.includes(group.key)
}

function visibleRepositorySkills(group: SkillGroup): AuthorSkill[] {
  return repositoryIsExpanded(group) ? group.skills : group.skills.slice(0, skillPreviewLimit)
}

function remainingRepositorySkills(group: SkillGroup): number {
  return Math.max(0, group.skills.length - skillPreviewLimit)
}

function toggleRepository(group: SkillGroup): void {
  expandedRepositories.value = repositoryIsExpanded(group)
    ? expandedRepositories.value.filter(key => key !== group.key)
    : [...expandedRepositories.value, group.key]
}

const canonicalUrl = computed(() => `https://skilld.dev/@${login.value}`)

useSeoMeta({
  title: () => displayName.value === `@${login.value}`
    ? `@${login.value}`
    : `${displayName.value} (@${login.value})`,
  description: () => `${skills.value.length} ${skills.value.length === 1 ? 'skill' : 'skills'} and ${collections.value.length} ${collections.value.length === 1 ? 'collection' : 'collections'} from @${login.value} on skilld.`,
  ogUrl: canonicalUrl,
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

defineOgImage('Curator.takumi', {
  handle: () => login.value,
  displayName,
  description: profileDescription,
  avatar,
  collectionCount: () => collections.value.length,
  skillCount: () => skills.value.length,
  skills: () => skills.value.slice(0, 4).map(skill => skill.display_name || skill.name),
}, { alt: () => `${displayName.value} Community profile on skilld` })
</script>

<template>
  <article class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
    <header class="border-b border-default pb-8">
      <div class="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div class="flex min-w-0 items-start gap-4 sm:gap-5">
          <img
            :src="avatar"
            :alt="`${displayName} on GitHub`"
            width="96"
            height="96"
            class="size-20 shrink-0 rounded-full border border-default bg-muted object-cover sm:size-24"
            fetchpriority="high"
          >
          <div class="min-w-0 pt-1">
            <p class="section-label">
              Community profile
            </p>
            <h1 class="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {{ displayName }}
            </h1>
            <p
              v-if="displayName !== `@${login}`"
              class="mt-1 font-mono text-sm text-muted"
            >
              @{{ login }}
            </p>
            <p
              v-if="profileDescription"
              class="mt-3 max-w-2xl text-base leading-relaxed text-muted text-pretty"
            >
              {{ profileDescription }}
            </p>
            <p
              v-if="profile?.location"
              class="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-muted"
            >
              <UIcon name="i-lucide-map-pin" class="size-3.5" aria-hidden="true" />
              {{ profile.location }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 md:max-w-52 md:justify-end">
          <UButton
            v-if="isOwner"
            :label="skills.length ? 'Rescan repositories' : 'Scan repositories'"
            icon="i-lucide-scan-search"
            size="sm"
            color="primary"
            variant="solid"
            class="min-h-11"
            :loading="scanning"
            @click="scanRepos"
          />
          <UButton
            :to="githubUrl"
            target="_blank"
            rel="noopener"
            label="GitHub"
            icon="i-lucide-github"
            size="sm"
            color="neutral"
            variant="outline"
            class="min-h-11"
            :aria-label="`${displayName} on GitHub (opens in new tab)`"
          />
          <UButton
            v-if="websiteUrl"
            :to="websiteUrl"
            target="_blank"
            rel="noopener"
            label="Website"
            icon="i-lucide-external-link"
            size="sm"
            color="neutral"
            variant="ghost"
            class="min-h-11"
            :aria-label="`${displayName} website (opens in new tab)`"
          />
        </div>
      </div>

      <p
        v-if="scanResult"
        class="mt-4 text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        Found {{ scanResult.reposFound }} {{ scanResult.reposFound === 1 ? 'repository' : 'repositories' }}. Indexed {{ scanResult.reposSynced }}{{ scanResult.reposFailed ? `; ${scanResult.reposFailed} failed` : '' }}.
      </p>
      <p
        v-if="scanError"
        class="mt-4 flex items-center gap-2 text-sm text-error"
        role="alert"
      >
        <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" aria-hidden="true" />
        Couldn't scan repositories. {{ scanError }}
      </p>
    </header>

    <section class="mt-10" aria-label="Skills by repository">
      <div v-if="skillsError" class="editorial-state flex flex-col items-start justify-center" role="alert">
        <h2 class="font-mono text-sm font-medium">
          Couldn't load skills
        </h2>
        <p class="mt-2 max-w-lg text-base leading-relaxed text-muted">
          Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 min-h-11"
          @click="refreshSkills()"
        />
      </div>

      <div v-else-if="skillGroups.length" class="space-y-10">
        <section
          v-for="group in skillGroups"
          :key="group.key"
          :aria-labelledby="`repository-${group.owner}-${group.repo}`"
        >
          <header class="flex flex-wrap items-end justify-between gap-3 border-b border-default pb-3">
            <div class="min-w-0">
              <p class="section-label">
                Repository
              </p>
              <h2 :id="`repository-${group.owner}-${group.repo}`" class="mt-1 truncate font-mono text-lg font-semibold tracking-tight">
                <NuxtLink :to="`/gh/${group.owner}/${group.repo}`" class="hover:text-muted">
                  {{ group.owner }}/{{ group.repo }}
                </NuxtLink>
              </h2>
            </div>
            <div class="flex items-center gap-2">
              <span class="data-label tabular-nums">
                {{ group.skills.length }} {{ group.skills.length === 1 ? 'skill' : 'skills' }}
              </span>
              <UButton
                v-if="isOwner"
                label="Unpublish"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                class="min-h-11"
                @click="unpublish(group.owner, group.repo)"
              />
            </div>
          </header>

          <ul
            :id="`repository-skills-${group.owner}-${group.repo}`"
            class="list-none p-0"
          >
            <li
              v-for="s in visibleRepositorySkills(group)"
              :key="s.name"
              class="border-b border-default py-4"
            >
              <article class="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div class="min-w-0">
                  <NuxtLink
                    :to="`/gh/${s.owner}/${s.repo}/${s.name}`"
                    class="group inline-flex min-h-11 max-w-full items-center gap-2 font-mono text-base font-medium transition-colors hover:text-muted"
                  >
                    <span class="truncate">{{ s.display_name || s.name }}</span>
                    <UIcon
                      name="i-lucide-arrow-up-right"
                      class="size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </NuxtLink>
                  <p
                    v-if="cleanDescription(s.description)"
                    class="mt-2 max-w-3xl text-base leading-relaxed text-muted text-pretty line-clamp-2"
                  >
                    {{ cleanDescription(s.description) }}
                  </p>
                  <p v-if="s.modified_at" class="mt-3 data-label">
                    Updated
                    <NuxtTime
                      :datetime="timestampDate(s.modified_at)"
                      locale="en"
                      relative
                      numeric="auto"
                      relative-style="long"
                      :title="true"
                    />
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-1 md:justify-end">
                  <LikeButton
                    :owner="s.owner"
                    :repo="s.repo"
                    :name="s.name"
                    :count="s.likeCount"
                    variant="inline"
                  />
                  <UButton
                    v-if="skillSourceUrl(s)"
                    :to="skillSourceUrl(s)!"
                    target="_blank"
                    rel="noopener"
                    label="Read source"
                    icon="i-lucide-file-code-2"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="min-h-11"
                    :aria-label="`Read ${s.display_name || s.name} SKILL.md on GitHub (opens in new tab)`"
                  />
                </div>
              </article>
            </li>
          </ul>

          <div v-if="remainingRepositorySkills(group)" class="flex justify-center border-b border-default py-3">
            <UButton
              :label="repositoryIsExpanded(group) ? 'Show fewer skills' : `Show ${remainingRepositorySkills(group)} more skills`"
              :icon="repositoryIsExpanded(group) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              color="neutral"
              variant="ghost"
              size="sm"
              class="min-h-11"
              :aria-expanded="repositoryIsExpanded(group)"
              :aria-controls="`repository-skills-${group.owner}-${group.repo}`"
              @click="toggleRepository(group)"
            />
          </div>
        </section>
      </div>

      <div v-else class="editorial-state flex flex-col items-start justify-center" role="status">
        <h2 class="font-mono text-sm font-medium">
          No skills yet
        </h2>
        <p class="mt-2 max-w-xl text-base leading-relaxed text-muted">
          {{ isOwner ? 'Scan your public GitHub repositories to find SKILL.md files.' : `When @${login} publishes a skill, it will appear here.` }}
        </p>
        <UButton
          v-if="isOwner"
          label="Scan repositories"
          icon="i-lucide-scan-search"
          color="primary"
          variant="solid"
          size="sm"
          class="mt-4 min-h-11"
          :loading="scanning"
          @click="scanRepos"
        />
        <UButton
          v-else
          to="/skills"
          label="Browse skills"
          icon="i-lucide-arrow-right"
          trailing
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 min-h-11"
        />
      </div>
    </section>

    <section class="mt-12" aria-labelledby="collections-heading">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="section-label">
            Curated setups
          </p>
          <h2 id="collections-heading" class="mt-2 text-xl font-semibold tracking-tight">
            Collections
          </h2>
        </div>
        <p class="max-w-xl text-base leading-relaxed text-muted text-pretty">
          Skills grouped for one workflow and installable with one command.
        </p>
      </div>

      <div v-if="collectionsError" class="editorial-state flex flex-col items-start justify-center" role="alert">
        <h3 class="font-mono text-sm font-medium">
          Couldn't load collections
        </h3>
        <p class="mt-2 max-w-lg text-base leading-relaxed text-muted">
          Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 min-h-11"
          @click="refreshCollections()"
        />
      </div>

      <ul v-else-if="collections.length" class="editorial-ledger list-none p-0">
        <li v-for="c in collections" :key="c.slug">
          <NuxtLink
            :to="`/@${login}/${c.slug}`"
            class="group grid min-h-11 min-w-0 gap-3 py-5 transition-colors hover:text-muted md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <span class="min-w-0">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-base font-medium">{{ c.name }}</span>
                <UBadge
                  v-if="c.featured"
                  label="Featured"
                  icon="i-lucide-star"
                  color="primary"
                  variant="solid"
                  size="xs"
                />
              </span>
              <span
                v-if="c.preamble"
                class="mt-2 block max-w-3xl text-base leading-relaxed text-muted text-pretty line-clamp-2"
              >
                {{ c.preamble }}
              </span>
              <span class="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
                <span>{{ c.skillCount }} {{ c.skillCount === 1 ? 'skill' : 'skills' }}</span>
                <span>
                  Updated
                  <NuxtTime
                    :datetime="timestampDate(c.updatedAt)"
                    locale="en"
                    relative
                    numeric="auto"
                    relative-style="long"
                    :title="true"
                  />
                </span>
              </span>
            </span>
            <span class="inline-flex items-center gap-2 font-mono text-sm">
              View collection
              <UIcon
                name="i-lucide-arrow-right"
                class="size-4 transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </NuxtLink>
        </li>
      </ul>

      <div v-else class="editorial-state flex flex-col items-start justify-center" role="status">
        <h3 class="font-mono text-sm font-medium">
          No collections yet
        </h3>
        <p class="mt-2 max-w-xl text-base leading-relaxed text-muted">
          {{ isOwner ? 'Bundle skills for one workflow into a collection people can install with one command.' : `When @${login} publishes a collection, it will appear here.` }}
        </p>
        <UButton
          v-if="isOwner"
          to="/collections/new"
          label="Create collection"
          icon="i-lucide-plus"
          color="primary"
          variant="solid"
          size="sm"
          class="mt-4 min-h-11"
        />
        <UButton
          v-else
          to="/community"
          label="Browse Community"
          icon="i-lucide-arrow-right"
          trailing
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 min-h-11"
        />
      </div>
    </section>
  </article>
</template>
