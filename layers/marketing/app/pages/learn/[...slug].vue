<script setup lang="ts">
import { learnContentPath } from '../../utils/learn-content-path'

const route = useRoute()
const slug = computed(() => {
  const params = route.params.slug
  return Array.isArray(params) ? params.join('/') : (params ?? '')
})

const path = computed(() => learnContentPath(route.params.slug))

const { data } = await useAsyncData(`learn-${slug.value}`, () => {
  return queryCollection('learn').path(path.value).first()
})

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = computed(() => `${siteOrigin}/learn/${slug.value}`)

useSeoMeta({
  title: () => data.value?.title ?? '',
  description: () => data.value?.description ?? '',
  ogTitle: () => data.value?.title ?? '',
  ogDescription: () => data.value?.description ?? '',
  ogUrl: canonicalUrl,
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})
</script>

<template>
  <article class="learn-article mx-auto max-w-3xl px-4 py-12 prose prose-stone sm:px-6 dark:prose-invert">
    <header v-if="data" class="not-prose mb-10">
      <h1 class="text-4xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
        {{ data.title }}
      </h1>
      <p class="mt-5 max-w-2xl text-base leading-relaxed text-muted text-pretty">
        {{ data.description }}
      </p>
      <p class="data-label mt-4">
        Authoring guide
      </p>
    </header>
    <ContentRenderer
      v-if="data"
      :value="data"
    />
  </article>
</template>

<style scoped>
.learn-article :deep(a) {
  color: var(--ui-text);
  text-decoration-color: var(--ui-color-primary-500);
}

.learn-article :deep(a:hover) {
  color: var(--ui-text-muted);
}
</style>
