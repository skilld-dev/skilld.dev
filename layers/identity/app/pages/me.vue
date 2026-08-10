<script setup lang="ts">
import type {
  IdentityCadenceBody,
  IdentityEmailPatchBody,
  IdentityMutationResponse,
  IdentitySubscriptionRef,
} from '../../shared/contracts/account'
import type { StarsSyncResponse } from '../utils/sync-starred-repos'
import { invalidateNuxtRpc } from '@harlan-zw/nuxt-use-query/rpc'
import { identityAccountQueries, identityAccountQueryOptions } from '../queries/account'
import { syncStarredRepos } from '../utils/sync-starred-repos'

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
const { data: subs, refresh: refreshSubs } = await useNuxtRpcQuery(identityAccountQueries.subscriptions(), identityAccountQueryOptions)
const { data: likes, refresh: refreshLikes } = await useFetch<{ items: LikedSkill[] }>('/api/me/likes')

const actionFailed = useActionFailure()
const rpc = useNuxtRpc()

const removeSubscriptionMutation = useNuxtMutation<IdentitySubscriptionRef, IdentityMutationResponse>({
  mutation: ({ owner, repo }) => rpc.execute(identityAccountQueries.removeSubscription(owner, repo)),
  invalidates: ['identity:subscriptions'],
  onError: actionFailed('stop watching that repo'),
})

const saveCadenceMutation = useNuxtMutation<IdentityCadenceBody, IdentityMutationResponse>({
  mutation: body => rpc.execute(identityAccountQueries.saveCadence(), body),
  invalidates: ['identity:me'],
  onError: actionFailed('save your digest schedule'),
})

const saveEmailMutation = useNuxtMutation<IdentityEmailPatchBody, IdentityMutationResponse>({
  mutation: body => rpc.execute(identityAccountQueries.saveEmail(), body),
  invalidates: ['identity:me'],
  onError: actionFailed('save your digest email'),
})

async function unlike(skill: LikedSkill) {
  const path = `/api/me/likes/${skill.owner}/${skill.repo}/${skill.name}`
  const removed = await $fetch(path, { method: 'DELETE' }).catch(actionFailed('remove your like'))
  if (!removed)
    return
  // Unliking the last skill in a repo also drops its derived subscription, so
  // the watching list below is refreshed too or it shows a repo that is gone.
  await Promise.all([refreshLikes(), refreshSubs()])
}

const syncing = ref(false)
async function sync() {
  syncing.value = true
  await syncStarredRepos((_request, options) => $fetch<StarsSyncResponse>('/api/me/stars/sync', options))
    .catch(actionFailed('sync your starred repos'))
  syncing.value = false
  await invalidateNuxtRpc(identityAccountQueries.me())
}

