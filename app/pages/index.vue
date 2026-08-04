<script setup lang="ts">
import type { FeaturedCollectionsResponse } from '~~/server/api/collections/featured.get'
import type { RecentPublishesResponse } from '~~/server/api/feed/recent-publishes.get'
import type { RecentUpdateCard, RecentUpdatesResponse } from '~~/server/api/feed/recent-updates.get'
import type { AskSkillEvent, AskSkillResult } from '#shared/ask-skill-search'
import type { SkillSourceItem } from '../types/skill-source'
import type { FeaturedPersonSection } from '../utils/homepage-person-skills'
import {
  AskSkillsRequestSchema,
  consumeNdjsonChunk,
  parseAskSkillEventLine,
} from '#shared/ask-skill-search'
import OutcomeClusterGrid from '../components/OutcomeClusterGrid.vue'
import { homepagePersonSkillFallbacks } from '../data/homepage-person-skills'
import {
  HOMEPAGE_PERSON_MINIMUM,
  HOMEPAGE_SKILL_LIMIT,
  selectHomepagePersonSkills,
} from '../utils/homepage-person-skills'

const title = 'Curated agent skills by humans · skilld'
const description = 'Agent skills written by real maintainers in their own GitHub repos. See who wrote it and read the SKILL.md before you install.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

useHead({
  titleTemplate: null,
  templateParams: { separator: '·' },
})

defineOgImage('Splash.takumi', {}, { alt: 'skilld, curated agent skills by humans' })

const serverTimingHeader = useResponseHeader('Server-Timing')
const homeDataStartedAt = performance.now()
const homeDataTimings: string[] = []

function withHomeDataTiming<T>(name: string, request: Promise<T>): Promise<T> {
  if (import.meta.client)
    return request

  const startedAt = performance.now()
  return request.finally(() => {
    homeDataTimings.push(`${name};dur=${(performance.now() - startedAt).toFixed(1)}`)
  })
}

const searchQuery = ref('')
const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('searchInput')

type AskSkillState
  = | { _tag: 'idle' }
    | { _tag: 'loading', query: string }
    | { _tag: 'streaming', query: string, items: AskSkillResult[], answer: string }
    | { _tag: 'ready', query: string, items: AskSkillResult[], answer: string }
    | { _tag: 'empty', query: string }
    | { _tag: 'error', query: string, items: AskSkillResult[], answer: string, message: string }

const askState = shallowRef<AskSkillState>({ _tag: 'idle' })
const askValidationError = ref('')
const askAnnouncement = ref('')
const copyAnnouncement = ref('')
let askController: AbortController | null = null

const askPending = computed(() => askState.value._tag === 'loading' || askState.value._tag === 'streaming')
const askItems = computed(() => {
  const state = askState.value
  return state._tag === 'streaming' || state._tag === 'ready' || state._tag === 'error'
    ? state.items
    : []
})
const askAnswer = computed(() => {
  const state = askState.value
  return state._tag === 'streaming' || state._tag === 'ready' || state._tag === 'error'
    ? state.answer
    : ''
})
const askStatusLabel = computed(() => {
  if (askState.value._tag === 'loading')
    return 'Searching'
  if (askState.value._tag === 'streaming')
    return 'Answering'
  if (askState.value._tag === 'ready')
    return 'Ready'
  if (askState.value._tag === 'empty')
    return 'No matches'
  if (askState.value._tag === 'error')
    return 'Partial result'
  return ''
})

const selectedInstallCommand = ref('')
const selectedInstallSkill = shallowRef<AskSkillResult | null>(null)
const copiedInstallKey = refAutoReset('', 2000)
const { copy: copyAskInstall } = useInstallCopy(
  selectedInstallCommand,
  'homepage-ask-ai',
  () => selectedInstallSkill.value
    ? { kind: 'skill', owner: selectedInstallSkill.value.owner, name: selectedInstallSkill.value.name }
    : null,
)

function searchSkills() {
  askController?.abort()
  const q = searchQuery.value.trim()
  return navigateTo(q ? { path: '/skills', query: { q } } : '/skills')
}

function askSkillKey(skill: AskSkillResult): string {
  return `${skill.owner}/${skill.repo}/${skill.name}`
}

function askTrustLabel(skill: AskSkillResult): string {
  if (skill.official || skill.trustTier === 'official')
    return 'Official'
  if (skill.trustTier === 'trusted-author')
    return 'Trusted author'
  if (skill.trustTier === 'trusted-curator')
    return 'Curator reviewed'
  if (skill.trustTier === 'candidate')
    return 'Candidate'
  if (skill.trustTier === 'quarantined')
    return 'Source unavailable'
  return 'Unreviewed'
}

function failAskSkills(message: string): void {
  const state = askState.value
  askState.value = {
    _tag: 'error',
    query: state._tag !== 'idle' ? state.query : searchQuery.value.trim(),
    items: state._tag === 'streaming' || state._tag === 'ready' || state._tag === 'error' ? state.items : [],
    answer: state._tag === 'streaming' || state._tag === 'ready' || state._tag === 'error' ? state.answer : '',
    message,
  }
  askAnnouncement.value = message
}

