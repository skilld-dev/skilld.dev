<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

interface Device {
  id: number
  kind: string
  device_label: string | null
  cli_version: string | null
  scopes: string
  created_at: number
  last_used_at: number
  expires_at: number | null
  revoked_at: number | null
}

type RevokeState
  = | { _tag: 'idle' }
    | { _tag: 'pending', id: number }
    | { _tag: 'failed', id: number }

const {
  data,
  error,
  status,
  refresh,
} = await useFetch<{ items: Device[] }>('/api/me/devices')

const devices = computed(() => data.value?.items ?? [])
const devicesLoading = computed(() => status.value === 'pending' && !data.value)
const devicesUnavailable = computed(() => !!error.value && !data.value)
const revokeState = ref<RevokeState>({ _tag: 'idle' })

function deviceName(device: Device): string {
  return device.device_label || device.kind
}

function isRevoking(id: number): boolean {
  return revokeState.value._tag === 'pending' && revokeState.value.id === id
}

function revokeFailed(id: number): boolean {
  return revokeState.value._tag === 'failed' && revokeState.value.id === id
}

async function revoke(id: number) {
  if (revokeState.value._tag === 'pending')
    return

  revokeState.value = { _tag: 'pending', id }
  const result = await $fetch<{ ok: true }>(`/api/me/devices/${id}/revoke`, { method: 'POST' })
    .then(() => ({ _tag: 'ok' as const }))
    .catch((cause: unknown) => ({ _tag: 'failed' as const, cause }))

  if (result._tag === 'failed') {
    revokeState.value = { _tag: 'failed', id }
    return
  }

  revokeState.value = { _tag: 'idle' }
  await refresh()
}

function fmt(ts: number | null): string {
  if (!ts)
    return 'Never'
  return new Date(ts * 1000).toLocaleString()
}

useSeoMeta({ title: 'CLI devices', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 md:pt-14">
    <header class="flex flex-col gap-5 border-b border-default pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          CLI devices
        </h1>
        <p class="mt-3 max-w-xl text-base leading-relaxed text-muted text-pretty">
          Review and revoke command-line sessions.
        </p>
      </div>
      <UButton
        to="/me/cli-tokens/new"
        label="New token"
        icon="i-lucide-key-round"
        class="min-h-11 self-start sm:self-auto"
      />
    </header>

    <div
      v-if="devicesLoading"
      class="editorial-state mt-8 flex flex-col items-start justify-center"
      role="status"
      aria-live="polite"
    >
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" aria-hidden="true" />
      <h2 class="mt-4 text-lg font-semibold">
        Loading CLI devices
      </h2>
    </div>

    <div
      v-else-if="devicesUnavailable"
      class="editorial-state mt-8 flex flex-col items-start justify-center"
      role="alert"
    >
      <UIcon name="i-lucide-circle-alert" class="size-5 text-error" aria-hidden="true" />
      <h2 class="mt-4 text-lg font-semibold">
        Could not load CLI devices
      </h2>
      <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Your sessions are unchanged. Try loading them again.
      </p>
      <UButton
        class="mt-5 min-h-11"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        label="Retry"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </div>

    <ul v-else-if="devices.length" class="editorial-ledger mt-8 list-none p-0">
      <li
        v-for="device in devices"
        :key="device.id"
        class="py-5"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-base font-medium">{{ deviceName(device) }}</span>
              <UBadge v-if="device.revoked_at" label="revoked" color="neutral" variant="subtle" />
              <UBadge v-else :label="device.kind" color="primary" variant="subtle" />
            </div>
            <dl class="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt class="data-label">
                  CLI version
                </dt>
                <dd class="mt-1 font-mono">
                  {{ device.cli_version || 'Unknown' }}
                </dd>
              </div>
              <div>
                <dt class="data-label">
                  Access
                </dt>
                <dd class="mt-1 font-mono break-words">
                  {{ device.scopes }}
                </dd>
              </div>
              <div>
                <dt class="data-label">
                  Created
                </dt>
                <dd class="mt-1 text-muted">
                  {{ fmt(device.created_at) }}
                </dd>
              </div>
              <div>
                <dt class="data-label">
                  Last used
                </dt>
                <dd class="mt-1 text-muted">
                  {{ fmt(device.last_used_at) }}
                </dd>
              </div>
              <div>
                <dt class="data-label">
                  Expires
                </dt>
                <dd class="mt-1 text-muted">
                  {{ fmt(device.expires_at) }}
                </dd>
              </div>
            </dl>
            <p v-if="revokeFailed(device.id)" class="mt-4 text-sm text-error" role="alert">
              Could not revoke this session. Try again.
            </p>
          </div>
          <UButton
            v-if="!device.revoked_at"
            color="error"
            variant="ghost"
            icon="i-lucide-ban"
            label="Revoke"
            class="min-h-11 self-start"
            :aria-label="`Revoke ${deviceName(device)}`"
            :disabled="revokeState._tag === 'pending'"
            :loading="isRevoking(device.id)"
            @click="revoke(device.id)"
          />
        </div>
      </li>
    </ul>

    <div v-else class="editorial-state mt-8 flex flex-col items-start justify-center">
      <UIcon name="i-lucide-terminal" class="size-5 text-muted" aria-hidden="true" />
      <h2 class="mt-4 text-lg font-semibold">
        No CLI sessions yet
      </h2>
      <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Create a token when you are ready to connect the CLI.
      </p>
    </div>
  </section>
</template>
