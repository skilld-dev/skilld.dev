<script setup lang="ts">
import { escapeHtml } from '~~/shared/highlight'

const { code, label, lang, wrap = false } = defineProps<{
  code: string
  /** What the copy button copies, read by screen readers. */
  label: string
  /** Highlighter language. Omit for a plain command. */
  lang?: 'json' | 'toml' | 'sh'
  /** Wrap prose, such as a prompt, instead of scrolling it sideways. */
  wrap?: boolean
}>()

const { copy, copied } = useClipboard({ copiedDuring: 2000, legacy: true })
const copyError = ref('')

// Same trade as the README snippet: the highlighter loads on demand and runs
// during SSR, so the page ships no highlighter for a handful of snippets.
const { data: html } = await useAsyncData(
  () => `setup-snippet:${lang}:${code}`,
  async () => {
    if (!lang)
      return escapeHtml(code)
    const { highlightCodeBody } = await import('#shared/highlight')
    return highlightCodeBody(code, lang)
  },
)

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
      <code
        class="shiki min-w-0 flex-1 overflow-x-auto rounded-md border border-default bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed"
        :class="wrap ? 'whitespace-pre-wrap' : 'whitespace-pre'"
        v-html="html ?? escapeHtml(code)"
      />
      <UButton
        type="button"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="outline"
        class="min-h-11 min-w-11 shrink-0 justify-center"
        :aria-label="copied ? `${label} copied` : `Copy ${label}`"
        @click="copyCode"
      />
    </div>
    <p v-if="copyError" role="alert" class="mt-2 text-sm text-error">
      {{ copyError }}
    </p>
  </div>
</template>
