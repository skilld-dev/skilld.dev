<script setup lang="ts">
import type {
  IdentityAccountDeleteBody,
  IdentityAccountDeleteResponse,
  IdentityEmailPatchBody,
  IdentityMutationResponse,
  IdentityPrivacyPatchBody,
  IdentitySubscriptionRef,
} from '../../../shared/contracts/account'
import type { StarsSyncResponse } from '../../utils/sync-starred-repos'
import { avatarProxyUrl } from '#shared/image-proxy'
import { accountDeletionConfirmed } from '../../../shared/contracts/account'
import AgentSetupCard from '../../components/_AgentSetupCard.vue'
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
  registryPath: string
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

const saveEmailMutation = useNuxtMutation<IdentityEmailPatchBody, IdentityMutationResponse>({
  mutation: async (body) => {
    const result = await rpc.execute(identityAccountQueries.saveEmail(), body)
    await refreshAccount()
    return result
  },
  onError: actionFailed('save your email settings'),
})

const savePrivacyMutation = useNuxtMutation<IdentityPrivacyPatchBody, IdentityMutationResponse>({
  mutation: async (body) => {
    const result = await rpc.execute(identityAccountQueries.savePrivacy(), body)
    await refreshAccount()
    return result
  },
  onError: actionFailed('save your privacy settings'),
})
async function setLikesPublic(likesPublic: boolean) {
  await savePrivacyMutation.mutateSafe({ likes_public: likesPublic })
}
async function setRepoIndexing(repoIndexing: boolean) {
  await savePrivacyMutation.mutateSafe({ repo_indexing: repoIndexing })
}

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

const showEmail = ref(false)
const emailForm = reactive({
  digest_email: me.value?.digest_email ?? me.value?.email ?? '',
  email_opt_in: !!me.value?.email_opt_in,
  weekly_opt_in: me.value?.weekly_opt_in ?? true,
})
const emailMissingAddress = computed(() =>
  (emailForm.email_opt_in || emailForm.weekly_opt_in)
  && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(emailForm.digest_email.trim()),
)
async function saveEmail() {
  if (emailMissingAddress.value)
    return
  const saved = await saveEmailMutation.mutateSafe({ ...emailForm })
  if (saved._tag === 'ok')
    showEmail.value = false
}

const likedSkills = computed(() => likes.value?.items ?? [])
const likesUnavailable = computed(() => !!likesError.value && !likes.value)
const likesLoading = computed(() => likesStatus.value === 'pending' && !likes.value)
const watchedRepositoryCount = computed(() => subs.value?.items.length ?? 0)

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
      description: 'Watched repos send a digest when they change.',
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

const { clear: clearSession } = useUserSession()
const deleteDialogOpen = ref(false)
const deleteConfirmation = ref('')
const deleteFailed = ref(false)
const deleteConfirmed = computed(() => !!me.value && accountDeletionConfirmed(deleteConfirmation.value, me.value.login))
// The RPC client sends no body with DELETE, and this request needs the typed login.
const deleteAccountMutation = useNuxtMutation<IdentityAccountDeleteBody, IdentityAccountDeleteResponse>({
  mutation: body => $fetch<IdentityAccountDeleteResponse>('/api/me', { method: 'DELETE', body }),
})

watch(deleteDialogOpen, (open) => {
  if (!open) {
    deleteConfirmation.value = ''
    deleteFailed.value = false
  }
})

