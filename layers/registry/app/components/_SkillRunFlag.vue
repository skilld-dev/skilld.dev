<script setup lang="ts">
import type { RunCheckFlag } from '#shared/run-check-flags'

/**
 * The run check flag beside a run command. The command stays: the flag tells
 * the visitor that the last two checks of it failed, why, and when.
 */
const { flag, sourceUrl } = defineProps<{
  flag: RunCheckFlag
  /** The SKILL.md in the author's Repository, where the cause lives. */
  sourceUrl: string
}>()

const headingId = useId()
</script>

<template>
  <div
    role="note"
    :aria-labelledby="headingId"
    data-testid="skill-run-flag"
    class="flex gap-2 text-xs leading-relaxed"
  >
    <UIcon
      name="i-lucide-circle-alert"
      class="mt-0.5 size-3.5 shrink-0 text-warning"
      aria-hidden="true"
    />
    <div class="min-w-0 space-y-0.5">
      <p
        :id="headingId"
        class="font-mono text-default"
      >
        Run failed in the last two checks
      </p>
      <p class="break-words text-muted">
        {{ flag.reason }}
      </p>
      <p class="text-muted">
        Last checked <time :datetime="flag.checkedAt">{{ flag.checkedOn }}</time><template v-if="sourceUrl">
          <span aria-hidden="true"> · </span>
          <a
            :href="sourceUrl"
            target="_blank"
            rel="noopener"
            class="font-mono whitespace-nowrap underline underline-offset-2 transition-colors hover:text-default"
          >SKILL.md on GitHub</a>
        </template>
      </p>
    </div>
  </div>
</template>
