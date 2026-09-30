<script setup lang="ts">
import type { OrgProfile } from '../../../../../server/api/orgs/[owner].get'
import type { RepoSourceProfile } from '../../../../../server/api/repos/[owner]/[repo].get'
import type { RepoHistoryResponse } from '../../../../../server/api/repos/[owner]/[repo]/history.get'
import type { RepoRouteResolution } from '../../../../../server/api/repos/[owner]/[repo]/route-target.get'
import { avatarProxyUrl } from '#shared/image-proxy'
import { resolveMissingRepoRedirect } from '../../../../utils/missing-repo-recovery'
import { parseRepoSkillSort, REPO_SKILL_SORT_OPTIONS, sortRepoSkills } from '../../../../utils/repo-skill-layout'
import RepoSkillCard from './_RepoSkillCard.vue'
import RepoSparkline from './_RepoSparkline.vue'

const route = useRoute()
const owner = computed(() => String(route.params.owner ?? ''))
const repo = computed(() => String(route.params.repo ?? ''))
const repoHub = computed(() => ({ owner: owner.value, repo: repo.value }))
const repoKey = computed(() => `${repoHub.value.owner}/${repoHub.value.repo}`.toLowerCase())
const sourceHub = computed(() => repoHub.value)
const { isBot } = useBotDetection()

const repoRouteFetch = useFetch<RepoRouteResolution>(
  () => `/api/repos/${repoHub.value.owner}/${repoHub.value.repo}/route-target`,
  {
    watch: [repoHub],
    lazy: !isBot.value,
    immediate: true,
  },
) as ReturnType<typeof useFetch<RepoRouteResolution>>
if (isBot.value)
  await repoRouteFetch
const { data: repoRouteResolution, status: repoRouteStatus } = repoRouteFetch
const repoRouteTarget = computed(() => {
  const resolution = repoRouteResolution.value
  if (!resolution || `${resolution.owner}/${resolution.repo}`.toLowerCase() !== repoKey.value)
    return null
  return resolution.target
})
const fetchRepoDetailsOnServer = isBot.value && repoRouteTarget.value?._tag !== 'skill'

const repoProfileFetch = useFetch<OrgProfile>(
  () => `/api/orgs/${sourceHub.value.owner}`,
  {
    watch: false,
    lazy: !fetchRepoDetailsOnServer,
    immediate: fetchRepoDetailsOnServer,
    server: fetchRepoDetailsOnServer,
  },
) as ReturnType<typeof useFetch<OrgProfile>>
const { data: repoProfile, status: repoProfileStatus, refresh: refreshRepo } = repoProfileFetch

const repoSourceFetch = useFetch<RepoSourceProfile>(
  () => `/api/repos/${repoHub.value.owner}/${repoHub.value.repo}`,
  {
    watch: false,
    lazy: !fetchRepoDetailsOnServer,
    immediate: fetchRepoDetailsOnServer,
    server: fetchRepoDetailsOnServer,
  },
) as ReturnType<typeof useFetch<RepoSourceProfile>>
const { data: fetchedRepoSource, status: repoSourceStatus, error: repoSourceError, refresh: refreshRepoSource } = repoSourceFetch
const repoSource = computed(() => {
  const source = fetchedRepoSource.value
  if (!source || `${source.owner}/${source.repo}`.toLowerCase() !== repoKey.value)
    return null
  return source
})

// Bots render blocking when this is a repository page. A confirmed-missing repo
// (`/api/repos/.../....get.ts` throws 404 once GitHub itself says 404) was
// rendering the "Source not found" card with a 200 status — a soft 404 that
// let nonexistent owner/repo URLs (e.g. from stale tag/collection data) sit
// in the index. Transient upstream failures don't throw there, so this only
// fires for genuine not-found repos.
if (fetchRepoDetailsOnServer)
  await Promise.all([repoProfileFetch, repoSourceFetch])
