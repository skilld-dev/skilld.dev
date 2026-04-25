<script setup lang="ts">
const { user } = useAuth()
const { justSignedIn, hasPersonalCollection } = useOnboarding()
const visible = ref(false)

// Show banner when justSignedIn becomes true
watch(justSignedIn, (val) => {
  if (val)
    visible.value = true
}, { immediate: true })

// Auto-hide once user publishes their personal skills
watch(hasPersonalCollection, (val) => {
  if (val)
    dismiss()
})

function dismiss() {
  visible.value = false
  justSignedIn.value = false
}
</script>

<template>
  <div
    v-if="visible && user"
    class="mx-auto max-w-5xl px-4 pt-4 sm:px-6"
  >
    <div class="flex items-start gap-4 rounded-lg border border-default p-4">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">
          Welcome, @{{ user.handle }}.
        </p>
        <p class="mt-1 text-xs leading-relaxed text-muted">
          Add the package skills you use every day. Publish them so anyone can run
          <code class="font-mono">{{ curatorInstallCmd(user.handle) }}</code>
          to install your setup.
        </p>
      </div>
      <UButton
        :to="`/people/${user.handle}/edit-skills`"
        label="Add your skills"
        icon="i-lucide-plus"
        size="sm"
        @click="dismiss"
      />
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="sm"
        aria-label="Dismiss welcome banner"
        @click="dismiss"
      />
    </div>
  </div>
</template>
