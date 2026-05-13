<script setup lang="ts">
const route = useRoute()
const login = computed(() => String(route.params.login))
const slug = computed(() => String(route.params.slug))

const { data: collection, error } = await useFetch(
  () => `/api/collections/by-author/${login.value}/${slug.value}`,
  { key: () => `collection-${login.value}-${slug.value}` },
)

if (error.value)
  throw createError({ statusCode: 404, message: 'Collection not found', fatal: true })

const installCmd = computed(() => collection.value ? collectionInstallCmd(login.value, slug.value) : '')
const copied = ref(false)
function copy() {
  navigator.clipboard.writeText(installCmd.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

useSeoMeta({
  title: () => collection.value ? `${collection.value.name} · @${login.value} · skilld` : 'Collection · skilld',
  description: () => collection.value?.preamble ?? `Skill collection by @${login.value}`,
})

const canonicalUrl = computed(() => `https://skilld.dev/@${login.value}/${slug.value}`)
useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

function collectionSkillPath(skill: { owner: string, repo: string, name?: string | null }) {
  return skill.name
    ? repoSkillPath(skill.owner, skill.repo, skill.name)
    : repoHubPath(skill.owner, skill.repo)
}

function collectionSkillLabel(skill: { repo: string, name?: string | null }) {
  return skill.name ? `/${skill.name}` : skill.repo
}
</script>

<template>
  <div v-if="collection" class="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">
    <NuxtLink
      :to="`/@${login}`"
      class="inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-default transition-colors"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-3"
        aria-hidden="true"
      />
      @{{ login }}
    </NuxtLink>

    <h1 class="mt-3 font-mono text-2xl font-medium tracking-tight">
      {{ collection.name }}
    </h1>
    <p
      v-if="collection.preamble"
      class="mt-3 text-sm text-muted leading-relaxed"
    >
      {{ collection.preamble }}
    </p>

    <div class="mt-6 flex items-center gap-2">
      <code class="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs sm:text-sm">{{ installCmd }}</code>
      <UButton
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="copied ? 'Copied' : 'Copy'"
        size="sm"
        color="neutral"
        variant="outline"
        :aria-label="copied ? 'Install command copied' : 'Copy install command'"
        @click="copy"
      />
    </div>
    <span aria-live="polite" class="sr-only">{{ copied ? 'Install command copied to clipboard' : '' }}</span>

    <div class="mt-4">
      <WatchCollectionButton :login="login" :slug="slug" />
    </div>

    <USeparator class="my-8" />

    <h2 class="section-label mb-4">
      Skills in this collection
    </h2>
    <ul
      v-if="collection.skills.length"
      class="space-y-3 list-none p-0"
    >
      <li
        v-for="skill in collection.skills"
        :key="`${skill.owner}/${skill.repo}/${skill.position}`"
        class="rounded-lg border border-default p-4"
      >
        <NuxtLink
          :to="collectionSkillPath(skill)"
          class="font-mono text-sm font-medium hover:text-muted transition-colors"
        >
          {{ collectionSkillLabel(skill) }}
        </NuxtLink>
        <p class="mt-0.5 text-xs text-muted">
          {{ skill.owner }}/{{ skill.repo }}
        </p>
        <p
          v-if="skill.reason"
          class="mt-2 text-sm text-muted leading-relaxed"
        >
          {{ skill.reason }}
        </p>
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      No skills in this collection yet.
    </p>
  </div>
</template>
