<script setup lang="ts">
import type { PnpmPackage } from '../../shared/pnpm-package'

const { published } = defineProps<{ published: Extract<PnpmPackage, { _tag: 'Found' }> | null }>()
const method = ref<'pnpm' | 'skills-npm'>('pnpm')
</script>

<template>
  <div v-if="published" class="space-y-3 text-sm leading-relaxed" data-testid="pnpm-package">
    <a :href="`https://www.npmjs.com/package/${published.package}/v/${published.version}`" class="font-mono text-xs underline" target="_blank" rel="noopener noreferrer">{{ published.package }}@{{ published.version }}</a>
    <div role="group" aria-label="Package Skill setup" class="flex gap-4">
      <button type="button" class="inline-flex min-h-11 min-w-11 items-center gap-1.5 font-mono text-xs" :aria-pressed="method === 'pnpm'" :class="method === 'pnpm' ? 'text-default underline underline-offset-4' : 'text-muted'" @click="method = 'pnpm'">
        <UIcon name="i-simple-icons-pnpm" class="size-4" aria-hidden="true" />
        pnpm
      </button>
      <button type="button" class="inline-flex min-h-11 min-w-11 items-center gap-1.5 font-mono text-xs" :aria-pressed="method === 'skills-npm'" :class="method === 'skills-npm' ? 'text-default underline underline-offset-4' : 'text-muted'" @click="method = 'skills-npm'">
        <UIcon name="i-simple-icons-npm" class="size-4" aria-hidden="true" />
        skills-npm
      </button>
    </div>
    <template v-if="method === 'pnpm'">
      <p class="text-muted">
        Requires pnpm 12.11+. Add the package, then read its Skills before approval.
      </p>
      <CopyText :text="`pnpm add ${published.package}@${published.version}`" label="pnpm package command" />
      <CopyText text="pnpm approve" label="pnpm approval command" />
      <p class="text-muted">
        Approval covers every Skill and later version of the package.
      </p>
      <a href="https://pnpm.io/agent-skills" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center text-xs underline">pnpm setup</a>
    </template>
    <template v-else>
      <p class="text-muted">
        Requires Node.js 22.20+. Read the package's Skills before setup.
      </p>
      <CopyText :text="`npm install ${published.package}@${published.version}`" label="npm package command" />
      <CopyText text="npm install -D skills-npm" label="skills-npm install command" />
      <CopyText text="npx skills-npm setup" label="skills-npm setup command" />
      <p class="text-muted">
        Setup changes your prepare script and syncs Skills from direct dependencies.
      </p>
      <a href="https://github.com/antfu/skills-npm" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center text-xs underline">skills-npm setup</a>
    </template>
  </div>
</template>