async function deleteAccount() {
  if (!deleteConfirmed.value || deleteAccountMutation.pending.value)
    return
  deleteFailed.value = false
  const deleted = await deleteAccountMutation.mutateSafe({ confirm_login: deleteConfirmation.value })
  if (deleted._tag === 'err') {
    deleteFailed.value = true
    return
  }

  await clearSession()
  toast.add(deleted.data.github_access_revoked
    ? {
        title: 'Your account is deleted',
        description: 'skilld no longer has access to your GitHub account.',
        color: 'success',
        icon: 'i-lucide-check-circle',
      }
    : {
        title: 'Your account is deleted',
        description: 'GitHub did not confirm that skilld lost access. Revoke skilld in your GitHub settings.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
        duration: 20_000,
        actions: [{
          label: 'Open GitHub settings',
          to: 'https://github.com/settings/applications',
          target: '_blank',
          color: 'neutral',
          variant: 'outline',
        }],
      })
  await navigateTo('/')
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 md:pt-12 md:pb-20">
    <header class="flex flex-col gap-5 border-b border-default pb-8 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="me?.avatar"
          :src="avatarProxyUrl(me.avatar)"
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
              <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
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
                :to="skill.registryPath"
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
        <AgentSetupCard />

        <section>
          <h2 class="text-lg font-semibold">
            Email updates
          </h2>

          <div class="mt-5 border-y border-default">
            <div class="flex items-start justify-between gap-4 py-4">
              <div>
                <p class="text-sm font-medium">
                  Weekly email
                </p>
                <p class="mt-1 text-xs leading-relaxed text-muted">
                  New trending Skills every Monday. A Skill can return after 60 days.
                </p>
              </div>
              <UBadge :label="me?.weekly_opt_in ? 'On' : 'Off'" color="neutral" variant="subtle" />
            </div>

            <div class="flex items-start justify-between gap-4 border-t border-default py-4">
              <div>
                <p class="text-sm font-medium">
                  Monthly digest
                </p>
                <p class="mt-1 text-xs leading-relaxed text-muted">
                  Changes to liked Skills and watched Repositories on the first day of each month.
                </p>
              </div>
              <UBadge :label="me?.email_opt_in ? 'On' : 'Off'" color="neutral" variant="subtle" />
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
                :label="showEmail ? 'Close email settings' : 'Edit email settings'"
                :icon="showEmail ? 'i-lucide-chevron-up' : 'i-lucide-mail'"
                :aria-expanded="showEmail"
                aria-controls="email-settings-form"
                @click="showEmail = !showEmail"
              />
              <div v-show="showEmail" id="email-settings-form" class="mt-4 space-y-4">
                <UFormField label="Email address" name="email" :error="emailMissingAddress ? 'Add a valid email address, or turn off both emails.' : undefined">
                  <UInput
                    v-model="emailForm.digest_email"
                    type="email"
                    autocomplete="email"
                    :aria-invalid="emailMissingAddress"
                    class="w-full font-mono"
                    :ui="{ base: 'min-h-11' }"
                  />
                </UFormField>
                <label class="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    v-model="emailForm.weekly_opt_in"
                    type="checkbox"
                    class="mt-0.5 size-4 accent-primary"
                  >
                  <span>
                    Send me the weekly email
                    <span class="mt-0.5 block text-xs text-muted">Distinct trending Skills each Monday.</span>
                  </span>
                </label>
                <label class="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    v-model="emailForm.email_opt_in"
                    type="checkbox"
                    class="mt-0.5 size-4 accent-primary"
                  >
                  <span>
                    Send me the monthly digest
                    <span class="mt-0.5 block text-xs text-muted">Liked Skills and watched Repositories that changed.</span>
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

        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" class="text-lg font-semibold">
            Privacy
          </h2>
          <div class="mt-5 border-y border-default py-4">
            <USwitch
              :model-value="!!me?.likes_public"
              :loading="savePrivacyMutation.pending.value"
              :disabled="!me || savePrivacyMutation.pending.value"
              label="Show liked Skills on your profile"
              :description="me?.likes_public
                ? 'Anyone can see your liked Skills.'
                : 'Only you can see your liked Skills.'"
              @update:model-value="setLikesPublic"
            />
            <UButton
              :to="`/@${me?.login}/liked`"
              class="mt-3 min-h-11"
              color="neutral"
              variant="ghost"
              icon="i-lucide-heart"
              label="View liked Skills page"
            />
          </div>
          <div class="border-b border-default py-4">
            <USwitch
              :model-value="!!me?.repo_indexing"
              :loading="savePrivacyMutation.pending.value"
              :disabled="!me || savePrivacyMutation.pending.value"
              label="Add Skills from your public repositories"
              :description="me?.repo_indexing
                ? 'skilld checks your public repositories for SKILL.md files and gives each Skill a public page.'
                : 'skilld does not check your repositories. Skills already added stay.'"
              @update:model-value="setRepoIndexing"
            />
          </div>
        </section>

        <section>
          <h2 class="text-lg font-semibold">
            Repository coverage
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            {{ watchedRepositoryCount }} {{ watchedRepositoryCount === 1 ? 'repository supports' : 'repositories support' }} your skill updates.
          </p>
          <p class="mt-2 text-xs leading-relaxed text-muted">
            Last GitHub import: {{ fmtDate(me?.stars_synced_at) }}
          </p>
          <UButton
            :loading="syncMutation.pending.value"
            class="mt-4 min-h-11"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="Import stars again"
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
                  <NuxtLink :to="repoHubPath(source.owner, source.repo)" class="flex min-h-11 items-center truncate font-mono text-xs hover:text-primary">
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
            label="Devices and tokens"
            class="min-h-11"
          />
          <UButton
            to="/developers"
            color="neutral"
            variant="ghost"
            icon="i-lucide-code-xml"
            label="Developers"
            class="min-h-11"
          />
        </nav>

        <section class="border-t border-default pt-6" aria-labelledby="delete-account-heading">
          <h2 id="delete-account-heading" class="text-lg font-semibold">
            Delete account
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            Deleting your account removes your profile, likes, watched Repositories, collections, email settings, devices, and skilld tokens.
            <NuxtLink to="/privacy" class="text-default underline underline-offset-2 hover:text-primary">
              See what skilld stores
            </NuxtLink>
          </p>
          <UButton
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            label="Delete account"
            class="mt-4 min-h-11"
            @click="deleteDialogOpen = true"
          />
        </section>
      </aside>
    </div>

    <UModal
      v-model:open="deleteDialogOpen"
      title="Delete your account"
      description="You cannot undo this."
      :dismissible="!deleteAccountMutation.pending.value"
      :close="{ size: 'md', class: 'min-h-11 min-w-11 justify-center', disabled: deleteAccountMutation.pending.value }"
      :ui="{
        content: 'w-[calc(100vw-1.5rem)] max-w-lg rounded-lg border border-default bg-default shadow-none',
        header: 'px-5 py-5 sm:px-6',
        body: 'px-5 py-5 sm:px-6',
        footer: 'justify-end gap-2 px-5 py-4 sm:px-6',
        title: 'font-mono text-base font-medium text-highlighted',
        description: 'text-sm text-muted',
      }"
    >
      <template #body>
        <form id="delete-account-form" class="space-y-5" @submit.prevent="deleteAccount">
          <div>
            <h3 class="section-label">
              skilld deletes
            </h3>
            <ul class="mt-3 list-disc space-y-2 ps-5 text-sm leading-relaxed marker:text-muted">
              <li>Your GitHub profile details and email address</li>
              <li>Email settings and email history</li>
              <li>Liked Skills, watched Repositories, and imported stars</li>
              <li>Your collections</li>
              <li>Devices and skilld tokens</li>
            </ul>
          </div>
          <p class="text-sm leading-relaxed text-muted">
            skilld also asks GitHub to revoke its access to your account.
            Skills in your public Repositories stay listed, because GitHub is their source.
          </p>
          <UFormField :label="`Type ${me?.login} to confirm`" name="confirm_login">
            <UInput
              v-model="deleteConfirmation"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              class="w-full font-mono"
              :ui="{ base: 'min-h-11' }"
              :disabled="deleteAccountMutation.pending.value"
            />
          </UFormField>
          <p v-if="deleteFailed" class="text-sm text-error" role="alert">
            Could not delete your account. Check your connection and try again.
          </p>
        </form>
      </template>

      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          label="Cancel"
          class="min-h-11"
          :disabled="deleteAccountMutation.pending.value"
          @click="deleteDialogOpen = false"
        />
        <!-- Subtle, not solid: white text on the dark mode error color is below 4.5:1. -->
        <UButton
          type="submit"
          form="delete-account-form"
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          label="Delete account"
          class="min-h-11"
          :disabled="!deleteConfirmed"
          :loading="deleteAccountMutation.pending.value"
        />
      </template>
    </UModal>
  </section>
</template>
