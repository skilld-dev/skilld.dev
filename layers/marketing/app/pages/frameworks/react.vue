<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'
import FrameworkSkillsDirectory from '../../components/FrameworkSkillsDirectory.vue'

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<TagProfile>(
  () => '/api/tags/react?view=data',
  { key: 'tag-react', lazy: !isBot.value },
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = `${siteOrigin}/frameworks/react`
const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? 0)

useSeoMeta({
  title: 'Skills for React',
  description: () => data.value
    ? `Browse ${data.value.totalSkills} React agent skills from ${data.value.topOwners.length}+ maintainers. Every result links to source.`
    : 'Agent skills for React components, hooks, state management, and current patterns.',
  ogTitle: 'Skills for React',
  ogDescription: 'Agent skills for React components, hooks, state management, and current patterns.',
  ogUrl: canonicalUrl,
  twitterCard: 'summary_large_image',
})

useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })

defineOgImage('Page.takumi', {
  title: 'Skills for React',
  description: 'Agent skills for React components, hooks, state management, and current patterns.',
}, { alt: 'Skills for React on skilld' })

useSchemaOrg(computed(() => data.value
  ? [{
      '@type': 'CollectionPage' as const,
      '@id': `${canonicalUrl}#page`,
      'url': canonicalUrl,
      'name': 'Skills for React on skilld',
      'description': `${data.value.totalSkills} agent skills for React curated on skilld.`,
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
    framework="React"
    title="Skills for React"
    description="Agent skills for React components, hooks, state management, and current patterns. Every result links to its SKILL.md source."
    heading-id="react-heading"
    icon="i-simple-icons-react"
    website-url="https://react.dev"
    website-label="react.dev"
    :synced-ago
    @refresh="refresh"
  />
</template>