async function unwatch(owner: string, repo: string) {
  await removeSubscriptionMutation.mutateSafe({ owner, repo })
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
  return new Date(ts * 1000).toLocaleString()
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-16 md:pt-16">
    <h1 class="font-mono text-2xl font-medium">
      @{{ me?.login }}
    </h1>

    <div class="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="rounded-lg border border-default p-4">
        <h2 class="section-label">
          Cadence
        </h2>
        <p class="mt-2 text-sm">
          {{ me?.digest_frequency }}<span v-if="me?.digest_frequency === 'weekly'"> on day {{ me?.digest_dow }}</span><span v-if="me?.digest_frequency !== 'off'"> at {{ me?.digest_hour }}:00 {{ me?.timezone }}</span>
        </p>
        <UButton
          class="mt-3"
          size="xs"
          color="neutral"
          variant="outline"
          label="Edit"
          @click="() => { showCadence = !showCadence }"
        />
        <div v-if="showCadence" class="mt-3 space-y-2 text-sm">
          <div class="flex gap-2">
            <UButton
              v-for="f in (['weekly', 'daily', 'off'] as const)"
              :key="f"
              :label="f"
              size="xs"
              :variant="cadence.frequency === f ? 'solid' : 'outline'"
              color="neutral"
              @click="() => { cadence.frequency = f }"
            />
          </div>
          <div v-if="cadence.frequency === 'weekly'" class="flex gap-1 flex-wrap">
            <UButton
              v-for="d in [0, 1, 2, 3, 4, 5, 6]"
              :key="d"
              :label="String(d)"
              size="xs"
              :variant="cadence.dow === d ? 'solid' : 'outline'"
              color="neutral"
              @click="() => { cadence.dow = d }"
            />
          </div>
          <div v-if="cadence.frequency !== 'off'" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
            <UFormField label="Hour" name="digest-hour">
              <UInputNumber
                v-model="cadence.hour"
                :min="0"
                :max="23"
                size="xs"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField label="Time zone" name="digest-timezone">
              <UInput
                v-model="cadence.timezone"
                size="xs"
                class="w-full font-mono"
              />
            </UFormField>
          </div>
          <UButton size="xs" label="Save" @click="saveCadence" />
        </div>
      </div>

      <div class="rounded-lg border border-default p-4">
        <h2 class="section-label">
          Email
        </h2>
        <p class="mt-2 text-sm font-mono break-all">
          {{ me?.digest_email || me?.email || 'No email set' }}
        </p>
        <p class="text-xs text-muted mt-1">
          {{ me?.email_opt_in ? 'Opted in' : 'Not opted in' }}
        </p>
        <UButton
          class="mt-3"
          size="xs"
          color="neutral"
          variant="outline"
          label="Edit"
          @click="() => { showEmail = !showEmail }"
        />
        <div v-if="showEmail" class="mt-3 space-y-2">
          <input
            v-model="emailForm.digest_email"
            type="email"
            :aria-invalid="emailMissingAddress"
            :aria-describedby="emailMissingAddress ? 'digest-email-error' : undefined"
            class="w-full rounded border border-default bg-default px-2 py-1 font-mono text-xs"
          >
          <label class="flex items-center gap-2 text-xs"><input v-model="emailForm.email_opt_in" type="checkbox"> Send me the digest</label>
          <p v-if="emailMissingAddress" id="digest-email-error" class="text-xs text-error">
            Add an email address, or untick the box to stop digests.
          </p>
          <UButton size="xs" label="Save" :disabled="emailMissingAddress" @click="saveEmail" />
        </div>
      </div>
    </div>

    <USeparator class="my-8" />

    <h2 class="section-label">
      {{ likes?.items.length ?? 0 }} liked skills
    </h2>
    <ul v-if="likes?.items.length" class="mt-4 space-y-2 list-none p-0">
      <li
        v-for="skill in likes.items"
        :key="skill.slug"
        class="flex items-center justify-between gap-3 rounded-lg border border-default p-3"
      >
        <div class="min-w-0">
          <NuxtLink :to="`/gh/${skill.owner}/${skill.repo}/${skill.name}`" class="font-mono text-sm hover:text-muted">
            /{{ skill.name }}
          </NuxtLink>
          <p class="truncate text-xs text-muted">
            {{ skill.owner }}/{{ skill.repo }}
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-heart-off"
          :aria-label="`Unlike ${skill.name}`"
          @click="unlike(skill)"
        />
      </li>
    </ul>
    <p v-else class="mt-4 text-sm text-muted">
      You haven't liked anything yet. Liking a skill watches its repository for you.
      <NuxtLink to="/skills" class="underline">
        Browse skills
      </NuxtLink>.
    </p>

    <USeparator class="my-8" />

    <div class="flex items-end justify-between">
      <div>
        <h2 class="section-label">
          Watching {{ subs?.items.length ?? 0 }} repos
        </h2>
        <p class="text-xs text-muted mt-1">
          Last star sync: {{ fmtDate(me?.stars_synced_at) }}
        </p>
      </div>
      <UButton
        :loading="syncing"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        label="Sync stars"
        @click="sync"
      />
    </div>

    <ul v-if="subs?.items.length" class="mt-4 space-y-2 list-none p-0">
      <li
        v-for="s in subs.items"
        :key="`${s.owner}/${s.repo}`"
        class="flex items-center justify-between rounded-lg border border-default p-3"
      >
        <div>
          <NuxtLink :to="`/gh/${s.owner}/${s.repo}`" class="font-mono text-sm hover:text-muted">
            {{ s.owner }}/{{ s.repo }}
          </NuxtLink>
          <p class="text-xs text-muted">
            {{ s.source === 'like' ? 'from a liked skill' : s.source }}
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          aria-label="Unwatch"
          @click="unwatch(s.owner, s.repo)"
        />
      </li>
    </ul>
    <p v-else class="mt-4 text-sm text-muted">
      You're not watching any repos yet. <NuxtLink to="/onboarding/discover" class="underline">
        Find some
      </NuxtLink>.
    </p>

    <USeparator class="my-8" />

    <div>
      <h2 class="section-label">
        Digest history
      </h2>
      <p class="mt-2 text-sm text-muted">
        No digests sent yet.
      </p>
    </div>
  </section>
</template>
