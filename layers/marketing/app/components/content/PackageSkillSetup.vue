<script setup lang="ts">
import type { PackageEcosystem } from '../../utils/package-skill-setup'
import { packageEcosystems, packageSkillGuide, packageSkillSource, parsePackageSkillSetup } from '../../utils/package-skill-setup'

const { ecosystem = 'npm' } = defineProps<{ ecosystem?: PackageEcosystem }>()
const route = useRoute()
const config = computed(() => packageEcosystems[ecosystem])
const setup = computed(() => {
  const parsed = parsePackageSkillSetup({ ecosystem, package: route.query.package })
  return parsed._tag === 'Ok' ? parsed.value : undefined
})
const guide = computed(() => packageSkillGuide(setup.value ?? { ecosystem, package: 'the package I maintain' }))
const { copy, copied } = useClipboard()
const copyError = ref('')

async function copyInstructions() {
  copyError.value = ''
  await copy(guide.value.prompt).catch(() => {
    copyError.value = 'Copy failed. Select and copy the instructions above.'
  })
}
</script>

<template>
  <div class="not-prose my-6 rounded-lg border border-default p-4 wrap-anywhere" data-testid="package-skill-setup">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p class="min-w-0 font-mono text-sm text-highlighted">
        {{ setup?.package ?? config.label }}
      </p>
      <UButton
        :to="{ path: '/make-skill', query: { ecosystem, ...(setup ? { package: setup.package } : {}) } }"
        :label="setup ? 'Change setup' : 'Choose your package'"
        color="neutral"
        variant="link"
        class="min-h-11 px-0 text-sm"
      />
    </div>
    <p class="mt-3 text-base leading-relaxed">
      Open your agent in the package repository. Give it these instructions to draft your Skill.
    </p>
    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <UButton
        :label="copied ? 'Instructions copied' : 'Copy agent instructions'"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        class="min-h-11 hover:bg-primary-600 active:bg-primary-700"
        @click="copyInstructions"
      />
      <UButton
        :to="packageSkillSource"
        label="Read the authoring Skill"
        target="_blank"
        color="neutral"
        variant="link"
        class="min-h-11 px-0 text-sm"
      />
    </div>
    <p class="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-relaxed" data-testid="package-skill-prompt">
      {{ guide.prompt }}
    </p>
    <p class="sr-only" aria-live="polite">
      {{ copied ? 'Instructions copied.' : '' }}
    </p>
    <p v-if="copyError" role="alert" class="mt-3 text-sm text-error">
      {{ copyError }}
    </p>
  </div>
</template>
