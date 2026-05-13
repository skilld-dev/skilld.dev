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

const { data, refresh } = await useFetch<{ items: Device[] }>('/api/me/devices')
const apiFetch = $fetch as any

async function revoke(id: number) {
  await apiFetch(`/api/me/devices/${id}/revoke`, { method: 'POST' })
  await refresh()
}

function fmt(ts: number | null): string {
  if (!ts)
    return 'Never'
  return new Date(ts * 1000).toLocaleString()
}

useSeoMeta({ title: 'CLI devices · skilld', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-16 md:pt-16">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="font-mono text-2xl font-medium">
          CLI devices
        </h1>
        <p class="mt-2 text-sm text-muted">
          Review and revoke command-line sessions.
        </p>
      </div>
      <UButton
        to="/me/cli-tokens/new"
        label="New token"
        icon="i-lucide-key-round"
        size="sm"
      />
    </div>

    <ul v-if="data?.items.length" class="mt-8 space-y-3 list-none p-0">
      <li
        v-for="device in data.items"
        :key="device.id"
        class="rounded-lg border border-default p-4"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm">{{ device.device_label || device.kind }}</span>
              <UBadge v-if="device.revoked_at" label="revoked" color="neutral" variant="subtle" />
              <UBadge v-else :label="device.kind" color="primary" variant="subtle" />
            </div>
            <p class="mt-1 text-xs text-muted">
              CLI {{ device.cli_version || 'unknown' }} · scope {{ device.scopes }}
            </p>
            <p class="mt-3 text-xs text-muted">
              Created {{ fmt(device.created_at) }} · last used {{ fmt(device.last_used_at) }} · expires {{ fmt(device.expires_at) }}
            </p>
          </div>
          <UButton
            v-if="!device.revoked_at"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-ban"
            label="Revoke"
            @click="revoke(device.id)"
          />
        </div>
      </li>
    </ul>

    <p v-else class="mt-8 text-sm text-muted">
      No CLI sessions yet.
    </p>
  </section>
</template>
