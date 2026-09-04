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
  // The /learn index is a 55-word card list (GOOGLE_RECOVERY.md thin-page
  // audit). Articles stay indexable; the index earns index back when it
  // carries real editorial content.
  robots: () => slug.value ? 'index,follow' : 'noindex,follow',
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})
</script>

<template>
  <MarketingArticle
    v-if="data"
    :page="data"
    label="Authoring guide"
  />
</template>