if (fetchRepoDetailsOnServer && repoSourceError.value?.statusCode === 404) {
  // Before the tombstone, check whether the repo segment is actually a skill
  // name. `/gh/<owner>/<skill>` is what an inbound link looks like when the
  // author drops the repository, and the owner profile above already carries
  // every skill this owner publishes, so the recovery costs no extra request.
  const recovery = resolveMissingRepoRedirect({
    owner: owner.value,
    repo: repo.value,
    skills: repoProfile.value?.skills ?? [],
  })
  if (recovery._tag === 'redirect')
    await navigateTo(recovery.location, { redirectCode: 301, replace: true })
  else
    throw createError({ statusCode: 404, statusMessage: 'Repository not found', fatal: true })
}

const repoSkills = computed(() => selectRepoSkills(repoProfile.value, repoHub.value.repo))
const repoSkillsLoading = computed(() =>
  !repoProfile.value && (repoProfileStatus.value === 'idle' || repoProfileStatus.value === 'pending'),
)

const repoInfo = computed(() => selectRepoInfo(repoProfile.value, repoHub.value.repo))

const sourceDisplayName = computed(() => {
  const hub = repoHub.value
  const source = repoSource.value
  return `${source?.owner ?? hub.owner}/${source?.repo ?? hub.repo}`
})

const sourceDescription = computed(() =>
  repoSource.value?.description ?? repoInfo.value?.description ?? repoProfile.value?.description ?? null,
)

const sourceStars = computed(() =>
  repoSource.value?.stars ?? repoInfo.value?.stars ?? repoProfile.value?.totalStars ?? 0,
)

const sourceForks = computed(() =>
  repoSource.value?.forks ?? 0,
)

const repoStatsSection = useTemplateRef<HTMLElement>('repoStatsSection')
const repoStatsVisible = ref(false)
const requestedHistoryKey = ref<string | null>(null)
const historyKey = computed(() => `${repoHub.value.owner}/${repoHub.value.repo}`)
const {
  data: repoHistory,
  status: repoHistoryStatus,
  error: repoHistoryError,
  execute: loadRepoHistory,
  clear: clearRepoHistory,
} = useLazyFetch<RepoHistoryResponse>(
  () => `/api/repos/${repoHub.value.owner}/${repoHub.value.repo}/history`,
  {
    server: false,
    immediate: false,
    watch: false,
  },
)

useIntersectionObserver(repoStatsSection, ([entry]) => {
  repoStatsVisible.value = Boolean(entry?.isIntersecting)
})

watch([repoStatsVisible, historyKey], ([visible, key]) => {
  if (!visible || requestedHistoryKey.value === key)
    return
  requestedHistoryKey.value = key
  clearRepoHistory()
  void loadRepoHistory()
}, { flush: 'post' })

const skillHistoryPoints = computed(() => repoHistory.value?.skillHistory.points ?? [])
const starHistoryPoints = computed(() =>
  repoHistory.value?.starHistory._tag === 'ready'
    ? repoHistory.value.starHistory.points
    : [],
)
const starHistoryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})
const starHistoryTrackingLabel = computed(() => {
  const history = repoHistory.value?.starHistory
  if (!history)
    return null
  if (history._tag === 'collecting')
    return `Tracking since ${starHistoryDateFormatter.format(history.trackedSince * 1000)}`
  if (history._tag === 'untracked')
    return 'Tracking soon'
  return null
})

const sourceAvatar = computed(() => {
  const o = sourceHub.value.owner ?? repoProfile.value?.owner
  return o ? `https://github.com/${o}.png` : ''
})

const sourceConfirmedNoSkillMd = computed(() =>
  Boolean(repoSource.value?.skillFileScanStatus === 'ok' && repoSource.value.skillFileCount === 0),
)

const repoSourceScanNotice = computed<string | null>(() => {
  const source = repoSource.value
  if (!source)
    return null
  if (source.skillFileScanStatus === 'truncated')
    return `GitHub returned a truncated file tree. skilld found ${source.skillFileCount.toLocaleString()} SKILL.md ${source.skillFileCount === 1 ? 'file' : 'files'}, but the scan may be incomplete.`
  if (source.skillFileScanStatus === 'unavailable')
    return 'GitHub repository metadata loaded, but the SKILL.md file scan is unavailable right now.'
  return null
})

const sourceSkillFiles = computed(() => repoSource.value?.skillFiles ?? [])

