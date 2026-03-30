<script setup lang="ts">
const route = useRoute()
const handle = computed(() => route.params.handle as string)
const { user, isAuthenticated } = useAuth()

// Guard: must be authenticated and viewing own profile
const isAuthorized = computed(() => isAuthenticated.value && user.value?.handle === handle.value)

useSeoMeta({
  title: 'New Collection',
  description: 'Create and publish a new skill collection to your Personal Data Server.',
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
          <CollectionEditor @published="onPublished" />
        </div>
      </template>
    </section>
  </div>
</template>