function applyAskSkillEvent(event: AskSkillEvent): boolean {
  if (event._tag === 'results') {
    askState.value = event.items.length
      ? { _tag: 'streaming', query: event.query, items: event.items, answer: '' }
      : { _tag: 'empty', query: event.query }
    return true
  }

  if (event._tag === 'delta') {
    const state = askState.value
    if (state._tag !== 'streaming')
      throw new Error('Ask AI returned text before registry results.')
    askState.value = { ...state, answer: `${state.answer}${event.text}` }
    return true
  }

  if (event._tag === 'error') {
    failAskSkills(event.message)
    return false
  }

  const state = askState.value
  if (state._tag === 'streaming') {
    askState.value = { ...state, _tag: 'ready' }
    askAnnouncement.value = `AI recommendation ready with ${state.items.length} skill${state.items.length === 1 ? '' : 's'}.`
  }
  else if (state._tag === 'empty') {
    askAnnouncement.value = 'No matching skills found.'
  }
  return false
}

async function readAskSkillStream(response: Response): Promise<void> {
  if (!response.ok)
    throw new Error(`Ask AI request failed with ${response.status}.`)
  if (!response.body)
    throw new Error('Ask AI returned no response stream.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  while (!finished) {
    const { done, value } = await reader.read()
    const consumed = consumeNdjsonChunk(buffer, decoder.decode(value, { stream: !done }))
    buffer = consumed.rest

    for (const line of consumed.lines) {
      const parsed = parseAskSkillEventLine(line)
      if (parsed._tag === 'error')
        throw new Error(parsed.message)
      if (!applyAskSkillEvent(parsed.data)) {
        finished = true
        break
      }
    }

    if (done)
      break
  }

  if (!finished && buffer.trim()) {
    const parsed = parseAskSkillEventLine(buffer.trim())
    if (parsed._tag === 'error')
      throw new Error(parsed.message)
    finished = !applyAskSkillEvent(parsed.data)
  }

  if (!finished)
    throw new Error('Ask AI response ended before completion.')
}

async function askSkills(): Promise<void> {
  const parsed = AskSkillsRequestSchema.safeParse({ query: searchQuery.value })
  if (!parsed.success) {
    askValidationError.value = searchQuery.value.trim().length < 2
      ? 'Describe the task in at least 2 characters.'
      : 'Keep the request under 240 characters.'
    searchInput.value?.inputRef?.focus()
    return
  }

  askValidationError.value = ''
  askAnnouncement.value = ''
  searchQuery.value = parsed.data.query
  askController?.abort()
  const controller = new AbortController()
  askController = controller
  askState.value = { _tag: 'loading', query: parsed.data.query }

  const result = await fetch('/api/skills/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    signal: controller.signal,
  })
    .then(readAskSkillStream)
    .then(() => ({ _tag: 'ok' as const }))
    .catch(error => ({ _tag: 'error' as const, error }))

  if (askController === controller)
    askController = null
  if (controller.signal.aborted)
    return
  if (result._tag === 'error') {
    console.warn('[ask-skills] request failed', result.error)
    failAskSkills('Could not finish the AI recommendation. The registry results, if loaded, are still usable.')
  }
}

async function retryAskSkills(): Promise<void> {
  if (askState.value._tag !== 'idle')
    searchQuery.value = askState.value.query
  await askSkills()
}

async function copyAskInstallCommand(skill: AskSkillResult): Promise<void> {
  selectedInstallCommand.value = skill.installCommand
  selectedInstallSkill.value = skill
  const result = await copyAskInstall(skill.installCommand)
  if (result._tag === 'copied') {
    copiedInstallKey.value = askSkillKey(skill)
    copyAnnouncement.value = `Install command copied for ${skill.name}.`
  }
  else {
    copyAnnouncement.value = result.message
  }
}

watch(searchQuery, () => {
  askValidationError.value = ''
})

onBeforeUnmount(() => askController?.abort())

const [
  {
    data: collectionsData,
    status: collectionsStatus,
    error: collectionsError,
    refresh: refreshCollections,
  },
  {
    data: updatesData,
    status: updatesStatus,
    error: updatesError,
    refresh: refreshUpdates,
  },
  {
    data: publishesData,
    status: publishesStatus,
    error: publishesError,
    refresh: refreshPublishes,
  },
] = await Promise.all([
  withHomeDataTiming('home-featured', useFetch<FeaturedCollectionsResponse>('/api/collections/featured', {
    key: 'home-featured-collections-v6',
  })),
  withHomeDataTiming('home-updates', useFetch<RecentUpdatesResponse>('/api/feed/recent-updates', {
    key: 'home-recent-updates-v2',
  })),
  withHomeDataTiming('home-publishes', useFetch<RecentPublishesResponse>('/api/feed/recent-publishes', {
    key: 'home-recent-publishes-v2',
  })),
])

if (import.meta.server) {
  homeDataTimings.push(`home-data;dur=${(performance.now() - homeDataStartedAt).toFixed(1)}`)
  serverTimingHeader.value = homeDataTimings.join(', ')
}

