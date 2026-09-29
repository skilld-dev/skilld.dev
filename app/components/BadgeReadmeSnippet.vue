<script setup lang="ts">
import type { SkillBadgeEmbedInput } from '~~/shared/skill-badge'
import { skillBadgeEmbed } from '~~/shared/skill-badge'

const props = defineProps<Pick<SkillBadgeEmbedInput, 'owner' | 'repo' | 'name' | 'registryPath'>>()

const snippet = computed(() => skillBadgeEmbed({
  owner: props.owner,
  repo: props.repo,
  name: props.name,
  registryPath: props.registryPath,
}))
const { copy, copied } = useClipboard()

function copySnippet(): void {
  void copy(snippet.value)
}
</script>

<template>
  <section aria-labelledby="readme-snippet-heading" data-testid="badge-readme-snippet">
    <h2 id="readme-snippet-heading" class="section-label">
      Add to your README
    </h2>
    <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
      The badge links readers to this page. It shows the skilld mark and no counts, and it follows the reader's light or dark GitHub theme.
    </p>
    <div class="mt-3 flex items-start gap-2">
      <code class="min-w-0 flex-1 overflow-x-auto rounded-md border border-default bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre">{{ snippet }}</code>
      <UButton
        type="button"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="outline"
        class="min-h-11 min-w-11 shrink-0 justify-center"
        :aria-label="copied ? 'README snippet copied' : 'Copy README snippet'"
        @click="copySnippet"
      />
    </div>
  </section>
</template>
