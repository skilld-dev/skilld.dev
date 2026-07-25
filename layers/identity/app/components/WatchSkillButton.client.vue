<script setup lang="ts">
const props = defineProps<{ owner: string, repo: string }>()
const route = useRoute()
const { isAuthenticated, loginUrl } = useAuth()
const submitting = ref(false)
const watched = ref(false)

const anonHref = computed(() => loginUrl({
  returnTo: route.fullPath,
  action: 'watch-skill',
}))

async function watchNow() {
  submitting.value = true
  const res = await $fetch<{ ok: boolean }>('/api/me/subscriptions', {
    method: 'POST',
    body: { source: 'manual', repos: [{ owner: props.owner, repo: props.repo }] },
  }).catch((error) => {
    console.warn(`[watch-skill] ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  submitting.value = false
  if (res?.ok)
    watched.value = true
}
</script>

<template>
  <UButton
    v-if="!isAuthenticated"
    :to="anonHref"
    external
    label="Watch for changes"
    icon="i-lucide-bell"
    size="xs"
    color="neutral"
    variant="ghost"
  />
  <UButton
    v-else-if="watched"
    label="Watching"
    icon="i-lucide-check"
    size="xs"
    color="neutral"
    variant="ghost"
    disabled
  />
  <UButton
    v-else
    :loading="submitting"
    label="Watch for changes"
    icon="i-lucide-bell"
    size="xs"
    color="neutral"
    variant="ghost"
    @click="watchNow"
  />
</template>
