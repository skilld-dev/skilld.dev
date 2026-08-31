<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'
import FrameworkSkillsDirectory from '../../components/FrameworkSkillsDirectory.vue'

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<TagProfile>(
  () => '/api/tags/vue?view=data',
  { key: 'tag-vue', lazy: !isBot.value },
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = `${siteOrigin}/frameworks/vue`
const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? 0)

useSeoMeta({
  title: 'Skills for Vue',
  description: () => data.value
    ? `Browse ${data.value.totalSkills} Vue agent skills from ${data.value.topOwners.length}+ maintainers. Every result links to source.`
    : 'Agent skills for Vue 3 components, composables, reactivity, and testing.',
  ogTitle: 'Skills for Vue',
  ogDescription: 'Agent skills for Vue 3 components, composables, reactivity, and testing.',
  ogUrl: canonicalUrl,
  twitterCard: 'summary_large_image',
})

useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })

defineOgImage('Page.takumi', {
  title: 'Skills for Vue',
  description: 'Agent skills for Vue 3 components, composables, reactivity, and testing.',
}, { alt: 'Skills for Vue on skilld' })

useSchemaOrg(computed(() => data.value
  ? [{
      '@type': 'CollectionPage' as const,
      '@id': `${canonicalUrl}#page`,
      'url': canonicalUrl,
      'name': 'Skills for Vue on skilld',
      'description': `${data.value.totalSkills} agent skills for Vue curated on skilld.`,
      'hasPart': data.value.skills.slice(0, 25).map(skill => ({
        '@type': 'SoftwareApplication' as const,
        'name': skill.name,
        'url': `${siteOrigin}${skill.registryPath}`,
        'applicationCategory': 'DeveloperApplication',
        'operatingSystem': 'Any',
      })),
    }]
  : [],
))
</script>

<template>
  <FrameworkSkillsDirectory
    :data
    :status
    :error
    framework="Vue"
    title="Skills for Vue"
    description="Agent skills for Vue 3 components, composables, reactivity, and testing. Every result links to its SKILL.md source."
    heading-id="vue-heading"
    icon="i-simple-icons-vuedotjs"
    website-url="https://vuejs.org"
    website-label="vuejs.org"
    :synced-ago
    @refresh="refresh"
  />
</template>
