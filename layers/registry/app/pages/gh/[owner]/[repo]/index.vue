<script setup lang="ts">
import type { OrgProfile } from '../../../../../server/api/orgs/[owner].get'
import type { RepoSourceProfile } from '../../../../../server/api/repos/[owner]/[repo].get'

const route = useRoute()
const owner = computed(() => String(route.params.owner ?? ''))
const repo = computed(() => String(route.params.repo ?? ''))
const repoHub = computed(() => ({ owner: owner.value, repo: repo.value }))
const sourceHub = computed(() => repoHub.value)
const { isBot } = useBotDetection()

const { data: repoProfile, refresh: refreshRepo } = useFetch<OrgProfile>(
  () => `/api/orgs/${sourceHub.value.owner}`,
  {
    watch: [sourceHub],
    lazy: !isBot.value,
    immediate: false,
    server: false,
  },
) as ReturnType<typeof useFetch<OrgProfile>>

const { data: repoSource, status: repoSourceStatus, error: repoSourceError, refresh: refreshRepoSource } = useFetch<RepoSourceProfile>(
  () => `/api/repos/${repoHub.value.owner}/${repoHub.value.repo}`,
  {
    watch: [repoHub],
    lazy: !isBot.value,
    immediate: true,
  },
) as ReturnType<typeof useFetch<RepoSourceProfile>>

const repoSkills = computed(() => selectRepoSkills(repoProfile.value, repoHub.value.repo))

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

const sourceDefaultBranch = computed(() => repoSource.value?.defaultBranch ?? null)
const sourcePushedAt = computed(() => repoSource.value?.pushedAt ?? null)
const sourceCreatedAt = computed(() => repoSource.value?.createdAt ?? null)
const sourcePushedAtDate = computed(() => sourcePushedAt.value ? new Date(sourcePushedAt.value) : null)
const sourceCreatedAtDate = computed(() => sourceCreatedAt.value ? new Date(sourceCreatedAt.value) : null)
const sourcePushedAtAgo = useTimeAgo(computed(() => sourcePushedAtDate.value ?? new Date(0)))
const sourceCreatedAtAgo = useTimeAgo(computed(() => sourceCreatedAtDate.value ?? new Date(0)))

const skilldInitCmd = computed(() => 'npx -y skilld')

const repoHubGithubUrl = computed(() => {
  const hub = repoHub.value
  return repoSource.value?.githubUrl ?? `https://github.com/${hub.owner}/${hub.repo}`
})

onMounted(() => {
  refreshRepo()
})

const siteOrigin = 'https://skilld.dev'
const sourceHubCanonicalUrl = computed(() => {
  const flatName = flatSkillName.value
  return `${siteOrigin}${flatName ? repoSkillPath(repoHub.value.owner, repoHub.value.repo, flatName) : repoHubPath(repoHub.value.owner, repoHub.value.repo)}`
})

const skillTitle = computed(() => `${repoHub.value.owner}/${repoHub.value.repo} skills`)

const skillDescription = computed(() => {
  const count = repoSkills.value.length
  return sourceDescription.value || `${count} agent ${count === 1 ? 'skill' : 'skills'} from ${sourceDisplayName.value || repoHub.value.owner} on skilld.`
})

useSeoMeta({
  title: () => skillTitle.value,
  description: () => skillDescription.value,
  robots: 'noindex,follow',
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
        v-if="repoSourceStatus === 'pending' && !repoSource"
        aria-busy="true"
        class="space-y-4"
      >
        <div class="flex items-start gap-3">
          <USkeleton class="size-12 rounded-md" />
          <div class="min-w-0 flex-1 space-y-2">
            <USkeleton class="h-6 w-64 max-w-full" />
            <USkeleton class="h-4 w-48 max-w-full" />
          </div>
        </div>
        <USkeleton class="h-4 w-full max-w-xl" />
        <USkeleton class="h-24 w-full" />
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
              :src="sourceAvatar"
              :alt="`${sourceHub.owner ?? repoProfile?.owner} avatar`"
              width="48"
              height="48"
              class="size-12 rounded-md border border-default"
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
            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span class="data-label inline-flex items-center gap-1">
                <UIcon
                  name="i-lucide-package"
                  class="size-3.5"
                  aria-hidden="true"
                />
                {{ repoSkills.length }} {{ repoSkills.length === 1 ? 'skill' : 'skills' }}
              </span>
              <span
                v-if="sourceStars"
                class="data-label inline-flex items-center gap-1"
              >
                <UIcon
                  name="i-lucide-star"
                  class="size-3.5"
                  aria-hidden="true"
                />
                {{ sourceStars.toLocaleString() }}
              </span>
              <span
                v-if="sourceForks"
                class="data-label inline-flex items-center gap-1"
              >
                <UIcon
                  name="i-lucide-git-fork"
                  class="size-3.5"
                  aria-hidden="true"
                />
                {{ sourceForks.toLocaleString() }}
              </span>
              <span
                v-if="repoSource && repoSource.skillFileScanStatus === 'ok'"
                class="data-label inline-flex items-center gap-1"
              >
                <UIcon
                  name="i-lucide-file-text"
                  class="size-3.5"
                  aria-hidden="true"
                />
                {{ repoSource.skillFileCount }} SKILL.md
              </span>
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
              <span
                v-if="sourceCreatedAt"
                class="data-label inline-flex items-center gap-1"
                :title="new Date(sourceCreatedAt).toLocaleDateString()"
              >
                <UIcon
                  name="i-lucide-sparkles"
                  class="size-3.5"
                  aria-hidden="true"
                />
                Created {{ sourceCreatedAtAgo }}
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
            </div>
          </div>
        </div>

        <USeparator class="my-8" />

        <section aria-labelledby="repo-skills-heading">
          <h2
            id="repo-skills-heading"
            class="section-label mb-3"
          >
            Indexed skills
          </h2>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SkillCard
              v-for="skill in repoSkills"
              :key="skill.slug"
              :skill="skill"
              signal="stars"
              :show-copy="false"
              show-owner-path
              timestamp-label="Updated"
            />
          </div>
          <p
            v-if="!repoSkills.length && !sourceConfirmedNoSkillMd"
            class="text-sm text-muted leading-relaxed"
          >
            No indexed skills for this repository yet.
          </p>
          <div
            v-if="sourceSkillFiles.length"
            class="mt-6 rounded-lg border border-default p-4"
          >
            <h3 class="font-mono text-sm font-medium">
              SKILL.md files
            </h3>
            <ul class="mt-3 space-y-2">
              <li
                v-for="path in sourceSkillFiles"
                :key="path"
              >
                <a
                  :href="`${repoHubGithubUrl}/blob/${sourceDefaultBranch}/${path}`"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex min-w-0 items-center gap-2 font-mono text-xs text-muted hover:text-default transition-colors"
                >
                  <UIcon
                    name="i-lucide-file-text"
                    class="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{ path }}</span>
                </a>
              </li>
            </ul>
          </div>
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
      </template>
    </section>
  </div>
</template>
