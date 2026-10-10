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
import { accountDeletionConfirmed } from '../../../shared/contracts/account'
import SkillgenRepositories from '../../components/_SkillgenRepositories.vue'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'
import { syncStarredRepos } from '../../utils/sync-starred-repos'

definePageMeta({ layout: 'account', middleware: ['auth'] })

interface LikedSkill {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  likedAt: number
  registryPath: string
}

const { data: me, error: accountError, status: accountStatus, refresh: retryAccount } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { data: subs, error: subscriptionsError, status: subscriptionsStatus, refresh: retrySubscriptions } = await useNuxtRpcQuery(identityAccountQueries.subscriptions(), identityAccountQueryOptions)
const {
  data: likes,
  error: likesError,
  status: likesStatus,
  refresh: refreshLikes,
} = await useFetch<{ items: LikedSkill[] }>('/api/me/likes')

const actionFailed = useActionFailure()
const rpc = useNuxtRpc()
const { fetchSession } = useAuth()

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
  onMutate: () => actionFailed.clear('stop watching that repo'),
})

const saveEmailMutation = useNuxtMutation<IdentityEmailPatchBody, IdentityMutationResponse>({
  mutation: async (body) => {
    const result = await rpc.execute(identityAccountQueries.saveEmail(), body)
    await fetchSession()
    await refreshAccount()
    return result
  },
  onError: actionFailed('save your email settings'),
  onMutate: () => actionFailed.clear('save your email settings'),
})

