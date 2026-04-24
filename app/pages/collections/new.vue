<script setup lang="ts">
const { user, isAuthenticated } = useAuth()
const authModalOpen = inject<Ref<boolean>>('authModalOpen', ref(false))

useSeoMeta({
  title: 'New Collection',
  description: 'Sign in with your Atmosphere account to publish a new skill collection.',
  robots: 'noindex',
})

watchEffect(async () => {
  if (isAuthenticated.value && user.value?.handle)
    await navigateTo(`/people/${user.value.handle}/collections/new`)
})

function signIn() {
  if (import.meta.client)
    sessionStorage.setItem('skilld:post-auth-intent', 'new-collection')
  authModalOpen.value = true
}
</script>

<template>
  <section
    class="mx-auto max-w-xl px-4 sm:px-6 pt-16 pb-12 md:pt-24"
    aria-labelledby="new-collection-heading"
  >
    <div class="rounded-lg border border-default p-6 sm:p-8 text-center">
      <UIcon
        name="i-lucide-layers"
        class="mx-auto size-8 text-muted"
        aria-hidden="true"
      />
      <h1
        id="new-collection-heading"
        class="mt-3 font-mono text-lg font-medium"
      >
        Publish a collection
      </h1>
      <p class="mt-2 text-sm text-muted leading-relaxed max-w-sm mx-auto">
        Bundle the skills you reach for. Share one install command. Sign in with your Atmosphere account to get started.
      </p>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
        <UButton
          label="Connect with your Atmosphere account"
          icon="i-lucide-cloud"
          trailing-icon="i-lucide-arrow-right"
          size="sm"
          @click="signIn"
        />
        <UButton
          to="/collections"
          label="Browse collections"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
    </div>
  </section>
</template>
