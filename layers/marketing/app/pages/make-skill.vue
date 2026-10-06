<script setup lang="ts">
import { packageEcosystems, packageEcosystemSchema, packageSkillGuide, parsePackageSkillSetup } from '../utils/package-skill-setup'
import { skillKinds, skillKindSchema } from '../utils/skill-kind'

const route = useRoute()
const ecosystem = computed(() => {
  const parsed = packageEcosystemSchema.safeParse(route.query.ecosystem)
  return parsed.success ? parsed.data : undefined
})
// A chosen ecosystem implies the package kind, so links that carry only
// `ecosystem` still land on the package step.
const kind = computed(() => {
  if (ecosystem.value)
    return 'package'
  const parsed = skillKindSchema.safeParse(route.query.kind)
  return parsed.success ? parsed.data : undefined
})
const steps = ['Skill', 'Ecosystem', 'Package'] as const
const currentStep = computed(() => ecosystem.value ? 2 : kind.value ? 1 : 0)
const selected = computed(() => ecosystem.value ? packageEcosystems[ecosystem.value] : undefined)
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

watch(ecosystem, async () => {
  submission.value = { _tag: 'Idle' }
  await nextTick()
  packageInput.value?.inputRef?.focus()
})

async function openGuide() {
  if (submission.value._tag === 'Navigating')
    return
  const parsed = parsePackageSkillSetup({ ecosystem: ecosystem.value, package: packageName.value })
  if (parsed._tag === 'Err') {
    submission.value = { _tag: 'Invalid', message: parsed.message }
    packageInput.value?.inputRef?.focus()
    return
  }

  packageName.value = parsed.value.package
  submission.value = { _tag: 'Navigating' }
  // try/catch, not `.catch()`: the await-navigate-to lint rule only accepts a directly awaited call.
  try {
    await navigateTo(packageSkillGuide(parsed.value).to)
  }
  catch {
    submission.value = { _tag: 'Failed', message: 'Couldn\'t open the guide. Check your connection and try again.' }
  }
  if (submission.value._tag === 'Navigating')
    submission.value = { _tag: 'Idle' }
}

