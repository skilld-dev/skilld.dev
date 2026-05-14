<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const label = ref('')
const ttl = ref('90')
const issued = ref<{ accessToken: string, expiresAt: number } | null>(null)
const apiFetch = $fetch as any

async function createToken() {
  issued.value = await apiFetch('/api/me/cli-tokens', {
    method: 'POST',
    body: {
      label: label.value,
      ttl_days: ttl.value === 'never' ? undefined : Number(ttl.value),
    },
  })
}

useSeoMeta({ title: 'New CLI token · skilld', robots: 'noindex' })
</script>

<template>
  <section class="mx-auto max-w-xl px-4 sm:px-6 pt-12 pb-16 md:pt-16">
    <h1 class="font-mono text-2xl font-medium">
      New CLI token
    </h1>

    <form v-if="!issued" class="mt-8 space-y-5" @submit.prevent="createToken">
      <UFormField label="Label">
        <UInput v-model="label" required placeholder="CI deploy" />
      </UFormField>
      <UFormField label="Expiry">
        <USelect
          v-model="ttl"
          :items="[
            { label: '30 days', value: '30' },
            { label: '90 days', value: '90' },
            { label: '365 days', value: '365' },
            { label: 'Never', value: 'never' },
          ]"
        />
      </UFormField>
      <UButton type="submit" label="Issue token" icon="i-lucide-key-round" />
    </form>

    <div v-else class="mt-8 rounded-lg border border-default p-4">
      <h2 class="section-label">
        Token
      </h2>
      <p class="mt-2 text-xs text-muted">
        Shown once.
      </p>
      <pre class="mt-4 overflow-x-auto rounded border border-default bg-muted p-3 text-xs"><code>{{ issued.accessToken }}</code></pre>
      <p class="mt-3 text-xs text-muted">
        Expires {{ new Date(issued.expiresAt * 1000).toLocaleString() }}.
      </p>
    </div>
  </section>
</template>
