<script setup lang="ts">
const route = useRoute()
const slug = computed(() => {
  const params = route.params.slug
  return Array.isArray(params) ? params.join('/') : (params ?? '')
})

const path = computed(() => `/${slug.value}` || '/index')

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
  <article class="mx-auto max-w-3xl px-4 sm:px-6 py-12 prose prose-stone dark:prose-invert">
    <ContentRenderer
      v-if="data"
      :value="data"
    />
  </article>
</template>
