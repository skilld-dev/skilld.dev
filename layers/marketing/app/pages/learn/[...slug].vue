<script setup lang="ts">
import { learnContentPath } from '../../utils/learn-content-path'
import { pageRobots } from '../../utils/page-admissions'

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
  // The /learn index is a 55-word card list, which the 2026-08-22 indexing
  // audit flagged as a thin page. Articles stay indexable; the index earns
  // index back when it carries real editorial content.
  robots: () => slug.value ? pageRobots(`/learn/${slug.value}`) : 'noindex,follow',
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

if (slug.value === 'research/skill-md-size-study') {
  defineOgImage('Page.takumi', {
    title: data.value.title,
    description: '12,141 Skills · 2,297 repositories · Original skilld research',
  }, { alt: data.value.title })

  useSchemaOrg([
    defineArticle({
      headline: data.value.title,
      description: data.value.description,
      datePublished: data.value.publishedAt,
      dateModified: data.value.updatedAt,
      author: { '@type': 'Organization', 'name': 'skilld', 'url': siteOrigin },
    }),
    {
      '@type': 'Dataset',
      '@id': `${canonicalUrl.value}#dataset`,
      'name': 'Skill size and description measurements, 9 October 2026',
      'description': 'Frozen registry measurements with aggregator exclusions, source hashes, description assessment, and weighting comparisons.',
      'url': canonicalUrl.value,
      'version': '2026-10-09-v1',
      'creator': { '@type': 'Organization', 'name': 'skilld', 'url': siteOrigin },
      'distribution': ['csv', 'json'].map(format => ({
        '@type': 'DataDownload',
        'encodingFormat': format === 'csv' ? 'text/csv' : 'application/json',
        'contentUrl': `${siteOrigin}/research/skill-md-size-2026-10-09/measurements.${format}`,
      })),
    },
  ])
}
</script>

<template>
  <MarketingArticle
    v-if="data"
    :page="data"
    label="Authoring guide"
  />
</template>