const savePrivacyMutation = useNuxtMutation<IdentityPrivacyPatchBody, IdentityMutationResponse>({
  mutation: async (body) => {
    const result = await rpc.execute(identityAccountQueries.savePrivacy(), body)
    await refreshAccount()
    return result
  },
  onError: actionFailed('save your privacy settings'),
  onMutate: () => actionFailed.clear('save your privacy settings'),
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
  onMutate: () => actionFailed.clear('remove that skill'),
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
  onMutate: () => actionFailed.clear('sync your starred repos'),
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
watch(showEmail, (open) => {
  if (open && me.value) {
    emailForm.digest_email = me.value.digest_email ?? me.value.email ?? ''
    emailForm.email_opt_in = me.value.email_opt_in
    emailForm.weekly_opt_in = me.value.weekly_opt_in
  }
})
const emailMissingAddress = computed(() =>
  (emailForm.email_opt_in || emailForm.weekly_opt_in)
  && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(emailForm.digest_email.trim()),
)
async function saveEmail() {
  if (emailMissingAddress.value || saveEmailMutation.pending.value)
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

const route = useRoute()
const view = computed(() => {
  const value = route.query.view
  return value === 'email' || value === 'repositories' || value === 'skillgen' || value === 'account' ? value : 'skills'
})
const viewTitle = computed(() => ({ skills: 'Your skills', email: 'Email updates', repositories: 'Repository coverage', skillgen: 'Skillgen', account: 'Account' })[view.value])
useSeoMeta({ title: viewTitle, robots: 'noindex' })
const toast = useToast()
async function clearWelcomeQuery() {
  await navigateTo({ path: route.path, query: { ...route.query, welcome: undefined } }, { replace: true })
}
onMounted(() => {
  if (route.query.welcome === '1') {
    toast.add({
      title: 'You\'re all set',
      description: 'Your email choices are saved. You can change them in Email updates.',
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
  <section v-if="!me" class="mx-auto w-full max-w-4xl py-6 sm:py-8">
    <div class="editorial-state" :role="accountError ? 'alert' : 'status'">
      <h1 class="text-2xl font-semibold">
        {{ accountError ? 'Could not load your account' : 'Loading your account' }}
      </h1>
      <UButton v-if="accountError" label="Retry" color="neutral" variant="outline" class="mt-4 min-h-11" :loading="accountStatus === 'pending'" @click="retryAccount()" />
    </div>
  </section>
  <section v-else class="mx-auto w-full max-w-4xl py-6 sm:py-8">
    <h1 v-if="view !== 'skills'" class="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">
      {{ viewTitle }}
    </h1>

    <div class="min-w-0 space-y-8">
      <div v-if="view === 'skills'" class="min-w-0">
        <section aria-label="Your skills">
          <div class="flex flex-col gap-5 border-b border-default pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Your skills
              </h1>
              <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted text-pretty">
                Like a skill to keep it here. Email updates are optional.
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-4">
              <p class="font-mono text-sm tabular-nums text-muted">
                {{ likedSkills.length }} {{ likedSkills.length === 1 ? 'skill' : 'skills' }}
              </p>
              <UButton to="/skills" label="Find skills" icon="i-lucide-search" class="min-h-11" />
            </div>
          </div>

          <div v-if="me.onboarded_at === null" class="mt-6 flex flex-col items-start gap-3 rounded-lg border border-default p-4 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm leading-relaxed text-muted">
              Choose which emails you receive. You can change this later.
            </p>
            <UButton to="/onboarding/email" label="Choose email updates" color="neutral" variant="outline" class="min-h-11 shrink-0" />
          </div>

          <div v-if="likesLoading" class="editorial-state mt-6 flex flex-col items-start justify-center" role="status">
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
            <li v-for="skill in likedSkills" :key="skill.slug">
              <SkillCard
                :skill
                layout="row"
                metric="none"
                surface="account-watching"
              >
                <template #meta>
                  <span class="inline-flex items-center gap-1.5">
                    <UIcon name="i-lucide-activity" class="size-3.5" aria-hidden="true" />
                    Watching for changes
                  </span>
                </template>
                <template #actions>
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
                </template>
              </SkillCard>
            </li>
          </ul>

          <div v-else class="editorial-state mt-6 flex flex-col items-start justify-center">
            <UIcon name="i-lucide-heart" class="size-5 text-muted" aria-hidden="true" />
            <h2 class="mt-4 text-lg font-semibold">
              Add your first skill
            </h2>
            <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Like any skill to keep it here. Turn on the monthly digest to receive its changes.
            </p>
            <UButton to="/skills" class="mt-5 min-h-11" icon="i-lucide-search" label="Browse skills" />
          </div>
        </section>
      </div>

      <div class="min-w-0 space-y-8">
        <section v-if="view === 'email'">
          <div class="mt-5 border-y border-default">
            <div class="flex items-start justify-between gap-4 py-4">
              <div>
                <p class="text-sm font-medium">
                  Weekly email
                </p>
                <p class="mt-1 text-sm leading-relaxed text-muted">
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
                <p class="mt-1 text-sm leading-relaxed text-muted">
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
              <form v-show="showEmail" id="email-settings-form" novalidate class="mt-4 space-y-4" @submit.prevent="saveEmail">
                <UFormField label="Email address" name="email" :error="emailMissingAddress ? 'Add a valid email address, or turn off both emails.' : undefined">
                  <UInput
                    id="account-digest-email"
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
                    <span class="mt-0.5 block text-sm text-muted">Distinct trending Skills each Monday.</span>
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
                    <span class="mt-0.5 block text-sm text-muted">Liked Skills and watched Repositories that changed.</span>
                  </span>
                </label>
                <UButton
                  class="min-h-11"
                  label="Save email settings"
                  :disabled="emailMissingAddress"
                  :loading="saveEmailMutation.pending.value"
                  type="submit"
                />
              </form>
            </div>
          </div>
        </section>

        <section v-if="view === 'account'" aria-labelledby="privacy-heading">
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

        <SkillgenRepositories v-if="view === 'skillgen'" />

        <section v-if="view === 'repositories'">
          <p class="mt-2 text-sm leading-relaxed text-muted">
            {{ watchedRepositoryCount }} {{ watchedRepositoryCount === 1 ? 'repository supports' : 'repositories support' }} your skill updates.
          </p>
          <p class="mt-2 text-sm leading-relaxed text-muted">
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

          <div v-if="subscriptionsError" class="mt-4" role="alert">
            <p class="text-sm text-error">
              Could not load watched Repositories. Try again.
            </p>
            <UButton label="Retry" color="neutral" variant="outline" class="mt-3 min-h-11" :loading="subscriptionsStatus === 'pending'" @click="retrySubscriptions()" />
          </div>
          <p v-else-if="subscriptionsStatus === 'pending' && !subs" class="mt-4 text-sm text-muted" role="status">
            Loading watched Repositories
          </p>
          <div v-else-if="subs?.items.length" class="mt-5 border-y border-default">
            <ul class="list-none border-t border-default p-0">
              <li
                v-for="source in subs.items"
                :key="`${source.owner}/${source.repo}`"
                class="flex min-w-0 items-center gap-2 border-b border-default py-3 last:border-b-0"
              >
                <div class="min-w-0 flex-1">
                  <NuxtLink :to="repoHubPath(source.owner, source.repo)" class="flex min-h-11 items-center truncate font-mono text-sm hover:text-primary">
                    {{ source.owner }}/{{ source.repo }}
                  </NuxtLink>
                  <p class="mt-1 text-sm text-muted">
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
          </div>
          <div v-else class="mt-5 border-y border-default py-4 text-sm text-muted">
            Add a skill to start watching its source.
          </div>
        </section>

        <section v-if="view === 'account'" class="border-t border-default pt-6" aria-labelledby="delete-account-heading">
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
      </div>
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
              id="account-confirm-login"
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
