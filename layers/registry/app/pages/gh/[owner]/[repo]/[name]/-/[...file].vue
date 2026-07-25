<script setup lang="ts">
const route = useRoute()
const owner = computed(() => String(route.params.owner ?? ''))
const repo = computed(() => String(route.params.repo ?? ''))
const name = computed(() => String(route.params.name ?? ''))
const file = computed(() => {
  const raw = route.params.file
  if (Array.isArray(raw))
    return raw.join('/')
  return String(raw ?? '')
})

const slug = computed(() => `${owner.value}/${repo.value}/${name.value}/${file.value}`)

const { data, status, error } = useFetch(
  () => `/api/skill-asset/${slug.value}`,
  { watch: [slug] },
) as ReturnType<typeof useFetch<{
  status: 'ok'
  raw: string
  html: string | null
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
  branch: string
  skillPath: string | null
}>>

const fileName = computed(() => {
  const parts = file.value.split('/')
  return parts[parts.length - 1] ?? file.value
})

const skillPath = computed(() => repoSkillPath(owner.value, repo.value, name.value))

const githubUrl = computed(() => {
  if (!data.value?.skillPath)
    return null
  const dir = data.value.skillPath.replace(/\/SKILL\.md$/, '')
  return `https://github.com/${owner.value}/${repo.value}/blob/${data.value.branch}/${dir}/${file.value}`
})

const sourceHtml = ref<string | null>(null)
const sourceError = ref<string | null>(null)

async function renderSource(raw: string) {
  sourceError.value = null
  try {
    const ext = file.value.toLowerCase().split('.').pop() ?? ''
    const { highlightToHtml } = await import('#shared/shiki')
    // null means the extension isn't one we ship a grammar for; render the
    // source unhighlighted rather than failing.
    sourceHtml.value = await highlightToHtml(raw, ext)
  }
  catch (err) {
    sourceError.value = err instanceof Error ? err.message : 'Failed to render source'
  }
}

watch(
  () => data.value?.raw,
  (raw) => {
    if (!import.meta.client || !raw || !data.value)
      return
    if (data.value.type === 'markdown')
      return
    sourceHtml.value = null
    renderSource(raw)
  },
  { immediate: true },
)

const pageTitle = computed(() => `${fileName.value} · ${name.value}`)
useSeoMeta({
  title: () => pageTitle.value,
  description: () => `Reference file from the ${name.value} skill by ${owner.value}.`,
  robots: 'noindex,follow',
})
useHead(computed(() => ({
  link: githubUrl.value ? [{ rel: 'canonical', href: githubUrl.value }] : [],
})))
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 py-8">
    <NuxtLink
      :to="skillPath"
      class="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-default transition-colors mb-6"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-3.5"
        aria-hidden="true"
      />
      Back to {{ name }}
    </NuxtLink>

    <header class="mb-6 flex items-start gap-3">
      <NuxtLink
        :to="skillPath"
        class="shrink-0"
        :aria-label="`${name} skill`"
      >
        <img
          :src="`https://github.com/${owner}.png?size=72`"
          :alt="`${owner} avatar`"
          width="40"
          height="40"
          class="size-10 rounded-md border border-default"
        >
      </NuxtLink>
      <div class="min-w-0 flex-1">
        <h1 class="font-mono text-xl font-medium break-all">
          {{ fileName }}
        </h1>
        <p class="mt-1 font-mono text-xs text-muted break-all">
          <NuxtLink
            :to="skillPath"
            class="hover:text-default transition-colors"
          >
            {{ owner }}{{ repo !== 'skills' ? `/${repo}` : '' }}/{{ name }}
          </NuxtLink>
          <span aria-hidden="true"> · </span>
          {{ file }}
        </p>
      </div>
      <UButton
        v-if="githubUrl"
        :href="githubUrl"
        target="_blank"
        rel="noopener"
        label="GitHub"
        icon="i-lucide-github"
        size="xs"
        color="neutral"
        variant="ghost"
        class="shrink-0"
      />
    </header>

    <div
      v-if="status === 'pending'"
      aria-busy="true"
      class="space-y-2"
    >
      <USkeleton class="h-4 w-3/4" />
      <USkeleton class="h-4 w-2/3" />
      <USkeleton class="h-4 w-1/2" />
    </div>

    <div
      v-else-if="error || !data"
      class="py-12 text-center"
      role="alert"
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="mx-auto size-10 text-muted"
        aria-hidden="true"
      />
      <p class="mt-3 text-sm">
        {{ error?.statusCode === 404 ? "Couldn't find this reference file." : "Couldn't load this reference file." }}
      </p>
      <UButton
        :to="skillPath"
        label="Back to skill"
        size="sm"
        variant="outline"
        color="neutral"
        class="mt-4"
      />
    </div>

    <template v-else>
      <article
        v-if="data.type === 'markdown' && data.html"
        class="skill-prose rounded-lg border border-default p-4 sm:p-6"
        v-html="data.html"
      />
      <div
        v-else-if="sourceHtml"
        class="rounded-lg border border-default overflow-hidden skill-markdown"
        v-html="sourceHtml"
      />
      <div
        v-else-if="sourceError"
        class="rounded-lg border border-default p-4 sm:p-6 text-sm"
        role="alert"
      >
        <p>Couldn't render this file.</p>
        <p class="mt-1 font-mono text-xs text-muted break-all">
          {{ sourceError }}
        </p>
      </div>
      <pre
        v-else
        class="rounded-lg border border-default p-4 sm:p-6 overflow-auto text-xs whitespace-pre-wrap"
      >{{ data.raw }}</pre>
    </template>
  </div>
</template>