useSeoMeta({
  title: 'Make a skill',
  description: 'Choose what your Skill is for. Get a guide to writing it, or let Skillgen keep your package Skill current.',
  robots: 'noindex,follow',
})
defineOgImage('Page.takumi', {
  title: 'Make a skill',
  description: 'Write a Skill for your package or project, and ship it from your repository.',
}, { alt: 'Make a skill on skilld' })
useHead({ link: [{ rel: 'canonical', href: 'https://skilld.dev/make-skill' }] })
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-16">
    <header class="relative isolate">
      <!-- The File minimap: SKILL.md files as dot rows, beside the heading so no dot sits behind text. -->
      <div class="make-skill-minimap absolute -top-10 right-0 -z-10 h-24 w-2/5 sm:top-0 sm:h-full sm:w-40 md:-top-4 md:h-[calc(100%+2rem)]">
        <TextureFileMinimap />
      </div>
      <h1 class="text-3xl font-semibold tracking-tight sm:pr-44 sm:text-4xl">
        Make a skill
      </h1>
      <p class="mt-4 text-base leading-relaxed text-muted sm:pr-44">
        Help agents use your package or work in your project. Get the steps to write a Skill, then let Skillgen keep it current after each release.
      </p>
    </header>

    <ol aria-label="Setup progress" class="mt-8 flex items-center gap-3 border-b border-default pb-5 font-mono text-sm sm:gap-6">
      <template v-for="(step, index) in steps" :key="step">
        <li v-if="index" aria-hidden="true" class="text-muted">
          <UIcon name="i-lucide-chevron-right" class="size-4" />
        </li>
        <li :aria-current="index === currentStep ? 'step' : undefined" :class="index === currentStep ? 'text-highlighted' : 'text-muted'" class="flex items-center gap-2">
          <UIcon v-if="index < currentStep" name="i-lucide-check" class="size-4" aria-hidden="true" />
          <span v-else aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          {{ step }}
        </li>
      </template>
    </ol>

    <section v-if="!kind" aria-labelledby="kind-heading" class="pt-8">
      <h2 id="kind-heading" class="text-xl font-semibold">
        What is your Skill for?
      </h2>
      <div class="mt-6 divide-y divide-default rounded-lg border border-default">
        <UButton
          v-for="(item, key) in skillKinds"
          :key="key"
          :to="item.to"
          :aria-label="item.label"
          color="neutral"
          variant="ghost"
          class="min-h-20 w-full justify-start gap-4 rounded-none p-4 text-left first:rounded-t-lg last:rounded-b-lg"
        >
          <UIcon :name="item.icon" class="size-6 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{ item.label }}</span>
            <span class="mt-1 block text-sm font-normal text-muted">{{ item.detail }}</span>
          </span>
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        </UButton>
      </div>

      <!-- The guides above write a Skill. Skillgen updates one that exists, so it has its own question. -->
      <h2 id="skillgen-heading" class="mt-10 text-xl font-semibold">
        Already ship a package Skill?
      </h2>
      <UButton
        to="/skillgen"
        aria-labelledby="skillgen-heading skillgen-label"
        color="neutral"
        variant="ghost"
        class="mt-6 min-h-20 w-full justify-start gap-4 rounded-lg border border-default p-4 text-left"
      >
        <UIcon name="i-lucide-git-pull-request-draft" class="size-6 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span id="skillgen-label" class="text-base font-medium">Keep it current with Skillgen</span>
            <UBadge label="GitHub App" color="neutral" variant="outline" size="sm" class="font-mono" />
          </span>
          <span class="mt-1 block text-sm font-normal text-muted">After each release tag, Skillgen opens a draft pull request that updates your Skill. npm packages only.</span>
        </span>
        <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-muted" aria-hidden="true" />
      </UButton>
    </section>

    <section v-else-if="!selected" aria-labelledby="ecosystem-heading" class="pt-6">
      <div class="mb-6 flex items-center justify-between gap-3">
        <p class="flex min-w-0 items-center gap-2 font-mono text-sm">
          <UIcon :name="skillKinds.package.icon" class="size-5 shrink-0" aria-hidden="true" />
          {{ skillKinds.package.label }}
        </p>
        <UButton to="/make-skill" label="Change" aria-label="Change Skill kind" color="neutral" variant="link" class="min-h-11 shrink-0 px-0" />
      </div>

      <h2 id="ecosystem-heading" class="text-xl font-semibold">
        Where do you publish your package?
      </h2>
      <div class="mt-6 divide-y divide-default rounded-lg border border-default">
        <UButton
          v-for="(item, key) in packageEcosystems"
          :key="key"
          :to="{ path: '/make-skill', query: { ecosystem: key } }"
          :aria-label="item.label"
          color="neutral"
          variant="ghost"
          class="min-h-20 w-full justify-start gap-4 rounded-none p-4 text-left first:rounded-t-lg last:rounded-b-lg"
        >
          <UIcon :name="item.icon" class="size-6 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{ item.label }}</span>
            <span class="mt-1 block text-sm font-normal text-muted">{{ item.language }}</span>
          </span>
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        </UButton>
      </div>
    </section>

    <section v-else aria-labelledby="package-heading" class="pt-6">
      <div class="mb-6 flex items-center justify-between gap-3">
        <p class="flex min-w-0 items-center gap-2 font-mono text-sm">
          <UIcon :name="selected.icon" class="size-5 shrink-0" aria-hidden="true" />
          {{ selected.label }}
          <span class="text-muted">· {{ selected.language }}</span>
        </p>
        <UButton :to="skillKinds.package.to" label="Change" aria-label="Change ecosystem" color="neutral" variant="link" class="min-h-11 shrink-0 px-0" />
      </div>

      <h2 id="package-heading" class="text-xl font-semibold">
        {{ ecosystem === 'go' ? 'Which module do you maintain?' : 'Which package do you maintain?' }}
      </h2>
      <form
        :action="selected.guide"
        method="get"
        class="mt-6"
        novalidate
        :aria-busy="submission._tag === 'Navigating'"
        @submit.prevent="openGuide"
      >
        <UFormField
          :label="selected.inputLabel"
          name="package"
          :help="selected.help"
          :error="submission._tag === 'Invalid' ? submission.message : undefined"
          :ui="{ label: 'text-base', help: 'text-sm', error: 'text-sm' }"
        >
          <UInput
            ref="packageInput"
            v-model="packageName"
            name="package"
            :placeholder="selected.example"
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

        <div class="mt-8 border-t border-default pt-6">
          <h3 class="text-base font-medium">
            Your {{ selected.label }} guide covers
          </h3>
          <ul class="mt-3 space-y-2 text-sm text-muted">
            <li v-for="topic in selected.topics" :key="topic" class="flex items-start gap-2">
              <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {{ topic }}
            </li>
          </ul>
        </div>
        <UButton
          type="submit"
          :label="`Open ${selected.label} guide`"
          trailing-icon="i-lucide-arrow-right"
          class="mt-6 min-h-11 w-full justify-center hover:bg-primary-600 active:bg-primary-700 sm:w-auto"
          :loading="submission._tag === 'Navigating'"
        />
      </form>
      <UButton
        :to="selected.guide"
        label="Read the guide without a package"
        color="neutral"
        variant="link"
        class="mt-3 min-h-11 px-0 text-sm"
      />
      <!-- Skillgen supports npm packages only. -->
      <div v-if="ecosystem === 'npm'" class="mt-8 flex items-start gap-3 border-t border-default pt-6">
        <UIcon name="i-lucide-git-pull-request-draft" class="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
        <p class="text-sm leading-relaxed text-muted">
          Once the Skill ships, Skillgen can keep it current. After each release tag, it opens a draft pull request that updates the Skill.
          <NuxtLink to="/skillgen" class="text-default underline underline-offset-2 hover:text-primary">
            Set up Skillgen
          </NuxtLink>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Fade the minimap in from the left and out at the top and bottom, so it has no hard edge. */
.make-skill-minimap {
  mask-image: radial-gradient(closest-side, #000 45%, transparent);
  -webkit-mask-image: radial-gradient(closest-side, #000 45%, transparent);
}
</style>
