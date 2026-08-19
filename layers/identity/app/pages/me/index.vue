<script setup lang="ts">
import type {
  IdentityCadenceBody,
  IdentityEmailPatchBody,
  IdentityMutationResponse,
  IdentitySubscriptionRef,
} from '../../../shared/contracts/account'
import type { StarsSyncResponse } from '../../utils/sync-starred-repos'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'
import { syncStarredRepos } from '../../utils/sync-starred-repos'

definePageMeta({ middleware: ['auth'] })

interface LikedSkill {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  likedAt: number
}

const { data: me } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { data: subs } = await useNuxtRpcQuery(identityAccountQueries.subscriptions(), identityAccountQueryOptions)
const {
  data: likes,
  error: likesError,
  status: likesStatus,
  refresh: refreshLikes,
} = await useFetch<{ items: LikedSkill[] }>('/api/me/likes')

const actionFailed = useActionFailure()
const rpc = useNuxtRpc()

async function refreshAccount() {
  me.value = await rpc.query(identityAccountQueries.me())
}

async function refreshSubscriptions() {
  subs.value = await rpc.query(identityAccountQueries.subscriptions())
}

const removeSubscriptionMutation = useNuxtMutation<IdentitySubscriptionRef, IdentityMutationResponse>({
  mutation: async ({ owner, repo }) => {
    const result = await rpc.execute(identityAccountQueries.removeSubscription(owner, repo))
    await refreshSubscriptions()
    return result
  },
  onError: actionFailed('stop watching that repo'),
})

const saveCadenceMutation = useNuxtMutation<IdentityCadenceBody, IdentityMutationResponse>({
  mutation: async (body) => {
    const result = await rpc.execute(identityAccountQueries.saveCadence(), body)
    await refreshAccount()
    return result
  },
  onError: actionFailed('save your digest schedule'),
})

const saveEmailMutation = useNuxtMutation<IdentityEmailPatchBody, IdentityMutationResponse>({
  mutation: async (body) => {
    const result = await rpc.execute(identityAccountQueries.saveEmail(), body)
    await refreshAccount()
    return result
  },
  onError: actionFailed('save your digest email'),
})

const removeLikeMutation = useNuxtMutation<LikedSkill, { ok: true }>({
  mutation: async (skill) => {
    const path = `/api/me/likes/${skill.owner}/${skill.repo}/${skill.name}`
    const result = await $fetch<{ ok: true }>(path, { method: 'DELETE' })
    await Promise.all([refreshLikes(), refreshSubscriptions()])
    return result
  },
  onError: actionFailed('remove that skill'),
})
const removingSkill = ref<string>()
async function unlike(skill: LikedSkill) {
  if (removeLikeMutation.pending.value)
    return
  removingSkill.value = skill.slug
  await removeLikeMutation.mutateSafe(skill)
  removingSkill.value = undefined
}

const syncMutation = useNuxtMutation<void, StarsSyncResponse>({
  mutation: async () => {
    const result = await syncStarredRepos((_request, options) => $fetch<StarsSyncResponse>('/api/me/stars/sync', options))
    await refreshAccount()
    return result
  },
  onError: actionFailed('sync your starred repos'),
})
async function sync() {
  await syncMutation.mutateSafe()
}

const unwatchingRepository = ref<string>()
async function unwatch(owner: string, repo: string) {
  if (removeSubscriptionMutation.pending.value)
    return
  unwatchingRepository.value = `${owner}/${repo}`
  await removeSubscriptionMutation.mutateSafe({ owner, repo })
  unwatchingRepository.value = undefined
}

const showCadence = ref(false)
const cadence = reactive<Required<IdentityCadenceBody>>({
  frequency: me.value?.digest_frequency ?? 'weekly',
  dow: me.value?.digest_dow ?? 1,
  hour: me.value?.digest_hour ?? 9,
  timezone: me.value?.timezone ?? 'UTC',
})
async function saveCadence() {
  const saved = await saveCadenceMutation.mutateSafe({ ...cadence })
  // A closed panel reads as a saved panel, so a rejected write keeps the form
  // open on the values the user still needs to correct.
  if (saved._tag === 'ok')
    showCadence.value = false
}

const showEmail = ref(false)
const emailForm = reactive<Required<IdentityEmailPatchBody>>({
  digest_email: me.value?.digest_email ?? me.value?.email ?? '',
  email_opt_in: !!me.value?.email_opt_in,
  weekly_opt_in: me.value?.weekly_opt_in ?? true,
})
const emailMissingAddress = computed(() =>
  emailForm.email_opt_in && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(emailForm.digest_email.trim()),
)
async function saveEmail() {
  if (emailMissingAddress.value)
    return
  const saved = await saveEmailMutation.mutateSafe({ ...emailForm })
  if (saved._tag === 'ok')
    showEmail.value = false
}

