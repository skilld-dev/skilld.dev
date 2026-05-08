<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const { data: me } = await useFetch('/api/me')

const frequency = ref<'weekly' | 'daily' | 'off'>(me.value?.digest_frequency ?? 'weekly')
const dow = ref<number>(me.value?.digest_dow ?? 1)
const hour = ref<number>(me.value?.digest_hour ?? 9)
const timezone = ref<string>(me.value?.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'))

const dows = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const submitting = ref(false)
async function save() {
  submitting.value = true
  await $fetch('/api/me/cadence', {
    method: 'PATCH',
    body: { frequency: frequency.value, dow: dow.value, hour: hour.value, timezone: timezone.value },
  }).catch(() => null)
  submitting.value = false
  await navigateTo('/onboarding/email')
}

useSeoMeta({ title: 'Choose your cadence · skilld', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-md px-4 sm:px-6 pt-12 pb-12 md:pt-16">
    <h1 class="font-mono text-2xl font-medium">
      Digest cadence
    </h1>
    <p class="mt-2 text-sm text-muted">
      How often we send a digest of changes to repos you watch.
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
            color="neutral"
            @click="frequency = f"
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
            color="neutral"
            @click="dow = d.value"
          />
        </div>
      </div>

      <div v-if="frequency !== 'off'">
        <label for="hour" class="text-xs uppercase tracking-wide text-muted">Hour (local)</label>
        <input
          id="hour"
          v-model.number="hour"
          type="number"
          min="0"
          max="23"
          class="mt-1 w-20 rounded border border-default bg-default px-2 py-1 font-mono text-sm"
        >
      </div>

      <div v-if="frequency !== 'off'">
        <label for="tz" class="text-xs uppercase tracking-wide text-muted">Timezone</label>
        <input
          id="tz"
          v-model="timezone"
          type="text"
          class="mt-1 w-full rounded border border-default bg-default px-2 py-1 font-mono text-sm"
        >
      </div>
    </div>

    <div class="mt-8 flex justify-end">
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
