<script setup lang="ts">
const { id, icon = 'i-lucide-lightbulb' } = defineProps<{
  id: string
  icon?: string
}>()

const { isTipDismissed, dismissTip } = useOnboarding()
const dismissed = computed(() => isTipDismissed(id))

function dismiss() {
  dismissTip(id)
}
</script>

<template>
  <div
    v-if="!dismissed"
    class="flex items-start gap-3 rounded-lg border border-default p-3"
    role="note"
  >
    <UIcon
      :name="icon"
      class="mt-0.5 size-4 shrink-0 text-muted"
    />
    <div class="min-w-0 flex-1 text-xs leading-relaxed text-muted">
      <slot />
    </div>
    <button
      class="shrink-0 text-muted transition-colors hover:text-default"
      aria-label="Dismiss tip"
      @click="dismiss"
    >
      <UIcon
        name="i-lucide-x"
        class="size-3.5"
      />
    </button>
  </div>
</template>