const featuredCollections = computed(() =>
  (collectionsData.value?.items ?? []).map(collection => ({
    ...collection,
    skills: collection.skills ?? [],
  })),
)
const leadCollection = computed(() => featuredCollections.value[0] ?? null)
const supportingCollections = computed(() => featuredCollections.value.slice(1, 3))
const recentUpdates = computed(() => updatesData.value?.items ?? [])
const recentPublishes = computed(() => publishesData.value?.items ?? [])

type FeaturedCollectionSkill = FeaturedCollectionsResponse['items'][number]['skills'][number]
type FeaturedCollection = FeaturedCollectionsResponse['items'][number]

interface FeaturedPeopleResponse {
  devSections: FeaturedPersonSection[]
}

const {
  data: peopleSkillsData,
  execute: loadPeopleSkills,
} = await useFetch<FeaturedPeopleResponse>('/api/skills/featured', {
  key: 'home-person-skills-v1',
  query: {
    orgs: 0,
    perOrg: 1,
    devs: 20,
    perDev: 2,
  },
  server: false,
  lazy: true,
  immediate: false,
})

onMounted(() => loadPeopleSkills())

function featuredCollectionSkillPath(skill: FeaturedCollectionSkill): string {
  return skill.name
    ? repoSkillPath(skill.owner, skill.repo, skill.name)
    : repoHubPath(skill.owner, skill.repo)
}

function featuredCollectionSkillLabel(skill: FeaturedCollectionSkill): string {
  return skill.name ? `/${skill.name}` : skill.repo
}

function collectionSkillOwners(collection: FeaturedCollection): string[] {
  return [...new Set(collection.skills.map(skill => skill.owner))].slice(0, 3)
}

function collectionSkillOwnerLabel(collection: FeaturedCollection): string {
  return collectionSkillOwners(collection).map(owner => `@${owner}`).join(' + ')
}

const fallbackPersonNamesByOwner = new Map<string, string>(
  homepagePersonSkillFallbacks.map(skill => [skill.owner, skill.maintainerName]),
)

const heroSkillCards = computed<readonly SkillSourceItem[]>(() => {
  const liveSkills = selectHomepagePersonSkills(
    peopleSkillsData.value?.devSections ?? [],
    fallbackPersonNamesByOwner,
  )
  const livePeople = new Set(liveSkills.map(skill => skill.owner))

  return liveSkills.length === HOMEPAGE_SKILL_LIMIT
    && livePeople.size >= HOMEPAGE_PERSON_MINIMUM
    ? liveSkills
    : homepagePersonSkillFallbacks
})

const installCommand = computed(() => {
  const collection = leadCollection.value
  return collection
    ? collectionInstallCmd(collection.authorLogin, collection.slug)
    : ''
})

const fallbackHeroInstallCommand = gitInstallCmd('antfu', 'skills')

const installTarget = computed<InstallTarget | null>(() => {
  const collection = leadCollection.value
  return collection
    ? { kind: 'collection', handle: collection.authorLogin, slug: collection.slug }
    : null
})
const heroInstallCommand = computed(() => installCommand.value || fallbackHeroInstallCommand)
const heroInstallTarget = computed<InstallTarget>(() => installTarget.value ?? {
  kind: 'skill',
  owner: 'antfu',
  name: 'skills',
})
const { copy: copyHeroInstall } = useInstallCopy(
  heroInstallCommand,
  'homepage-hero',
  heroInstallTarget,
)
const heroCopyState = refAutoReset<InstallCopyResult | { _tag: 'idle' }>({ _tag: 'idle' }, 2500)

async function copyHeroInstallCommand() {
  heroCopyState.value = await copyHeroInstall()
}

const { copy: copyFeaturedInstall } = useInstallCopy(
  installCommand,
  'homepage-featured-collection',
  installTarget,
)
const copyState = refAutoReset<InstallCopyResult | { _tag: 'idle' }>({ _tag: 'idle' }, 2500)

async function copyInstallCommand() {
  if (!installCommand.value)
    return

  copyState.value = await copyFeaturedInstall()
}

const renderNow = useState('render:now', () => Number(new Date()))