const flatSkillName = computed<string | null>(() => {
  if (repoRouteTarget.value?._tag === 'skill')
    return repoRouteTarget.value.name

  if (repoSkills.value.length === 1)
    return repoSkills.value[0]?.name ?? null

  const source = repoSource.value
  if (!source || source.skillFileCount !== 1)
    return null
  const path = source.skillFiles?.[0]
  if (!path)
    return null
  const match = path.match(/(?:^|\/)([^/]+)\/SKILL\.md$/i)
  const name = match?.[1]
  if (!name)
    return null
  return name === repoHub.value.repo ? name : null
})

const repoPageLoading = computed(() => {
  if (repoRouteStatus.value === 'idle' || repoRouteStatus.value === 'pending')
    return true
  if (repoRouteTarget.value?._tag === 'skill')
    return false
  return !repoSource.value && (repoSourceStatus.value === 'idle' || repoSourceStatus.value === 'pending')
})

const sourceDefaultBranch = computed(() => repoSource.value?.defaultBranch ?? null)
const sourcePushedAt = computed(() => repoSource.value?.pushedAt ?? null)
const sourcePushedAtDate = computed(() => sourcePushedAt.value ? new Date(sourcePushedAt.value) : null)
const sourcePushedAtAgo = useTimeAgo(computed(() => sourcePushedAtDate.value ?? new Date(0)))

const skillSort = computed(() => parseRepoSkillSort(route.query.sort))
const sortedRepoSkills = computed(() => sortRepoSkills(repoSkills.value, skillSort.value))
const skillGroups = computed(() => groupRepoSkills(sortedRepoSkills.value, sourceSkillFiles.value))
const hasFolderGrouping = computed(() => hasRepoFolderGrouping(skillGroups.value))
const groupedSkills = computed(() => hasFolderGrouping.value && route.query.group !== '0')
const groupingOptions = [
  { value: true, label: 'Group by folder', icon: 'i-lucide-folder-tree' },
  { value: false, label: 'Show a flat list', icon: 'i-lucide-rows-3' },
]

async function setSkillSort(value: unknown) {
  const sort = parseRepoSkillSort(value)
  const query = { ...route.query }
  if (sort === 'updated')
    delete query.sort
  else
    query.sort = sort
  await navigateTo({ query }, { replace: true })
}

async function setGroupedSkills(value: boolean) {
  const query = { ...route.query }
  if (value)
    delete query.group
  else
    query.group = '0'
  await navigateTo({ query }, { replace: true })
}

const skilldInitCmd = computed(() => 'npx skilld')

const repoHubGithubUrl = computed(() => {
  const hub = repoHub.value
  return repoSource.value?.githubUrl ?? `https://github.com/${hub.owner}/${hub.repo}`
})
const repositoryBadgeInput = computed(() => ({
  owner: repoHub.value.owner,
  repo: repoHub.value.repo,
  name: repoSkills.value[0]?.name ?? repoHub.value.repo,
  registryPath: repoHubPath(repoHub.value.owner, repoHub.value.repo),
}))

const repoSourceRequested = ref<string | null>(fetchRepoDetailsOnServer ? repoKey.value : null)
watch([repoRouteStatus, repoRouteTarget, repoKey], ([routeStatus, routeTarget, key]) => {
  const routeSettled = routeStatus === 'error' || (routeStatus === 'success' && routeTarget !== null)
  if (import.meta.server || !routeSettled || routeTarget?._tag === 'skill' || repoSourceRequested.value === key)
    return
  repoSourceRequested.value = key
  void refreshRepoSource()
}, { immediate: true })

const repoProfileRequested = ref<string | null>(null)
watch([repoSourceStatus, flatSkillName], ([sourceStatus, skillName]) => {
  const key = repoKey.value
  const sourceKey = repoSource.value
    ? `${repoSource.value.owner}/${repoSource.value.repo}`.toLowerCase()
    : null
  const sourceSettled = sourceStatus === 'error' || (sourceStatus === 'success' && sourceKey === key)
  if (import.meta.server || !sourceSettled || skillName || repoProfileRequested.value === key)
    return
  repoProfileRequested.value = key
  void refreshRepo()
}, { immediate: true })

const siteOrigin = 'https://skilld.dev'
const sourceHubCanonicalUrl = computed(() => {
  return `${siteOrigin}${repoHubPath(repoHub.value.owner, repoHub.value.repo)}`
})

