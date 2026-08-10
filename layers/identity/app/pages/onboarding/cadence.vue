<script setup lang="ts">
import type { IdentityCadenceBody, IdentityMutationResponse } from '../../../shared/contracts/account'
import { identityAccountQueries, identityAccountQueryOptions } from '../../queries/account'

definePageMeta({ middleware: ['auth'] })

const { data: me } = await useNuxtRpcQuery(identityAccountQueries.me(), identityAccountQueryOptions)
const { data: subs } = await useNuxtRpcQuery(identityAccountQueries.subscriptions(), identityAccountQueryOptions)

if (!subs.value?.items?.length) {
  await navigateTo('/onboarding/email', { replace: true })
}

const detectedTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

const frequency = ref<'weekly' | 'daily' | 'off'>(me.value?.digest_frequency ?? 'weekly')
const dow = ref<number>(me.value?.digest_dow ?? 1)
const hour = ref<number>(me.value?.digest_hour ?? 9)
const timezone = ref<string>(me.value?.timezone || detectedTz)

const dows = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const hourItems = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return { value: h, label: `${display}:00 ${period}` }
})

const tzItems = computed(() => {
  const fromIntl = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
  const list = typeof fromIntl === 'function' ? fromIntl.call(Intl, 'timeZone') : []
  const zones = list.length ? list : ['UTC', detectedTz]
  return [...new Set(zones)].map(z => ({ value: z, label: z }))
})

const actionFailed = useActionFailure()
const rpc = useNuxtRpc()

const saveCadenceMutation = useNuxtMutation<IdentityCadenceBody, IdentityMutationResponse>({
  mutation: body => rpc.execute(identityAccountQueries.saveCadence(), body),
  invalidates: ['identity:me'],
  onError: actionFailed('save your digest schedule'),
})
const submitting = saveCadenceMutation.pending

async function save() {
  const result = await saveCadenceMutation.mutateSafe({
    frequency: frequency.value,
    dow: dow.value,
    hour: hour.value,
    timezone: timezone.value,
  })
  if (result._tag === 'err')
    return
  await navigateTo('/onboarding/email')
}

useSeoMeta({ title: 'Choose your cadence · skilld', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-md px-4 sm:px-6 pt-8 pb-12 md:pt-12">
    <OnboardingSteps :step="2" />
    <h1 class="mt-6 font-mono text-2xl font-medium">
      Digest email schedule
    </h1>
    <p class="mt-2 text-sm text-muted">
      A digest combines recent SKILL.md changes from the repos you watch. Choose how often it arrives.
    </p>

    <div class="mt-6 space-y-4">
      <div>
        <label class="text-xs uppercase tracking-wide text-muted">Frequency</label>
        <div class="mt-1 flex gap-2">
          <UButton
            v-for="f in (['weekly', 'daily', 'off'] as const)"
            :key="f"
            :label="f"
            size="sm"
            :variant="frequency === f ? 'solid' : 'outline'"
            :color="frequency === f ? 'primary' : 'neutral'"
            @click="() => { frequency = f }"
          />
        </div>
      </div>

      <div v-if="frequency === 'weekly'">
        <label class="text-xs uppercase tracking-wide text-muted">Day of week</label>
        <div class="mt-1 flex flex-wrap gap-1">
          <UButton
            v-for="d in dows"
            :key="d.value"
            :label="d.label"
            size="sm"
            :variant="dow === d.value ? 'solid' : 'outline'"
            :color="dow === d.value ? 'primary' : 'neutral'"
            @click="() => { dow = d.value }"
          />
        </div>
      </div>

      <div v-if="frequency !== 'off'" class="grid grid-cols-2 gap-3">
        <div>
          <label for="hour" class="text-xs uppercase tracking-wide text-muted">Time</label>
          <USelect
            id="hour"
            v-model="hour"
            :items="hourItems"
            class="mt-1 w-full"
          />
        </div>
        <div>
          <label for="tz" class="text-xs uppercase tracking-wide text-muted">Timezone</label>
          <USelect
            id="tz"
            v-model="timezone"
            :items="tzItems"
            class="mt-1 w-full"
          />
        </div>
      </div>

      <p v-if="frequency === 'off'" class="rounded-lg border border-default bg-elevated/50 p-3 text-xs text-muted">
        We won't send a digest. You can switch this on later from your dashboard.
      </p>
    </div>

    <div class="mt-8 flex items-center justify-between">
      <UButton
        to="/onboarding/discover"
        label="Back"
        leading-icon="i-lucide-arrow-left"
        size="sm"
        color="neutral"
        variant="ghost"
      />
      <UButton
        :loading="submitting"
        label="Continue"
        trailing-icon="i-lucide-arrow-right"
        size="sm"
        @click="save"
      />
    </div>
  </section>
</template>