function formatRelative(ts: number): string {
  const diff = renderNow.value - ts * 1000
  const days = Math.floor(diff / 86_400_000)
  if (days < 1)
    return 'today'
  if (days < 2)
    return 'yesterday'
  if (days < 30)
    return `${days}d ago`
  if (days < 365)
    return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function recentUpdateKey(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? `repo:${item.owner}/${item.repo}`
    : `skill:${item.owner}/${item.repo}/${item.name}`
}

function recentUpdatePath(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? repoHubPath(item.owner, item.repo)
    : repoSkillPath(item.owner, item.repo, item.name)
}

function recentUpdateTitle(item: RecentUpdateCard): string {
  return item.kind === 'repo'
    ? `${item.owner}/${item.repo}`
    : item.displayName
}

function recentUpdateDescription(item: RecentUpdateCard): string {
  if (item.kind === 'skill')
    return item.changeSummary ?? item.description ?? `${item.owner}/${item.repo}`

  if (item.changeSummary)
    return item.changeSummary

  const names = item.skills.slice(0, 3).map(skill => `/${skill.name}`).join(' · ')
  return item.skillCount > 3 ? `${names} · +${item.skillCount - 3} more` : names
}
</script>

<template>
  <div class="home-page overflow-clip">
    <section
      class="editorial-band home-band--hero border-b border-default"
      aria-labelledby="hero-heading"
    >
      <NoiseField :opacity="0.24" />
      <div
        class="editorial-atmosphere"
        data-palette="rose"
        data-geometry="sky"
        data-intensity="ambient"
        aria-hidden="true"
      />

      <div class="editorial-band__content mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 md:pb-24 md:pt-24">
        <div class="home-hero-grid grid items-center gap-12 lg:grid-cols-[minmax(0,1.18fr)_minmax(24rem,0.82fr)] lg:gap-12 xl:gap-16">
          <div class="home-hero-copy min-w-0">
            <p class="section-label mb-5">
              Reusable instructions for coding agents
            </p>
            <!-- The eyebrow names the category for anyone who has not met a
                 SKILL.md yet; the heading and subhead carry the provenance
                 claim that separates this from a generated skill dump. -->
            <h1 id="hero-heading" class="home-display home-display--split max-w-[13ch] font-semibold tracking-[-0.045em] text-balance">
              Curated agent skills by humans.
            </h1>
            <p class="mt-6 max-w-2xl text-lg leading-relaxed text-muted text-pretty sm:text-xl">
              Every skill here is a SKILL.md someone wrote in their own repo. Search the work you need done, see who wrote it, then install it.
            </p>

            <div class="mt-7 max-w-2xl">
              <p class="data-label mb-2">
                Install a curated collection
              </p>
              <div class="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-default bg-muted/60">
                <code
                  id="hero-install-command"
                  tabindex="0"
                  class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-sm leading-6"
                >{{ heroInstallCommand }}</code>
                <UButton
                  :icon="heroCopyState._tag === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
                  :label="heroCopyState._tag === 'copied' ? 'Copied' : 'Copy'"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11 shrink-0 rounded-none border-l border-default px-4"
                  @click="copyHeroInstallCommand"
                />
              </div>
              <p
                class="sr-only"
                aria-live="polite"
              >
                <template v-if="heroCopyState._tag === 'copied'">
                  Install command copied.
                </template>
                <template v-else-if="heroCopyState._tag === 'error'">
                  {{ heroCopyState.message }}
                </template>
              </p>
            </div>

            <form
              class="mt-7 flex max-w-2xl flex-col gap-3 sm:flex-row"
              role="search"
              action="/skills"
              method="get"
              @submit.prevent="askSkills"
            >
              <label for="home-skill-search" class="sr-only">Describe the skill you need</label>
              <UInput
                id="home-skill-search"
                ref="searchInput"
                v-model="searchQuery"
                name="q"
                type="search"
                autocomplete="off"
                placeholder="Try “debug a flaky test” or a maintainer…"
                icon="i-lucide-sparkles"
                size="xl"
                class="min-w-0 flex-1 [&_input]:min-h-11"
                maxlength="240"
                :aria-invalid="askValidationError ? 'true' : undefined"
                :aria-describedby="askValidationError ? 'home-skill-search-error' : 'home-skill-search-help'"
              />
              <div class="grid grid-cols-2 gap-2 sm:flex">
                <UButton
                  type="submit"
                  label="Ask AI"
                  icon="i-lucide-sparkles"
                  size="xl"
                  :loading="askPending"
                  class="min-h-11 justify-center"
                />
                <UButton
                  type="button"
                  label="Search"
                  trailing-icon="i-lucide-arrow-right"
                  color="neutral"
                  variant="outline"
                  size="xl"
                  class="min-h-11 justify-center"
                  @click="searchSkills"
                />
              </div>
            </form>

            <p
              v-if="askValidationError"
              id="home-skill-search-error"
              role="alert"
              class="mt-2 max-w-2xl text-sm text-error"
            >
              {{ askValidationError }}
            </p>
            <p
              v-else
              id="home-skill-search-help"
              class="mt-2 max-w-2xl font-mono text-xs text-muted"
            >
              Ask AI explains the top registry matches. Search opens the full result set.
            </p>

            <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <UButton
                to="/skills"
                label="Browse all skills"
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
              <p class="font-mono text-xs text-muted">
                Every result links to its source SKILL.md.
              </p>
            </div>
          </div>

          <div class="min-w-0">
            <div class="home-hero-proof-head px-1 pb-3">
              <p class="data-label">
                Skills from people who do the work
              </p>
            </div>
            <SkillSourceList
              :items="heroSkillCards"
              variant="stream"
              auto-scroll
              aria-label="Person-authored skills"
            />
          </div>
        </div>

        <section
          v-if="askState._tag !== 'idle'"
          class="mt-12 border-t border-default pt-8"
          aria-labelledby="ask-skill-results-heading"
          :aria-busy="askPending"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="section-label">
                AI-assisted registry search
              </p>
              <h2 id="ask-skill-results-heading" class="mt-2 text-xl font-semibold text-highlighted">
                Recommended skills
              </h2>
            </div>
            <UBadge
              :label="askStatusLabel"
              color="neutral"
              variant="subtle"
              class="font-mono"
            />
          </div>

          <div
            v-if="askState._tag === 'loading'"
            class="mt-6 flex min-h-24 items-center gap-3 rounded-lg border border-default px-4 py-5 text-sm text-muted"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 motion-safe:animate-spin" aria-hidden="true" />
            Searching the registry…
          </div>

          <template v-else>
            <div
              v-if="askAnswer || askState._tag === 'streaming'"
              class="mt-6 rounded-lg border border-default bg-muted/40 px-4 py-4 sm:px-5"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-sparkles" class="size-4 text-primary" aria-hidden="true" />
                <p class="data-label">
                  Why these match
                </p>
                <UIcon
                  v-if="askState._tag === 'streaming'"
                  name="i-lucide-loader-circle"
                  class="ms-auto size-4 text-muted motion-safe:animate-spin"
                  aria-hidden="true"
                />
              </div>
              <p class="mt-3 max-w-4xl whitespace-pre-line text-sm leading-relaxed text-highlighted sm:text-base">
                {{ askAnswer || 'Reading the ranked shortlist…' }}
              </p>
            </div>

            <div
              v-if="askState._tag === 'error'"
              class="mt-6 flex flex-col gap-3 rounded-lg border border-default px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">
                  AI summary interrupted
                </p>
                <p class="mt-1 text-sm text-muted">
                  {{ askState.message }}
                </p>
              </div>
              <UButton
                label="Retry"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="outline"
                class="min-h-11 shrink-0 justify-center"
                @click="retryAskSkills"
              />
            </div>

            <div
              v-if="askState._tag === 'empty'"
              class="mt-6 rounded-lg border border-default px-4 py-5"
            >
              <p class="text-sm font-medium text-highlighted">
                Nothing matched that request.
              </p>
              <p class="mt-1 text-sm text-muted">
                Try a broader description, or open the full registry.
              </p>
              <UButton
                to="/skills"
                label="Browse skills"
                color="neutral"
                variant="outline"
                class="mt-4 min-h-11"
              />
            </div>

            <ol
              v-if="askItems.length"
              class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Ranked skill recommendations"
            >
              <li
                v-for="(skill, index) in askItems"
                :key="askSkillKey(skill)"
                class="flex min-w-0 flex-col rounded-lg border border-default bg-default p-4"
              >
                <div class="flex items-start gap-3">
                  <span class="data-label flex size-6 shrink-0 items-center justify-center rounded-full border border-default">
                    {{ index + 1 }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <NuxtLink
                      :to="skill.path"
                      class="block truncate font-mono text-sm font-medium text-highlighted hover:text-primary"
                    >
                      /{{ skill.name }}
                    </NuxtLink>
                    <p class="mt-0.5 truncate font-mono text-xs text-muted">
                      {{ skill.owner }}/{{ skill.repo }}
                    </p>
                  </div>
                  <UBadge
                    :label="askTrustLabel(skill)"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="shrink-0 font-mono"
                  />
                </div>

                <p v-if="skill.description" class="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">
                  {{ skill.description }}
                </p>
                <p v-if="skill.stars > 0" class="data-label mt-3 inline-flex items-center gap-1">
                  <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                  {{ formatGithubStars(skill.stars) }} GitHub stars
                </p>

                <div class="mt-auto pt-4">
                  <div class="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-default bg-muted/60">
                    <code
                      tabindex="0"
                      class="flex min-h-11 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap px-3 font-mono text-xs"
                    >{{ skill.installCommand }}</code>
                    <UButton
                      :icon="copiedInstallKey === askSkillKey(skill) ? 'i-lucide-check' : 'i-lucide-copy'"
                      color="neutral"
                      variant="ghost"
                      class="min-h-11 shrink-0 rounded-none border-l border-default"
                      :aria-label="copiedInstallKey === askSkillKey(skill) ? 'Copied' : `Copy install command for ${skill.name}`"
                      @click="copyAskInstallCommand(skill)"
                    />
                  </div>
                </div>
              </li>
            </ol>
          </template>
        </section>

        <p class="sr-only" aria-live="polite">
          {{ askAnnouncement }}
        </p>
        <p class="sr-only" aria-live="polite">
          {{ copyAnnouncement }}
        </p>
      </div>
    </section>

    <section
      id="outcomes"
      class="editorial-band home-outcomes-band border-b border-default"
      aria-labelledby="outcomes-heading"
    >
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:gap-12">
          <div class="home-outcomes-intro">
            <p class="section-label">
              Browse by outcome
            </p>
            <h2 id="outcomes-heading" class="home-outcomes-title mt-4 max-w-[12ch] font-semibold text-balance">
              What should your agent do?
            </h2>
            <p id="outcomes-description" class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
              Start with the job. Narrow by tool or maintainer later.
            </p>
          </div>
          <OutcomeClusterGrid aria-describedby="outcomes-description" />
        </div>
      </div>
    </section>

    <section
      id="featured-focus"
      class="editorial-band home-featured-band border-b border-default"
      aria-labelledby="featured-focus-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="ember"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="home-featured-heading">
          <div class="min-w-0">
            <p class="section-label">
              From the curator
            </p>
            <h2 id="featured-focus-heading" class="home-featured-title mt-4 text-balance">
              Three collections I'd install first.
            </h2>
            <p class="mt-4 max-w-xl text-base leading-relaxed text-muted text-pretty">
              They cover the work around the code: finding a skill, planning a change, and checking the result.
            </p>
          </div>
          <UButton
            to="/collections"
            label="Explore all collections"
            color="neutral"
            variant="ghost"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11 shrink-0 self-start"
          />
        </div>

        <div v-if="collectionsStatus === 'pending'" class="home-featured-layout mt-8" aria-busy="true">
          <div class="home-featured-lead p-5 sm:p-6">
            <USkeleton class="h-8 w-3/5" />
            <USkeleton class="mt-4 h-4 w-full" />
            <USkeleton class="mt-2 h-4 w-4/5" />
            <USkeleton class="mt-7 h-52 w-full" />
          </div>
          <div class="home-featured-support">
            <div class="home-featured-support-card">
              <USkeleton class="h-5 w-1/2" />
              <USkeleton class="mt-4 h-20 w-full" />
            </div>
            <div class="home-featured-support-card">
              <USkeleton class="h-5 w-2/5" />
              <USkeleton class="mt-4 h-20 w-full" />
            </div>
          </div>
        </div>

        <div
          v-else-if="collectionsError"
          class="mt-10 rounded-lg border border-default bg-default p-6"
          role="alert"
        >
          <p class="font-medium">
            Could not load featured skill sets.
          </p>
          <p class="mt-1 text-base text-muted">
            Check your connection and try again. The rest of the registry is still available.
          </p>
          <UButton
            label="Try featured sets again"
            color="neutral"
            variant="outline"
            size="sm"
            class="mt-4 min-h-11"
            @click="() => refreshCollections()"
          />
        </div>

        <div
          v-else-if="leadCollection"
          class="home-featured-layout mt-8"
        >
          <article class="home-featured-lead">
            <div class="home-featured-lead__intro">
              <div class="min-w-0">
                <p class="data-label">
                  Start here
                </p>
                <h3 class="home-featured-lead__title mt-3 text-balance">
                  {{ leadCollection.name }}
                </h3>
              </div>
              <div class="home-featured-curator">
                <img
                  :src="`https://github.com/${leadCollection.authorLogin}.png?size=112`"
                  alt=""
                  width="56"
                  height="56"
                  class="home-featured-avatar"
                  loading="lazy"
                  decoding="async"
                >
                <div class="min-w-0">
                  <p class="data-label">
                    Curated by
                  </p>
                  <p class="mt-1 truncate font-mono text-sm font-medium">
                    @{{ leadCollection.authorLogin }}
                  </p>
                </div>
              </div>
            </div>

            <div v-if="leadCollection.preamble" class="home-featured-rationale">
              <p class="data-label">
                Why this collection
              </p>
              <p class="mt-2 max-w-2xl text-base leading-relaxed text-muted text-pretty">
                {{ leadCollection.preamble }}
              </p>
            </div>

            <div class="home-featured-skill-heading">
              <p class="data-label">
                Inside this collection
              </p>
              <p class="data-label">
                {{ leadCollection.skillCount }} {{ leadCollection.skillCount === 1 ? 'skill' : 'skills' }}
              </p>
            </div>

            <ul v-if="leadCollection.skills.length" class="home-featured-skills">
              <li
                v-for="skill in leadCollection.skills.slice(0, 6)"
                :key="`${skill.owner}/${skill.repo}/${skill.name ?? 'repo'}`"
              >
                <NuxtLink
                  :to="featuredCollectionSkillPath(skill)"
                  class="home-featured-skill group"
                  :aria-label="`${featuredCollectionSkillLabel(skill)} by ${skill.owner}`"
                >
                  <img
                    :src="`https://github.com/${skill.owner}.png?size=64`"
                    alt=""
                    width="32"
                    height="32"
                    class="home-featured-skill-avatar"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0">
                    <span class="block font-mono text-sm font-medium">
                      {{ featuredCollectionSkillLabel(skill) }}
                    </span>
                    <span class="mt-1 block text-sm text-muted">
                      {{ skill.owner }}/{{ skill.repo }}
                    </span>
                  </span>
                </NuxtLink>
              </li>
            </ul>

            <div class="home-featured-install">
              <div class="home-featured-install__heading">
                <div>
                  <p class="data-label">
                    Add all {{ leadCollection.skillCount }} skills
                  </p>
                  <p class="mt-2 text-base leading-relaxed text-muted">
                    Run one command, or open the collection and check each source first.
                  </p>
                </div>
                <UButton
                  :to="`/@${leadCollection.authorLogin}/${leadCollection.slug}`"
                  label="Inspect collection"
                  color="neutral"
                  variant="ghost"
                  trailing-icon="i-lucide-arrow-up-right"
                  class="min-h-11 shrink-0"
                />
              </div>
              <div class="home-featured-command">
                <code
                  id="featured-install-command"
                  tabindex="0"
                >{{ installCommand }}</code>
                <UButton
                  :icon="copyState._tag === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
                  :label="copyState._tag === 'copied' ? 'Copied' : 'Copy install command'"
                  color="neutral"
                  variant="outline"
                  class="home-featured-copy min-h-11 justify-center"
                  @click="copyInstallCommand"
                />
              </div>
              <p
                class="home-featured-feedback text-sm"
                :class="copyState._tag === 'error' ? 'text-error' : 'text-muted'"
                aria-live="polite"
              >
                <template v-if="copyState._tag === 'copied'">
                  Install command copied.
                </template>
                <template v-else-if="copyState._tag === 'error'">
                  {{ copyState.message }}
                </template>
                <template v-else>
                  Check the collection before you run the command.
                </template>
              </p>
            </div>
          </article>

          <div v-if="supportingCollections.length" class="home-featured-support">
            <article
              v-for="collection in supportingCollections"
              :key="`${collection.authorLogin}/${collection.slug}`"
              class="min-h-0"
            >
              <NuxtLink
                :to="`/@${collection.authorLogin}/${collection.slug}`"
                class="home-featured-support-card group"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="home-featured-owner-stack" aria-hidden="true">
                      <img
                        v-for="owner in collectionSkillOwners(collection)"
                        :key="owner"
                        :src="`https://github.com/${owner}.png?size=64`"
                        alt=""
                        width="32"
                        height="32"
                        class="home-featured-support-avatar"
                        loading="lazy"
                        decoding="async"
                      >
                    </span>
                    <p class="data-label truncate">
                      Skills by {{ collectionSkillOwnerLabel(collection) }}
                    </p>
                  </div>
                  <UIcon name="i-lucide-arrow-up-right" class="home-featured-support-arrow size-4 shrink-0" aria-hidden="true" />
                </div>
                <h3 class="mt-4 text-lg font-semibold tracking-tight">
                  {{ collection.name }}
                </h3>
                <p v-if="collection.preamble" class="mt-3 text-base leading-relaxed text-muted line-clamp-2 sm:line-clamp-3">
                  {{ collection.preamble }}
                </p>
                <p class="home-featured-support-meta font-mono text-xs text-muted">
                  {{ collection.skillCount }} {{ collection.skillCount === 1 ? 'skill' : 'skills' }}
                </p>
              </NuxtLink>
            </article>
          </div>
        </div>

        <div v-else class="mt-10 rounded-lg border border-default bg-default p-6">
          <p class="font-medium">
            No featured collections right now.
          </p>
          <p class="mt-1 text-base text-muted">
            The full collection index is still available.
          </p>
          <UButton
            to="/collections"
            label="Browse collections"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
          />
        </div>
      </div>
    </section>

    <section
      id="freshness"
      class="editorial-band home-freshness-band border-b border-default"
      aria-labelledby="freshness-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />

      <div class="editorial-band__content home-freshness-shell mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <header class="home-freshness-header">
          <p class="section-label">
            Keep your agent current
          </p>
          <h2 id="freshness-heading" class="home-freshness-title mt-4 max-w-[15ch] font-semibold text-balance">
            See what changed.
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
            Updated skills and newly published skills have separate feeds. We don't rank new ones higher.
          </p>
        </header>

        <div class="home-freshness-grid">
          <section class="home-freshness-primary" aria-labelledby="recent-updates-heading">
            <div class="home-freshness-feed-heading">
              <div class="min-w-0">
                <p class="data-label">
                  Source files changed
                </p>
                <h3 id="recent-updates-heading" class="home-freshness-primary-title mt-2 font-semibold tracking-tight">
                  Recently updated
                </h3>
              </div>
              <UButton
                to="/skills"
                label="Browse all"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
            </div>

            <div v-if="updatesStatus === 'pending'" class="home-freshness-ledger home-freshness-skeleton-list" aria-busy="true">
              <div v-for="i in 5" :key="i" class="home-freshness-skeleton-row">
                <USkeleton class="size-9 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <USkeleton class="h-4 w-2/3" />
                  <USkeleton class="mt-2 h-3 w-1/2" />
                </div>
              </div>
            </div>
            <div v-else-if="updatesError" class="home-freshness-state home-freshness-state--primary" role="alert">
              <div>
                <p class="font-medium">
                  Could not load recent updates.
                </p>
                <p class="mt-1 text-base leading-relaxed text-muted">
                  Check your connection and try this list again.
                </p>
                <UButton
                  label="Try updates again"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="mt-4 min-h-11"
                  @click="() => refreshUpdates()"
                />
              </div>
            </div>
            <ul v-else-if="recentUpdates.length" class="home-freshness-ledger list-none p-0">
              <li v-for="item in recentUpdates.slice(0, 5)" :key="recentUpdateKey(item)">
                <NuxtLink
                  :to="recentUpdatePath(item)"
                  class="home-freshness-row home-freshness-row--primary group"
                >
                  <img
                    :src="item.avatarUrl"
                    alt=""
                    width="36"
                    height="36"
                    class="home-freshness-avatar home-freshness-avatar--primary"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0 flex-1">
                    <span class="home-freshness-row-title">{{ recentUpdateTitle(item) }}</span>
                    <span class="home-freshness-row-description">{{ recentUpdateDescription(item) }}</span>
                  </span>
                  <span class="home-freshness-time">{{ formatRelative(item.occurredAt) }}</span>
                  <UIcon name="i-lucide-arrow-up-right" class="home-freshness-arrow size-4 shrink-0" aria-hidden="true" />
                </NuxtLink>
              </li>
            </ul>
            <div v-else class="home-freshness-state home-freshness-state--primary" role="status">
              <div>
                <p class="font-medium">
                  The update feed is quiet.
                </p>
                <p class="mt-1 max-w-md text-base leading-relaxed text-muted">
                  No tracked source changes yet.
                </p>
                <UButton to="/skills" label="Browse skills" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
              </div>
            </div>

            <div class="home-freshness-watch">
              <div class="min-w-0">
                <p class="data-label">
                  Weekly change digest
                </p>
                <h3 id="freshness-watch-heading" class="home-freshness-watch-title mt-2 font-semibold tracking-tight">
                  Watch your stack for changes.
                </h3>
                <p class="mt-2 max-w-xl text-base leading-relaxed text-muted">
                  Get a weekly heads-up when the repositories you use change their skills.
                </p>
              </div>
              <UButton
                to="/login?return_to=/onboarding/discover"
                label="Watch your stack"
                icon="i-lucide-github"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11 shrink-0 self-start"
              />
            </div>
          </section>

          <section class="home-freshness-secondary" aria-labelledby="recent-publishes-heading">
            <div class="home-freshness-feed-heading">
              <div class="min-w-0">
                <p class="data-label flex items-center gap-1.5">
                  <UIcon name="i-lucide-badge-check" class="size-3.5 shrink-0" aria-hidden="true" />
                  From official publishers
                </p>
                <h3 id="recent-publishes-heading" class="home-freshness-secondary-title mt-2 font-semibold tracking-tight">
                  New to skilld
                </h3>
              </div>
              <UButton
                to="/skills"
                label="View publishers"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                class="min-h-11"
              />
            </div>

            <div v-if="publishesStatus === 'pending'" class="home-freshness-ledger home-freshness-skeleton-list home-freshness-skeleton-list--secondary" aria-busy="true">
              <div v-for="i in 5" :key="i" class="home-freshness-skeleton-row home-freshness-skeleton-row--secondary">
                <USkeleton class="size-8 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <USkeleton class="h-4 w-2/3" />
                  <USkeleton class="mt-2 h-3 w-1/2" />
                </div>
              </div>
            </div>
            <div v-else-if="publishesError" class="home-freshness-state home-freshness-state--secondary" role="alert">
              <p class="font-medium">
                Could not load new skills.
              </p>
              <p class="mt-1 text-base leading-relaxed text-muted">
                Check your connection and try this list again.
              </p>
              <UButton
                label="Try new skills again"
                color="neutral"
                variant="outline"
                size="sm"
                class="mt-4 min-h-11"
                @click="() => refreshPublishes()"
              />
            </div>
            <ul v-else-if="recentPublishes.length" class="home-freshness-ledger home-freshness-ledger--secondary list-none p-0">
              <li v-for="item in recentPublishes.slice(0, 5)" :key="`${item.owner}/${item.repo}/${item.name}`">
                <NuxtLink
                  :to="repoSkillPath(item.owner, item.repo, item.name)"
                  class="home-freshness-row home-freshness-row--secondary group"
                >
                  <img
                    :src="`https://github.com/${item.owner}.png?size=64`"
                    alt=""
                    width="32"
                    height="32"
                    class="home-freshness-avatar home-freshness-avatar--secondary"
                    loading="lazy"
                    decoding="async"
                  >
                  <span class="min-w-0 flex-1">
                    <span class="home-freshness-row-title">{{ item.displayName }}</span>
                    <span class="home-freshness-row-description">{{ item.owner }}/{{ item.repo }}</span>
                  </span>
                  <span class="home-freshness-time">{{ formatRelative(item.occurredAt) }}</span>
                  <UIcon name="i-lucide-arrow-up-right" class="home-freshness-arrow size-4 shrink-0" aria-hidden="true" />
                </NuxtLink>
              </li>
            </ul>
            <div v-else class="home-freshness-state home-freshness-state--secondary" role="status">
              <p class="font-medium">
                No official skills added yet.
              </p>
              <p class="mt-1 text-base leading-relaxed text-muted">
                You can still browse existing publishers.
              </p>
              <UButton to="/skills" label="View publishers" color="neutral" variant="outline" size="sm" class="mt-4 min-h-11" />
            </div>
          </section>
        </div>
      </div>
    </section>

    <section
      id="publish"
      class="editorial-band home-band--publish"
      aria-labelledby="publish-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="rose"
        data-geometry="bloom"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-12">
        <div class="home-publish-panel">
          <div>
            <p class="section-label">
              Share what works
            </p>
            <h2 id="publish-heading" class="home-section-title home-publish-title mt-4 text-balance">
              Got a setup you keep reusing?
            </h2>
            <p class="home-publish-summary mt-4">
              skilld author starts a draft. You edit, own, and publish it in your repository, or bundle skills into a collection.
            </p>
          </div>
          <div class="home-publish-actions">
            <UButton
              to="/learn/author-npm-package-skills"
              label="Bootstrap a package draft"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-arrow-right"
              class="min-h-11 justify-center"
            />
            <UButton
              to="/collections/new"
              label="Create a collection"
              trailing-icon="i-lucide-arrow-right"
              class="min-h-11 justify-center"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
