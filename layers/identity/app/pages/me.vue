<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

interface Subscription {
  owner: string
  repo: string
  source: string
  muted_until: number | null
  created_at: number
}

const { data: me, refresh: refreshMe } = await useFetch('/api/me')
const { data: subs, refresh: refreshSubs } = await useFetch<{ items: Subscription[] }>('/api/me/subscriptions')

const syncing = ref(false)
async function sync() {
  syncing.value = true
  await $fetch('/api/me/stars/sync', { method: 'POST' }).catch(() => null)
  syncing.value = false
  await refreshMe()
}

async function unwatch(owner: string, repo: string) {
  await $fetch(`/api/me/subscriptions/${owner}/${repo}`, { method: 'DELETE' }).catch(() => null)
  await refreshSubs()
}

const showCadence = ref(false)
const cadence = reactive({
  frequency: me.value?.digest_frequency ?? 'weekly',
  dow: me.value?.digest_dow ?? 1,
  hour: me.value?.digest_hour ?? 9,
  timezone: me.value?.timezone ?? 'UTC',
})
async function saveCadence() {
  await $fetch('/api/me/cadence', { method: 'PATCH', body: cadence }).catch(() => null)
  await refreshMe()
  showCadence.value = false
}

const showEmail = ref(false)
const emailForm = reactive({
  digest_email: me.value?.digest_email ?? me.value?.email ?? '',
  email_opt_in: !!me.value?.email_opt_in,
})
async function saveEmail() {
  await $fetch('/api/me/email', { method: 'PATCH', body: emailForm }).catch(() => null)
  await refreshMe()
  showEmail.value = false
}

useSeoMeta({ title: 'Your dashboard · skilld', robots: 'noindex' })

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
    return '—'
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
          @click="showCadence = !showCadence"
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
              @click="cadence.frequency = f"
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
              @click="cadence.dow = d"
            />
          </div>
          <div v-if="cadence.frequency !== 'off'">
            <input v-model.number="cadence.hour" type="number" min="0" max="23" class="w-16 rounded border border-default bg-default px-2 py-1 font-mono text-xs">
            <input v-model="cadence.timezone" type="text" class="ml-2 rounded border border-default bg-default px-2 py-1 font-mono text-xs">
          </div>
          <UButton size="xs" label="Save" @click="saveCadence" />
        </div>
      </div>

      <div class="rounded-lg border border-default p-4">
        <h2 class="section-label">
          Email
        </h2>
        <p class="mt-2 text-sm font-mono break-all">
          {{ me?.digest_email || me?.email || '—' }}
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
          @click="showEmail = !showEmail"
        />
        <div v-if="showEmail" class="mt-3 space-y-2">
          <input v-model="emailForm.digest_email" type="email" class="w-full rounded border border-default bg-default px-2 py-1 font-mono text-xs">
          <label class="flex items-center gap-2 text-xs"><input v-model="emailForm.email_opt_in" type="checkbox"> Send me the digest</label>
          <UButton size="xs" label="Save" @click="saveEmail" />
        </div>
      </div>
    </div>

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
            {{ s.source }}
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
        No digests sent yet — coming with Phase 3.
      </p>
    </div>
  </section>
</template>
