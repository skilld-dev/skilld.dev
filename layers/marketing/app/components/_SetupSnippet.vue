<script setup lang="ts">
import { escapeHtml, highlightCodeBody } from '~~/shared/highlight'

const { code, label, format = 'text' } = defineProps<{
  code: string
  /** What the copy button copies, read by screen readers. */
  label: string
  /**
   * `skilld` renders with the site's install command roles. `json` and `toml`
   * are highlighted. Other shell commands stay plain: the light highlight theme
   * fails contrast on the muted surface.
   */
  format?: 'text' | 'skilld' | 'json' | 'toml'
}>()

const { copy, copied } = useClipboard({ copiedDuring: 2000, legacy: true })
const copyError = ref('')

const html = computed(() => format === 'json' || format === 'toml'
  ? highlightCodeBody(code, format)
  : escapeHtml(code))

async function copyCode(): Promise<void> {
  copyError.value = ''
  await copy(code).catch((error) => {
    console.warn('[setup-snippet] Copy failed:', error)
    copyError.value = 'Could not copy. Select the text and copy it manually.'
  })
}
</script>

<template>
  <div>
    <div class="flex items-start gap-2">
      <!-- Wraps instead of scrolling, so no snippet hides its end on a phone. -->
      <InstallCommand
        v-if="format === 'skilld'"
        :command="code"
        wrap
        class="block min-w-0 flex-1 rounded-md border border-default bg-muted px-3 py-2.5 text-xs leading-relaxed"
      />
      <code
        v-else
        class="shiki min-w-0 flex-1 rounded-md border border-default bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-default [overflow-wrap:anywhere]"
        v-html="html"
      />
      <UButton
        type="button"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="outline"
        class="min-h-11 min-w-11 shrink-0 justify-center"
        :aria-label="`Copy ${label}`"
        @click="copyCode"
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
