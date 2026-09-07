<script setup lang="ts">
import { packageSkillGuide, parsePackageSkillSetup } from '../../utils/package-skill-setup'

const route = useRoute()
const setup = computed(() => {
  const parsed = parsePackageSkillSetup(route.query)
  return parsed._tag === 'Ok' ? parsed.value : undefined
})
const guide = computed(() => packageSkillGuide(setup.value ?? { manager: 'npm', package: 'your package' }))
const { copy, copied } = useClipboard()
const copyError = ref('')

async function copyInstructions() {
  copyError.value = ''
  const instructions = setup.value ? `${guide.value.command}\n\n${guide.value.prompt}` : guide.value.command
  await copy(instructions).catch(() => {
    copyError.value = 'Copy failed. Select and copy the instructions below.'
  })
}
</script>

<template>
  <div class="not-prose my-6 rounded-lg border border-default p-4" data-testid="package-skill-setup">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p class="min-w-0 break-words font-mono text-sm text-highlighted">
        <template v-if="setup">
          {{ setup.package }} · {{ setup.manager === 'yarn' ? 'Yarn' : setup.manager === 'bun' ? 'Bun' : setup.manager }}
        </template>
        <template v-else>
          Your authoring command
        </template>
      </p>
      <UButton
        :to="{ path: '/make-skill', query: setup ? { manager: setup.manager, package: setup.package } : {} }"
        :label="setup ? 'Change setup' : 'Choose your package'"
        color="neutral"
        variant="link"
        class="min-h-11 px-0 text-sm"
      />
    </div>
    <p class="mt-3 text-base leading-relaxed">
      Open your agent in the repository for {{ setup?.package ?? 'the package you maintain' }}.
      Give it these instructions.
    </p>
    <div class="mt-4 rounded-lg bg-muted p-3 text-sm">
      <InstallCommand :command="guide.command" wrap class="block" />
    </div>
    <p v-if="setup" class="mt-4 break-words text-base leading-relaxed" data-testid="package-skill-prompt">
      {{ guide.prompt }}
    </p>
    <UButton
      :label="copied ? 'Instructions copied' : 'Copy instructions'"
      :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      class="mt-5 min-h-11"
      @click="copyInstructions"
    />
    <p class="sr-only" aria-live="polite">
      {{ copied ? 'Instructions copied.' : '' }}
    </p>
    <p v-if="copyError" role="alert" class="mt-3 text-sm text-error">
      {{ copyError }}
    </p>
  </div>
</template>
