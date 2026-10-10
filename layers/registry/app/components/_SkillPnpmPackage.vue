<script setup lang="ts">
import type { PnpmPackage } from '../../shared/pnpm-package'

const { published } = defineProps<{ published: Extract<PnpmPackage, { _tag: 'Found' }> | null }>()
</script>

<template>
  <details v-if="published" class="mt-4 text-sm" data-testid="pnpm-package">
    <summary class="cursor-pointer py-2 font-mono text-muted hover:text-highlighted">
      Use with pnpm
    </summary>
    <div class="space-y-3 pt-2">
      <p>
        <a :href="`https://www.npmjs.com/package/${published.package}/v/${published.version}`" class="underline" target="_blank" rel="noopener noreferrer">{{ published.package }}@{{ published.version }}</a>
        includes this Skill. Requires pnpm 12.11 or newer.
      </p>
      <p>In your project, add the package if you need it:</p>
      <InstallCommand :command="`pnpm add ${published.package}@${published.version}`" wrap />
      <p>Read its Skills, then choose whether to approve the package:</p>
      <InstallCommand command="pnpm approve" />
      <p>Approval covers every Skill and later version of the package.</p>
      <p>
        pnpm links into existing Agent directories. Configure <code>skills.dirs</code> if needed.
        <a href="https://pnpm.io/agent-skills" target="_blank" rel="noopener noreferrer" class="underline">Read pnpm setup</a>.
      </p>
    </div>
  </details>
</template>