const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const likedSkills = computed(() => likes.value?.items ?? [])
const likesUnavailable = computed(() => !!likesError.value && !likes.value)
const likesLoading = computed(() => likesStatus.value === 'pending' && !likes.value)
const watchedRepositoryCount = computed(() => subs.value?.items.length ?? 0)
const digestEnabled = computed(() =>
  !!me.value?.email_opt_in && me.value?.digest_frequency !== 'off',
)
const digestSchedule = computed(() => {
  if (me.value?.digest_frequency === 'off')
    return 'Digest paused'
  const time = `${String(me.value?.digest_hour ?? 9).padStart(2, '0')}:00 ${me.value?.timezone ?? 'UTC'}`
  if (me.value?.digest_frequency === 'daily')
    return `Daily at ${time}`
  const day = weekdayLabels[me.value?.digest_dow ?? 1]
  return `Every ${day} at ${time}`
})

function sourceDescription(source: string): string {
  if (source === 'like')
    return 'Added with a liked skill'
  if (source === 'star-import')
    return 'Imported from GitHub stars'
  if (source === 'manual')
    return 'Added directly'
  if (source.startsWith('collection:'))
    return 'Added with a collection'
  return 'Added to your digest'
}

useSeoMeta({ title: 'Your dashboard', robots: 'noindex' })