const skillTitle = computed(() => `${repoHub.value.owner}/${repoHub.value.repo} skills`)

const skillDescription = computed(() => {
  const count = repoSkills.value.length
  return sourceDescription.value || `${count} agent ${count === 1 ? 'skill' : 'skills'} from ${sourceDisplayName.value || repoHub.value.owner} on skilld.`
})

useSeoMeta({
  title: () => skillTitle.value,
  description: () => skillDescription.value,
  // The API decides `seoIndexable` from the route identity. `repoSource` is null
  // for a renamed repository, whose GitHub identity differs from the registry
  // route, so reading it here made `/gh/hyf0/vue-skills` noindex while the
  // sitemap listed it. Read the fetched value directly.
  robots: () => fetchedRepoSource.value?.seoIndexable ? 'index,follow' : 'noindex,follow',
  ogTitle: () => skillTitle.value,
  ogDescription: () => skillDescription.value,
  twitterTitle: () => skillTitle.value,
  twitterDescription: () => skillDescription.value,
})

useHead(computed(() => ({
  link: [
    {
      rel: 'canonical',
      href: sourceHubCanonicalUrl.value,
    },
  ],
})))
</script>

<template>
  <SkillDetail
    v-if="flatSkillName"
    :owner="repoHub.owner"
    :repo="repoHub.repo"
    :name="flatSkillName"
  />
  <div v-else>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-10 pb-8 md:pt-14"
      aria-labelledby="repo-heading"
    >
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

      <div
        v-if="repoPageLoading"
        aria-busy="true"
        class="space-y-4"
      >
        <span class="sr-only">Loading repository details</span>
        <div class="flex items-start gap-3">
          <USkeleton class="size-12 rounded-md" />
          <div class="min-w-0 flex-1 space-y-2">
            <USkeleton class="h-6 w-64 max-w-full" />
            <USkeleton class="h-4 w-48 max-w-full" />
          </div>
        </div>
        <USkeleton class="h-4 w-full max-w-xl" />
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <USkeleton v-for="index in 4" :key="index" class="h-20 w-full" />
        </div>
      </div>

      <div
        v-else-if="repoSourceError || !repoSource"
        class="py-12 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <h1
          id="repo-heading"
          class="mt-3 font-mono text-lg font-medium"
        >
          Source not found
        </h1>
        <p class="mt-1 text-sm text-muted">
          Couldn't load <code class="font-mono">{{ sourceDisplayName }}</code> from GitHub or the skill index.
        </p>
        <div class="mt-4 flex items-center justify-center gap-2">
          <UButton
            to="/skills"
            label="Browse skills"
            size="sm"
            variant="outline"
            color="neutral"
          />
          <UButton
            label="Retry"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="refreshRepoSource()"
          />
        </div>
      </div>

      <template v-else>
        <div class="flex items-start gap-3">
          <NuxtLink
            :to="ownerHubPath(sourceHub.owner ?? repoProfile?.owner ?? '')"
            class="shrink-0"
            :aria-label="`${sourceHub.owner ?? repoProfile?.owner} profile`"
          >
            <img
              :src="avatarProxyUrl(sourceAvatar)"
              :alt="`${sourceHub.owner ?? repoProfile?.owner} avatar`"
              width="48"
              height="48"
              class="size-12 rounded-full border border-default"
            >
          </NuxtLink>
          <div class="min-w-0 flex-1">
            <h1
              id="repo-heading"
              class="font-mono text-xl font-medium"
            >
              {{ sourceDisplayName }}
            </h1>
            <p
              v-if="sourceDescription"
              class="mt-2 max-w-2xl text-sm text-muted leading-relaxed"
            >
              {{ sourceDescription }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span
                v-if="sourceDefaultBranch"
                class="data-label inline-flex items-center gap-1"
              >
                <UIcon
                  name="i-lucide-git-branch"
                  class="size-3.5"
                  aria-hidden="true"
                />
                {{ sourceDefaultBranch }}
              </span>
              <span
                v-if="sourcePushedAt"
                class="data-label inline-flex items-center gap-1"
                :title="new Date(sourcePushedAt).toLocaleDateString()"
              >
                <UIcon
                  name="i-lucide-clock"
                  class="size-3.5"
                  aria-hidden="true"
                />
                Updated {{ sourcePushedAtAgo }}
              </span>
              <UButton
                :href="repoHubGithubUrl"
                target="_blank"
                rel="noopener"
                label="GitHub"
                icon="i-simple-icons-github"
                size="xs"
                color="neutral"
                variant="ghost"
              />
              <BadgeEmbedControl v-bind="repositoryBadgeInput" />
            </div>
          </div>
        </div>

        <section ref="repoStatsSection" class="mt-6" aria-labelledby="repo-stats-heading">
          <h2 id="repo-stats-heading" class="sr-only">
            Repository statistics
          </h2>
          <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <li class="rounded-lg border border-default bg-muted/30 p-3">
              <p class="data-label inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-package" class="size-3.5" aria-hidden="true" />
                Indexed skills
              </p>
              <div class="mt-2 flex min-h-8 items-end justify-between gap-3">
                <USkeleton v-if="repoSkillsLoading" class="h-7 w-12" />
                <p v-else class="font-mono text-xl font-medium tabular-nums">
                  {{ repoSkills.length.toLocaleString() }}
                </p>
                <div class="h-7 w-20 shrink-0 sm:w-24">
                  <USkeleton
                    v-if="repoHistoryStatus === 'pending'"
                    class="h-full w-full"
                    aria-label="Loading indexed skill history"
                  />
                  <RepoSparkline
                    v-else-if="skillHistoryPoints.length"
                    :points="skillHistoryPoints"
                    label="Indexed skills"
                  />
                </div>
              </div>
            </li>
            <li class="rounded-lg border border-default bg-muted/30 p-3">
              <p class="data-label inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-folder-tree" class="size-3.5" aria-hidden="true" />
                Skill groups
              </p>
              <USkeleton v-if="repoSkillsLoading" class="mt-2 h-7 w-10" />
              <p v-else class="mt-2 font-mono text-xl font-medium tabular-nums">
                {{ skillGroups.length.toLocaleString() }}
              </p>
            </li>
            <li class="rounded-lg border border-default bg-muted/30 p-3">
              <p class="data-label inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-star" class="size-3.5" aria-hidden="true" />
                GitHub stars
              </p>
              <div class="mt-2 flex min-h-8 items-end justify-between gap-3">
                <p class="font-mono text-xl font-medium tabular-nums">
                  {{ sourceStars.toLocaleString() }}
                </p>
                <div class="h-7 w-20 shrink-0 sm:w-24">
                  <USkeleton
                    v-if="repoHistoryStatus === 'pending'"
                    class="h-full w-full"
                    aria-label="Loading GitHub star history"
                  />
                  <RepoSparkline
                    v-else-if="starHistoryPoints.length"
                    :points="starHistoryPoints"
                    label="GitHub stars"
                    approximate
                  />
                  <span
                    v-else-if="starHistoryTrackingLabel"
                    class="block text-right text-[10px] leading-tight text-muted"
                    :title="starHistoryTrackingLabel"
                  >
                    {{ starHistoryTrackingLabel }}
                  </span>
                  <span
                    v-else-if="repoHistoryStatus === 'error' || repoHistoryError"
                    class="block text-right text-[10px] leading-tight text-muted"
                    title="GitHub star history is temporarily unavailable"
                  >
                    History unavailable
                  </span>
                </div>
              </div>
            </li>
            <li class="rounded-lg border border-default bg-muted/30 p-3">
              <p class="data-label inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-git-fork" class="size-3.5" aria-hidden="true" />
                Forks
              </p>
              <p class="mt-2 font-mono text-xl font-medium tabular-nums">
                {{ sourceForks.toLocaleString() }}
              </p>
            </li>
          </ul>
        </section>

        <USeparator class="my-8" />

        <section aria-labelledby="repo-skills-heading">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
              <h2 id="repo-skills-heading" class="section-label">
                {{ groupedSkills ? 'Skills by folder' : 'Skills' }}
              </h2>
              <span v-if="repoSkills.length" class="data-label shrink-0">
                {{ repoSkills.length }} total
              </span>
            </div>
            <div v-if="repoSkills.length" class="flex items-center gap-2">
              <label for="repo-skill-sort" class="sr-only">Sort skills</label>
              <USelect
                id="repo-skill-sort"
                :model-value="skillSort"
                :items="REPO_SKILL_SORT_OPTIONS"
                aria-label="Sort skills"
                size="sm"
                class="min-w-42"
                @update:model-value="setSkillSort"
              />
              <div
                v-if="hasFolderGrouping"
                role="group"
                aria-label="Skill grouping"
                class="flex items-center gap-0.5 rounded-lg border border-default bg-muted/40 p-0.5"
              >
                <button
                  v-for="option in groupingOptions"
                  :key="String(option.value)"
                  type="button"
                  :aria-label="option.label"
                  :aria-pressed="groupedSkills === option.value"
                  :title="option.label"
                  class="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-muted outline-none transition-colors hover:text-default focus-visible:ring-2 focus-visible:ring-primary sm:size-8"
                  :class="groupedSkills === option.value ? 'bg-default text-default shadow-sm' : ''"
                  @click="setGroupedSkills(option.value)"
                >
                  <UIcon :name="option.icon" class="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="repoSkillsLoading"
            class="grid gap-3 lg:grid-cols-2"
            aria-busy="true"
          >
            <span class="sr-only">Loading indexed skills</span>
            <USkeleton v-for="index in 6" :key="index" class="h-24 w-full" />
          </div>
          <div
            v-else-if="sortedRepoSkills.length && !groupedSkills"
            class="grid gap-3"
          >
            <RepoSkillCard
              v-for="skill in sortedRepoSkills"
              :key="skill.slug"
              :skill="skill"
            />
          </div>
          <div v-else-if="skillGroups.length" class="space-y-8">
            <section
              v-for="group in skillGroups"
              :key="group.key"
              :aria-labelledby="`skill-group-${group.key}`"
            >
              <div class="flex items-center gap-3 border-b border-default pb-2">
                <h3
                  :id="`skill-group-${group.key}`"
                  class="font-mono text-sm font-medium"
                >
                  {{ group.label }}
                </h3>
                <span class="data-label">
                  {{ group.skills.length }} {{ group.skills.length === 1 ? 'skill' : 'skills' }}
                </span>
              </div>
              <div class="mt-3 grid gap-3 lg:grid-cols-2">
                <RepoSkillCard
                  v-for="skill in group.skills"
                  :key="skill.slug"
                  :skill="skill"
                />
              </div>
            </section>
          </div>
          <p
            v-else-if="!sourceConfirmedNoSkillMd"
            class="text-sm text-muted leading-relaxed"
          >
            No indexed skills for this repository yet.
          </p>
          <div
            v-if="repoSourceScanNotice"
            class="mt-6 flex items-start gap-3 rounded-lg border border-default bg-muted/30 p-4 text-sm"
            role="status"
          >
            <UIcon
              name="i-lucide-info"
              class="mt-0.5 size-4 shrink-0 text-muted"
              aria-hidden="true"
            />
            <p class="text-muted leading-relaxed">
              {{ repoSourceScanNotice }}
            </p>
          </div>
          <div
            v-if="sourceConfirmedNoSkillMd"
            class="mt-6 rounded-lg border border-dashed border-default p-4 sm:p-5"
          >
            <div class="flex items-start gap-3">
              <UIcon
                name="i-lucide-file-plus"
                class="mt-0.5 size-5 shrink-0 text-muted"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <h3 class="font-mono text-sm font-medium">
                  Add a SKILL.md for this repo
                </h3>
                <p class="mt-1 max-w-2xl text-sm text-muted leading-relaxed">
                  skilld did not find a SKILL.md in {{ sourceDisplayName }}. Add one to describe how agents should work in this repository.
                </p>
                <div class="mt-3 flex items-center gap-2">
                  <code class="min-w-0 flex-1 truncate rounded-lg border border-default bg-muted px-3 py-2 font-mono text-sm">
                    {{ skilldInitCmd }}
                  </code>
                  <UButton
                    :href="repoHubGithubUrl"
                    target="_blank"
                    rel="noopener"
                    label="Open repo"
                    icon="i-simple-icons-github"
                    size="sm"
                    color="neutral"
                    variant="outline"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <USeparator class="my-8" />

        <BadgeReadmeSnippet v-bind="repositoryBadgeInput" />
      </template>
    </section>
  </div>
</template>
