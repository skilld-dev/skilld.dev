<script setup lang="ts">
import type { PackageManager } from '../utils/package-skill-setup'
import { packageManagerSchema, packageSkillGuide, parsePackageSkillSetup } from '../utils/package-skill-setup'

const route = useRoute()
const router = useRouter()
const managers = [
  { value: 'npm', label: 'npm', icon: 'i-simple-icons-npm', description: 'Use npx' },
  { value: 'pnpm', label: 'pnpm', icon: 'i-simple-icons-pnpm', description: 'Use pnpm dlx' },
  { value: 'yarn', label: 'Yarn', icon: 'i-simple-icons-yarn', description: 'Yarn 2 or later' },
  { value: 'bun', label: 'Bun', icon: 'i-simple-icons-bun', description: 'Use bunx' },
] satisfies { value: PackageManager, label: string, icon: string, description: string }[]

const manager = computed(() => {
  const parsed = packageManagerSchema.safeParse(route.query.manager)
  return parsed.success ? parsed.data : undefined
})
const selectedManager = computed(() => managers.find(item => item.value === manager.value))
const packageName = useState('make-skill-package', () => '')
if (typeof route.query.package === 'string')
  packageName.value = route.query.package

const packageInput = useTemplateRef('packageInput')
type Submission
  = | { _tag: 'Idle' }
    | { _tag: 'Invalid', message: string }
    | { _tag: 'Navigating' }
    | { _tag: 'Failed', message: string }
const submission = ref<Submission>({ _tag: 'Idle' })

watch(manager, async () => {
  submission.value = { _tag: 'Idle' }
  await nextTick()
  packageInput.value?.inputRef?.focus()
})

async function openGuide() {
  if (submission.value._tag === 'Navigating')
    return

  const parsed = parsePackageSkillSetup({ manager: manager.value, package: packageName.value })
  if (parsed._tag === 'Err') {
    submission.value = { _tag: 'Invalid', message: parsed.message }
    packageInput.value?.inputRef?.focus()
    return
  }

  packageName.value = parsed.value.package
  submission.value = { _tag: 'Navigating' }
  await router.push(packageSkillGuide(parsed.value).to).catch(() => {
    submission.value = { _tag: 'Failed', message: 'The guide could not open. Select Open guide to try again.' }
  })
  if (submission.value._tag === 'Navigating')
    submission.value = { _tag: 'Idle' }
}

useSeoMeta({
  title: 'Make a skill',
  description: 'Choose your package manager and package for a guide to writing a Skill you own.',
  robots: 'noindex,follow',
})
useHead({ link: [{ rel: 'canonical', href: 'https://skilld.dev/make-skill' }] })
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-16">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Make a skill
      </h1>
      <p class="mt-4 text-base leading-relaxed text-muted">
        Start with your package. Get a guide to drafting, reviewing, and publishing a Skill you own.
      </p>
    </header>

    <ol aria-label="Setup progress" class="mt-8 flex items-center gap-3 border-b border-default pb-5 font-mono text-sm sm:gap-6">
      <li :aria-current="!manager ? 'step' : undefined" class="flex items-center gap-2" :class="manager ? 'text-muted' : 'text-highlighted'">
        <UIcon v-if="manager" name="i-lucide-check" class="size-4 shrink-0" aria-hidden="true" />
        <span v-else aria-hidden="true">01</span>
        Package manager
      </li>
      <li aria-hidden="true" class="text-muted">
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </li>
      <li :aria-current="manager ? 'step' : undefined" class="flex items-center gap-2" :class="manager ? 'text-highlighted' : 'text-muted'">
        <span aria-hidden="true">02</span>
        Package
      </li>
    </ol>

    <section v-if="!manager" aria-labelledby="manager-heading" class="pt-8">
      <h2 id="manager-heading" class="text-xl font-semibold">
        Which package manager do you use?
      </h2>
      <p class="mt-2 text-base text-muted">
        Your guide will use its commands.
      </p>
      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UButton
          v-for="item in managers"
          :key="item.value"
          :to="{ path: '/make-skill', query: { manager: item.value } }"
          :aria-label="item.label"
          color="neutral"
          variant="outline"
          class="min-h-20 justify-start gap-4 rounded-lg p-4 text-left"
        >
          <UIcon :name="item.icon" class="size-6 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{ item.label }}</span>
            <span class="mt-1 block text-sm font-normal text-muted">{{ item.description }}</span>
          </span>
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        </UButton>
      </div>
    </section>

    <section v-else aria-labelledby="package-heading" class="pt-8">
      <div class="flex items-center justify-between gap-3">
        <h2 id="package-heading" class="text-xl font-semibold">
          Which package do you maintain?
        </h2>
      </div>
      <p class="mt-2 text-base text-muted">
        Your guide will use {{ selectedManager?.label }} and your package name.
      </p>

      <form
        action="/learn/author-npm-package-skills#run-the-authoring-skill"
        method="get"
        class="mt-6"
        novalidate
        :aria-busy="submission._tag === 'Navigating'"
        @submit.prevent="openGuide"
      >
        <input type="hidden" name="manager" :value="manager">
        <UFormField
          label="Package name"
          name="package"
          help="Use the name from package.json, including its scope."
          :error="submission._tag === 'Invalid' ? submission.message : undefined"
          :ui="{ label: 'text-base', help: 'text-sm', error: 'text-sm' }"
        >
          <UInput
            ref="packageInput"
            v-model="packageName"
            name="package"
            placeholder="@your-org/your-package"
            autocomplete="off"
            autocapitalize="none"
            :spellcheck="false"
            class="w-full"
            :ui="{ base: 'min-h-12 font-mono text-base' }"
            @update:model-value="submission = { _tag: 'Idle' }"
          />
        </UFormField>
        <p v-if="submission._tag === 'Failed'" role="alert" class="mt-3 text-sm text-error">
          {{ submission.message }}
        </p>
        <div class="mt-8 flex items-center justify-between gap-3">
          <UButton
            to="/make-skill"
            label="Back"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            class="min-h-11"
            :disabled="submission._tag === 'Navigating'"
          />
          <UButton
            type="submit"
            label="Open guide"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11 hover:bg-primary-600 active:bg-primary-700"
            :loading="submission._tag === 'Navigating'"
          />
        </div>
      </form>
    </section>

    <UButton
      to="/learn/author-npm-package-skills"
      label="Read the guide without setup"
      color="neutral"
      variant="link"
      class="mt-8 min-h-11 px-0 text-sm"
    />
  </div>
</template>
