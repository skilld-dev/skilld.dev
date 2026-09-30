<script setup lang="ts">
const props = defineProps<{ login: string, slug: string }>()
const { state, loginUrl } = useAuth()
const submitting = ref(false)
const watched = ref(false)

const anonHref = computed(() => loginUrl({
  returnTo: `/@${props.login}/${props.slug}`,
  action: 'watch-collection',
}))

async function watchNow() {
  submitting.value = true
  const res = await $fetch<{ ok: boolean }>(`/api/collections/by-author/${props.login}/${props.slug}/watch`, {
    method: 'POST',
  }).catch((error) => {
    console.warn(`[watch-collection] ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  submitting.value = false
  if (res?.ok)
    watched.value = true
}
</script>

<template>
  <!-- Holds its place, disabled, until the browser has loaded the session. -->
  <UButton
    v-if="state._tag === 'pending'"
    label="Watch this collection"
    icon="i-lucide-bell"
    size="sm"
    color="neutral"
    variant="outline"
    class="min-h-11 justify-start"
    disabled
  />
  <UButton
    v-else-if="state._tag === 'anonymous'"
    :to="anonHref"
    external
    label="Watch this collection"
    icon="i-lucide-bell"
    size="sm"
    color="neutral"
    variant="outline"
    class="min-h-11 justify-start"
  />
  <UButton
    v-else-if="watched"
    label="Watching"
    icon="i-lucide-check"
    size="sm"
    color="neutral"
    variant="ghost"
    class="min-h-11 justify-start"
    disabled
  />
  <UButton
    v-else
    :loading="submitting"
    label="Watch this collection"
    icon="i-lucide-bell"
    size="sm"
    color="neutral"
    variant="outline"
    class="min-h-11 justify-start"
    @click="watchNow"
  />
</template>
