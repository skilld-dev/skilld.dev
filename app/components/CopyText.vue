<script setup lang="ts">
/**
 * One line of text to copy, such as a prompt or a URL, with a copy button.
 * Commands use `CommandChip` instead, which records the copy.
 */
const { text, label } = defineProps<{
  text: string
  /** What the button copies, read by screen readers. */
  label: string
}>()

const { copy, copied } = useClipboard({ copiedDuring: 2000, legacy: true })
const copyError = ref('')
const textRef = ref<HTMLElement>()

async function copyText(): Promise<void> {
  copyError.value = ''
  await copy(text).catch((error) => {
    console.warn('[copy-text] Copy failed:', error)
    copyError.value = 'Could not copy. Select the text and copy it manually.'
    const selection = window.getSelection()
    if (textRef.value && selection)
      selection.selectAllChildren(textRef.value)
  })
}
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-start gap-2">
      <code
        ref="textRef"
        class="min-w-0 flex-1 rounded-lg border border-default bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed text-default [overflow-wrap:anywhere] whitespace-pre-wrap"
      >{{ text }}</code>
      <UButton
        type="button"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="outline"
        class="min-h-11 min-w-11 shrink-0 justify-center"
        :aria-label="`Copy ${label}`"
        @click="copyText"
      />
    </div>
    <p class="sr-only" aria-live="polite">
      {{ copied ? `Copied the ${label}.` : '' }}
    </p>
    <p v-if="copyError" role="alert" class="mt-2 text-sm text-error">
      {{ copyError }}
    </p>
  </div>
</template>
