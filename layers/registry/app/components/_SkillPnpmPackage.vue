<script setup lang="ts">
import type { PnpmPackage } from '../../shared/pnpm-package'

const { published } = defineProps<{ published: Extract<PnpmPackage, { _tag: 'Found' }> | null }>()
const method = ref<'pnpm' | 'skills-npm'>('pnpm')
</script>

<template>
  <div v-if="published" class="space-y-3 text-xs leading-relaxed" data-testid="pnpm-package">
    <p>
      <a :href="`https://www.npmjs.com/package/${published.package}/v/${published.version}`" class="underline" target="_blank" rel="noopener noreferrer">{{ published.package }}@{{ published.version }}</a>
      includes this Skill.
    </p>
    <div role="group" aria-label="Package Skill setup" class="flex gap-4">
      <button type="button" class="inline-flex min-h-11 items-center gap-1.5 font-mono" :aria-pressed="method === 'pnpm'" :class="method === 'pnpm' ? 'text-default underline underline-offset-4' : 'text-muted'" @click="method = 'pnpm'">
        <UIcon name="i-simple-icons-pnpm" class="size-4" aria-hidden="true" />
        pnpm
      </button>
      <button type="button" class="min-h-11 font-mono" :aria-pressed="method === 'skills-npm'" :class="method === 'skills-npm' ? 'text-default underline underline-offset-4' : 'text-muted'" @click="method = 'skills-npm'">
        skills-npm
      </button>
    </div>
    <template v-if="method === 'pnpm'">
      <p>Requires pnpm 12.11 or newer. Add the package if you need it:</p>
      <CopyText :text="`pnpm add ${published.package}@${published.version}`" label="pnpm package command" />
      <p>Read its Skills, then choose whether to approve the package:</p>
      <CopyText text="pnpm approve" label="pnpm approval command" />
      <p>Approval covers every Skill and later version of the package.</p>
      <p>
        pnpm links into existing Agent directories. Configure <code>skills.dirs</code> if needed.
        <a href="https://pnpm.io/agent-skills" target="_blank" rel="noopener noreferrer" class="underline">Read pnpm setup</a>.
      </p>
    </template>
    <template v-else>
      <p>Anthony Fu's skills-npm links Skills from your installed packages. Requires Node.js 22.20 or newer.</p>
      <p>Read the package's Skills before setup. Add it if you need it:</p>
      <CopyText :text="`npm install ${published.package}@${published.version}`" label="npm package command" />
      <CopyText text="npm install -D skills-npm" label="skills-npm install command" />
      <CopyText text="npx skills-npm setup" label="skills-npm setup command" />
      <p>Setup changes your prepare script and syncs Skills from direct dependencies.</p>
      <a href="https://github.com/antfu/skills-npm" target="_blank" rel="noopener noreferrer" class="underline">Read skills-npm setup</a>
    </template>
  </div>
</template>
