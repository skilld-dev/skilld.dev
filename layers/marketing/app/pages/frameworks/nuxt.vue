<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'
import FrameworkSkillsDirectory from './_FrameworkSkillsDirectory.vue'

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<TagProfile>(
  () => '/api/tags/nuxt?view=data',
  { key: 'tag-nuxt', lazy: !isBot.value },
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = `${siteOrigin}/frameworks/nuxt`
const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? 0)

useSeoMeta({
  title: 'Skills for Nuxt',
  description: () => data.value
    ? `Browse ${data.value.totalSkills} Nuxt agent skills from ${data.value.topOwners.length}+ maintainers. Every result links to source.`
    : 'Agent skills for Nuxt apps, modules, and Nitro routes, with links to source.',
  ogTitle: 'Skills for Nuxt',
  ogDescription: 'Agent skills for Nuxt apps, modules, and Nitro routes, with links to source.',
  ogUrl: canonicalUrl,
  twitterCard: 'summary_large_image',
})

useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })

defineOgImage('Page.takumi', {
  title: 'Skills for Nuxt',
  description: 'Agent skills for Nuxt apps, modules, and Nitro routes, with links to source.',
}, { alt: 'Skills for Nuxt on skilld' })

useSchemaOrg(computed(() => data.value
  ? [{
      '@type': 'CollectionPage' as const,
      '@id': `${canonicalUrl}#page`,
      'url': canonicalUrl,
      'name': 'Skills for Nuxt on skilld',
      'description': `${data.value.totalSkills} agent skills for Nuxt curated on skilld.`,
      'hasPart': data.value.skills.slice(0, 25).map(skill => ({
        '@type': 'SoftwareApplication' as const,
        'name': skill.name,
        'url': `${siteOrigin}${repoSkillPath(skill.owner, skill.repo, skill.name)}`,
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
    framework="Nuxt"
    title="Skills for Nuxt"
    description="Agent skills for Nuxt apps, modules, and Nitro routes. Every result links to its SKILL.md source."
    heading-id="nuxt-heading"
    icon="i-simple-icons-nuxtdotjs"
    website-url="https://nuxt.com"
    website-label="nuxt.com"
    :synced-ago
    @refresh="refresh"
  />
</template>
