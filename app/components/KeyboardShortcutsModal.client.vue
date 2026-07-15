<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal
    v-model:open="open"
    aria-label="Keyboard shortcuts"
  >
    <template #content>
      <div class="relative p-6 sm:p-8">
        <h2 class="font-mono text-lg font-medium">
          Keyboard shortcuts
        </h2>

        <div class="mt-5 space-y-4">
          <div>
            <p class="section-label mb-2">
              Global
            </p>
            <dl class="space-y-1.5 text-sm">
              <div class="flex items-center justify-between">
                <dt>Focus search</dt>
                <dd><kbd class="kbd">/</kbd></dd>
              </div>
              <div class="flex items-center justify-between">
                <dt>Show shortcuts</dt>
                <dd><kbd class="kbd">?</kbd></dd>
              </div>
            </dl>
          </div>
        </div>

        <p class="mt-6 text-xs text-muted">
          Shortcuts are disabled when typing in input fields.
        </p>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="absolute right-3 top-3"
          aria-label="Close dialog"
          @click="() => { open = false }"
        />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.25rem;
}
</style>
