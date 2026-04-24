<script setup lang="ts">
import type { CollectionInput, CollectionSkill } from '../../../../../server/utils/atproto/lexicons/collection'

const route = useRoute()
const handle = computed(() => route.params.handle as string)
const { user, isAuthenticated } = useAuth()

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined
}

function list(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v.length)
    return undefined
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

const initialSkills = computed(() => {
  const skill = route.query.skill
  return skill ? [String(skill)] : undefined
})

// Full pre-fill via query params (used for programmatic seeding, e.g. launch collections).
// Example: ?name=Vue%20Ecosystem&slug=vue-ecosystem&skills=vue-skilld,pinia-skilld&skillsOwner=skilld-dev&skillsRepo=vue-ecosystem-skills&stacks=Vue,Nuxt&preamble=...
const initial = computed<Partial<CollectionInput> | undefined>(() => {
  const name = str(route.query.name)
  const slug = str(route.query.slug)
  const description = str(route.query.description)
  const preamble = str(route.query.preamble)
  const stacks = list(route.query.stacks)
  const skillNames = list(route.query.skills)
  const owner = str(route.query.skillsOwner)
  const repo = str(route.query.skillsRepo)

  if (!name && !slug && !description && !preamble && !stacks && !skillNames)
    return undefined

  const skills: CollectionSkill[] | undefined = skillNames?.map(packageName => ({
    packageName,
    ...(owner ? { owner } : {}),
    ...(repo ? { repo } : {}),
  }))

  return {
    ...(name ? { name } : {}),
    ...(slug ? { slug } : {}),
    ...(description ? { description } : {}),
    ...(preamble ? { preamble } : {}),
    ...(stacks ? { stacks } : {}),
    ...(skills ? { skills } : {}),
  }
})

// Guard: must be authenticated and viewing own profile
const isAuthorized = computed(() => isAuthenticated.value && user.value?.handle === handle.value)

useSeoMeta({
  title: 'New Collection',
  description: 'Create and publish a new skill collection.',
})

async function onPublished({ rkey }: { uri: string, rkey: string }) {
  await navigateTo(`/people/${handle.value}/${rkey}`)
}
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-8 md:pt-16"
      aria-labelledby="new-collection-heading"
    >
      <!-- Not authorized -->
      <div
        v-if="!isAuthorized"
        class="py-12 text-center"
      >
        <h1
          id="new-collection-heading"
          class="sr-only"
        >
          New collection
        </h1>
        <UIcon
          name="i-lucide-lock"
          class="mx-auto size-10 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Sign in with your Atmosphere account to create collections.
        </p>
        <UButton
          to="/"
          label="Back to home"
          variant="outline"
          color="neutral"
          size="sm"
          class="mt-4"
        />
      </div>

      <!-- Editor -->
      <template v-else>
        <h1
          id="new-collection-heading"
          class="font-mono text-xl font-medium"
        >
          New collection
        </h1>
        <p class="mt-2 text-sm text-muted leading-relaxed">
          Create a themed skill set. For your personal, everyday skills, use
          <NuxtLink
            :to="`/people/${handle}/edit-skills`"
            class="underline underline-offset-2 hover:text-default"
          >
            Edit skills
          </NuxtLink> instead.
        </p>

        <div class="mt-8">
          <CollectionEditor
            :initial-skills="initialSkills"
            :initial="initial"
            @published="onPublished"
          />
        </div>
      </template>
    </section>
  </div>
</template>