const route = useRoute()
const toast = useToast()
async function clearWelcomeQuery() {
  await navigateTo({ path: route.path, query: {} }, { replace: true })
}
onMounted(() => {
  if (route.query.welcome === '1') {
    toast.add({
      title: 'You\'re all set',
      description: 'We\'ll let you know when watched repos update.',
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
    clearWelcomeQuery()
  }
})

function fmtDate(ts: number | null | undefined): string {
  if (!ts)
    return 'Not yet'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: me.value?.timezone ?? 'UTC',
  }).format(new Date(ts * 1000))
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 md:pt-12 md:pb-20">
    <header class="flex flex-col gap-5 border-b border-default pb-8 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="me?.avatar"
          :src="me.avatar"
          alt=""
          width="56"
          height="56"
          class="size-14 shrink-0 rounded-full border border-default bg-muted"
          fetchpriority="high"
        >
        <div class="min-w-0">
          <p class="section-label">
            Your skilld
          </p>
          <p class="mt-1 truncate text-lg font-semibold">
            {{ me?.name || `@${me?.login}` }}
          </p>
          <p v-if="me?.name" class="truncate font-mono text-xs text-muted">
            @{{ me.login }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          :to="`/@${me?.login}`"
          class="min-h-11"
          color="neutral"
          variant="outline"
          icon="i-lucide-user-round"
          label="View profile"
        />
        <UButton
          to="/skills"
          class="min-h-11"
          icon="i-lucide-search"
          label="Find skills"
        />
      </div>
    </header>

    <div class="mt-10 grid min-w-0 gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
      <div class="min-w-0">
        <section aria-label="Your skills">
          <div class="flex flex-col gap-5 border-b border-default pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="section-label">
                Watching for changes
              </p>
              <h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Your skills
              </h1>
              <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted text-pretty">
                Like a skill to keep it here. We track meaningful changes and include them in your digest.
              </p>
            </div>
            <p class="shrink-0 font-mono text-sm tabular-nums text-muted">
              {{ likedSkills.length }} {{ likedSkills.length === 1 ? 'skill' : 'skills' }}
            </p>
          </div>

          <div v-if="likesLoading" class="editorial-state mt-6 flex flex-col items-start justify-center">
            <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" aria-hidden="true" />
            <h2 class="mt-4 text-lg font-semibold">
              Loading your skills
            </h2>
          </div>

          <div v-else-if="likesUnavailable" class="editorial-state mt-6 flex flex-col items-start justify-center" role="alert">
            <UIcon name="i-lucide-circle-alert" class="size-5 text-error" aria-hidden="true" />
            <h2 class="mt-4 text-lg font-semibold">
              Could not load your skills
            </h2>
            <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Your saved skills are unchanged. Try loading them again.
            </p>
            <UButton
              class="mt-5 min-h-11"
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              label="Retry"
              :loading="likesStatus === 'pending'"
              @click="refreshLikes()"
            />
          </div>

          <ul v-else-if="likedSkills.length" class="editorial-ledger list-none p-0">
            <li
              v-for="skill in likedSkills"
              :key="skill.slug"
              class="group flex min-w-0 items-start gap-4 py-5"
            >
              <NuxtLink
                :to="`/gh/${skill.owner}/${skill.repo}/${skill.name}`"
                class="min-w-0 flex-1 rounded-sm"
              >
                <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span class="font-mono text-base font-medium transition-colors duration-200 group-hover:text-primary">
                    /{{ skill.name }}
                  </span>
                  <span class="data-label">{{ skill.owner }}/{{ skill.repo }}</span>
                </span>
                <span v-if="skill.description" class="mt-2 block max-w-3xl line-clamp-3 text-sm leading-relaxed text-muted text-pretty">
                  {{ skill.description }}
                </span>
                <span class="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                  <UIcon name="i-lucide-activity" class="size-3.5 text-primary" aria-hidden="true" />
                  Watching for changes
                </span>
              </NuxtLink>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-heart-off"
                class="min-h-11 min-w-11 shrink-0"
                :aria-label="`Remove ${skill.name} from your skills`"
                :disabled="removeLikeMutation.pending.value"
                :loading="removeLikeMutation.pending.value && removingSkill === skill.slug"
                @click="unlike(skill)"
              />
            </li>
          </ul>

          <div v-else class="editorial-state mt-6 flex flex-col items-start justify-center">
            <UIcon name="i-lucide-heart" class="size-5 text-muted" aria-hidden="true" />
            <h2 class="mt-4 text-lg font-semibold">
              Add your first skill
            </h2>
            <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Like any skill to keep it here and receive useful changes in your digest.
            </p>
            <UButton to="/skills" class="mt-5 min-h-11" icon="i-lucide-search" label="Browse skills" />
          </div>
        </section>
      </div>

      <aside class="min-w-0 space-y-10 lg:border-l lg:border-default lg:pl-8" aria-label="Skill delivery settings">
        <section>
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="section-label">
                Delivery
              </p>
              <h2 class="mt-2 text-lg font-semibold">
                Change digest
              </h2>
            </div>
            <UBadge
              :label="digestEnabled ? 'On' : 'Paused'"
              color="neutral"
              variant="subtle"
            />
          </div>

          <div class="mt-5 border-y border-default">
            <div class="py-4">
              <p class="data-label">
                Schedule
              </p>
              <p class="mt-2 text-sm leading-relaxed">
                {{ digestSchedule }}
              </p>
              <UButton
                class="mt-3 min-h-11"
                color="neutral"
                variant="outline"
                :label="showCadence ? 'Close schedule' : 'Edit schedule'"
                :icon="showCadence ? 'i-lucide-chevron-up' : 'i-lucide-sliders-horizontal'"
                :aria-expanded="showCadence"
                aria-controls="digest-schedule-form"
                @click="showCadence = !showCadence"
              />

              <div v-show="showCadence" id="digest-schedule-form" class="mt-4 space-y-4">
                <div>
                  <p class="data-label mb-2">
                    Frequency
                  </p>
                  <div class="grid grid-cols-3 gap-2">
                    <UButton
                      v-for="f in (['weekly', 'daily', 'off'] as const)"
                      :key="f"
                      :label="f === 'off' ? 'Off' : `${f[0]?.toUpperCase()}${f.slice(1)}`"
                      :variant="cadence.frequency === f ? 'solid' : 'outline'"
                      :color="cadence.frequency === f ? 'primary' : 'neutral'"
                      class="min-h-11 justify-center"
                      @click="cadence.frequency = f"
                    />
                  </div>
                </div>
                <div v-if="cadence.frequency === 'weekly'">
                  <p class="data-label mb-2">
                    Day
                  </p>
                  <div class="grid grid-cols-4 gap-2">
                    <UButton
                      v-for="(day, index) in weekdayLabels"
                      :key="day"
                      :label="day.slice(0, 3)"
                      :aria-label="day"
                      :variant="cadence.dow === index ? 'solid' : 'outline'"
                      :color="cadence.dow === index ? 'primary' : 'neutral'"
                      class="min-h-11 justify-center"
                      @click="cadence.dow = index"
                    />
                  </div>
                </div>
                <div v-if="cadence.frequency !== 'off'" class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                  <UFormField label="Hour" name="digest-hour">
                    <UInputNumber
                      v-model="cadence.hour"
                      :min="0"
                      :max="23"
                      class="w-full font-mono"
                      :ui="{ base: 'min-h-11' }"
                    />
                  </UFormField>
                  <UFormField label="Time zone" name="digest-timezone">
                    <UInput v-model="cadence.timezone" class="w-full font-mono" :ui="{ base: 'min-h-11' }" />
                  </UFormField>
                </div>
                <UButton
                  class="min-h-11"
                  label="Save schedule"
                  :loading="saveCadenceMutation.pending.value"
                  @click="saveCadence"
                />
              </div>
            </div>

            <div class="border-t border-default py-4">
              <p class="data-label">
                Email
              </p>
              <p class="mt-2 break-all font-mono text-sm">
                {{ me?.digest_email || me?.email || 'No email set' }}
              </p>
              <UButton
                class="mt-3 min-h-11"
                color="neutral"
                variant="outline"
                :label="showEmail ? 'Close email settings' : 'Edit email'"
                :icon="showEmail ? 'i-lucide-chevron-up' : 'i-lucide-mail'"
                :aria-expanded="showEmail"
                aria-controls="digest-email-form"
                @click="showEmail = !showEmail"
              />
              <div v-show="showEmail" id="digest-email-form" class="mt-4 space-y-4">
                <UFormField label="Digest email" name="digest-email" :error="emailMissingAddress ? 'Add a valid email address, or turn off the digest.' : undefined">
                  <UInput
                    v-model="emailForm.digest_email"
                    type="email"
                    autocomplete="email"
                    :aria-invalid="emailMissingAddress"
                    class="w-full font-mono"
                    :ui="{ base: 'min-h-11' }"
                  />
                </UFormField>
                <label class="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    v-model="emailForm.email_opt_in"
                    type="checkbox"
                    class="size-4 accent-primary"
                  >
                  Send me the digest
                </label>
                <label class="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    v-model="emailForm.weekly_opt_in"
                    type="checkbox"
                    class="mt-0.5 size-4 accent-primary"
                  >
                  <span>
                    Send me the weekly
                    <span class="mt-0.5 block text-xs text-muted">Skills you liked that changed, plus what devs are talking about.</span>
                  </span>
                </label>
                <UButton
                  class="min-h-11"
                  label="Save email settings"
                  :disabled="emailMissingAddress"
                  :loading="saveEmailMutation.pending.value"
                  @click="saveEmail"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <p class="section-label">
            Sources
          </p>
          <h2 class="mt-2 text-lg font-semibold">
            Repository coverage
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            {{ watchedRepositoryCount }} {{ watchedRepositoryCount === 1 ? 'repository supports' : 'repositories support' }} your skill updates.
          </p>
          <p class="mt-2 text-xs leading-relaxed text-muted">
            Last GitHub sync: {{ fmtDate(me?.stars_synced_at) }}
          </p>
          <UButton
            :loading="syncMutation.pending.value"
            class="mt-4 min-h-11"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="Sync GitHub stars"
            @click="sync"
          />

          <details v-if="subs?.items.length" class="mt-5 border-y border-default">
            <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 font-mono text-xs">
              View repositories
              <UIcon name="i-lucide-chevron-down" class="size-4 text-muted" aria-hidden="true" />
            </summary>
            <ul class="list-none border-t border-default p-0">
              <li
                v-for="source in subs.items"
                :key="`${source.owner}/${source.repo}`"
                class="flex min-w-0 items-center gap-2 border-b border-default py-3 last:border-b-0"
              >
                <div class="min-w-0 flex-1">
                  <NuxtLink :to="`/gh/${source.owner}/${source.repo}`" class="flex min-h-11 items-center truncate font-mono text-xs hover:text-primary">
                    {{ source.owner }}/{{ source.repo }}
                  </NuxtLink>
                  <p class="mt-1 text-xs text-muted">
                    {{ sourceDescription(source.source) }}
                  </p>
                </div>
                <UButton
                  v-if="source.source !== 'like'"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  class="min-h-11 min-w-11 shrink-0"
                  :aria-label="`Remove ${source.owner}/${source.repo} from your digest`"
                  :disabled="removeSubscriptionMutation.pending.value"
                  :loading="removeSubscriptionMutation.pending.value && unwatchingRepository === `${source.owner}/${source.repo}`"
                  @click="unwatch(source.owner, source.repo)"
                />
              </li>
            </ul>
          </details>
          <div v-else class="mt-5 border-y border-default py-4 text-sm text-muted">
            Add a skill to start watching its source.
          </div>
        </section>

        <nav class="border-t border-default pt-6" aria-label="Account tools">
          <p class="section-label mb-3">
            Account
          </p>
          <UButton
            to="/me/devices"
            color="neutral"
            variant="ghost"
            icon="i-lucide-terminal"
            label="CLI devices"
            class="min-h-11"
          />
        </nav>
      </aside>
    </div>
  </section>
</template>
