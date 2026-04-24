<script setup lang="ts">
const { message = 'No collections published yet. Be the first to curate your skills.' } = defineProps<{
  message?: string
}>()

const { stage } = useOnboarding()
const authModalOpen = inject<Ref<boolean>>('authModalOpen', ref(false))

async function handleClick() {
  if (stage.value === 'browse') {
    if (import.meta.client)
      sessionStorage.setItem('skilld:post-auth-intent', 'new-collection')
    authModalOpen.value = true
    return
  }
  await navigateTo('/collections/new')
}
</script>

<template>
  <div class="rounded-lg border border-default p-8 text-center">
    <UIcon
      name="i-lucide-layers"
      class="mx-auto size-8 text-muted"
      aria-hidden="true"
    />
    <p class="mt-3 text-sm">
      {{ message }}
    </p>
    <UButton
      label="Publish a collection"
      icon="i-lucide-plus"
      size="sm"
      class="mt-4"
      @click="handleClick"
    />
  </div>
</template>
