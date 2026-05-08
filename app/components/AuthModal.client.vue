<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal v-model:open="open" title="Sign in">
    <template #body>
      <div class="space-y-4 text-center">
        <p class="text-sm text-muted">
          Sign-in is coming back soon with GitHub. We're rebuilding accounts so you can watch repos and collections for changes.
        </p>
        <UButton
          label="Sign in (coming soon)"
          icon="i-lucide-github"
          color="neutral"
          size="sm"
          disabled
          block
        />
      </div>
    </template>
  </UModal>
</template>
