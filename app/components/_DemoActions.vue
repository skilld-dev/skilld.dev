<script setup lang="ts">
import type { DemoIdentity } from '~/utils/home-demos'
import { demoPagePath } from '#shared/demo-pages'
import { skillPageUrl, skillRunCmd, skillRunPrompt } from '#shared/skill-commands'

const { demo, surface } = defineProps<{ demo: DemoIdentity, surface: string }>()
const emit = defineEmits<{ action: [action: { event: 'share' } | { event: 'copy', format: 'agent' | 'terminal' }] }>()
const format = ref<'agent' | 'terminal'>('agent')
const text = computed(() => format.value === 'agent'
  ? `${skillRunPrompt(skillPageUrl(demo.owner, demo.repo, demo.name))}\n\n${demo.prompt}`
  : skillRunCmd(demo.owner, demo.repo, demo.name))
const target = computed(() => ({ kind: 'skill' as const, owner: demo.owner, name: demo.name }))
const { copy, copied } = useInstallCopy(text, surface, 'run', target)
const error = ref('')
const shareUrl = computed(() => `https://skilld.dev${demoPagePath(demo)}`)
const { copy: copyLink, copied: linkCopied, isSupported: linkSupported } = useClipboard({ source: shareUrl, legacy: true })

async function copyPrompt() {
  error.value = ''
  const copiedFormat = format.value
  const result = await copy()
  if (result._tag === 'error')
    error.value = result.message
  else
    emit('action', { event: 'copy', format: copiedFormat })
}
async function share() {
  error.value = ''
  if (!linkSupported.value) {
    error.value = 'Could not copy. Select the link and copy it manually.'
    return
  }
  await copyLink().then(() => emit('action', { event: 'share' })).catch((cause) => {
    console.warn('[demo-share] Could not copy demo link:', cause)
    error.value = 'Could not copy. Select the link and copy it manually.'
  })
}
</script>

<template>
  <div class="demo-actions">
    <UPopover class="demo-actions__run">
      <UButton label="Run it yourself" color="neutral" variant="outline" class="min-h-11" />
      <template #content>
        <div class="w-[min(28rem,calc(100vw-2rem))] space-y-3 p-4 demo-actions__panel">
          <div class="flex gap-2">
            <UButton label="Agent prompt" :aria-pressed="format === 'agent'" color="neutral" variant="outline" class="demo-actions__format min-h-11" @click="format = 'agent'" />
            <UButton label="Terminal" :aria-pressed="format === 'terminal'" color="neutral" variant="outline" class="demo-actions__format min-h-11" @click="format = 'terminal'" />
          </div>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-default p-3 text-xs">{{ text }}</pre>
          <UButton :label="copied ? 'Copied' : format === 'agent' ? 'Copy Agent prompt' : 'Copy command'" color="neutral" variant="outline" class="min-h-11" @click="copyPrompt" />
        </div>
      </template>
    </UPopover>
    <UButton :icon="linkCopied ? 'i-lucide-check' : 'i-lucide-link'" :aria-label="linkCopied ? 'Copied demo link' : 'Copy demo link'" color="neutral" variant="ghost" class="min-h-11 min-w-11 justify-center" @click="share" />
    <span class="sr-only" role="status">{{ linkCopied ? 'Copied demo link' : copied ? 'Copied' : '' }}</span>
    <p v-if="error" role="alert" class="basis-full text-xs text-error">
      {{ error }} <a :href="shareUrl" class="underline">{{ shareUrl }}</a>
    </p>
  </div>
</template>

<style scoped>
.demo-actions__format[aria-pressed='true'] { background: var(--ui-bg-accented); color: var(--ui-text-highlighted); }
.demo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
@media (max-width: 39.99rem) { .demo-actions__run { display: none; } }
</style>
