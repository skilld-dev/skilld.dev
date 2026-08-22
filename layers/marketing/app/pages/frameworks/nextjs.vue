<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'
import FrameworkSkillsDirectory from '../../components/FrameworkSkillsDirectory.vue'

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<TagProfile>(
  () => '/api/tags/nextjs?view=data',
  { key: 'tag-nextjs', lazy: !isBot.value },
)

const siteOrigin = 'https://skilld.dev'
const canonicalUrl = `${siteOrigin}/frameworks/nextjs`
const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? 0)

useSeoMeta({
  title: 'Skills for Next.js',
  description: () => data.value
    ? `Browse ${data.value.totalSkills} Next.js agent skills from ${data.value.topOwners.length}+ maintainers. Every result links to source.`
    : 'Agent skills for the Next.js App Router, Server Components, caching, and routing.',
  ogTitle: 'Skills for Next.js',
  ogDescription: 'Agent skills for the Next.js App Router, Server Components, caching, and routing.',
  ogUrl: canonicalUrl,
  twitterCard: 'summary_large_image',
})

useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })

defineOgImage('Page.takumi', {
  title: 'Skills for Next.js',
  description: 'Agent skills for the Next.js App Router, Server Components, caching, and routing.',
}, { alt: 'Skills for Next.js on skilld' })

useSchemaOrg(computed(() => data.value
  ? [{
      '@type': 'CollectionPage' as const,
      '@id': `${canonicalUrl}#page`,
      'url': canonicalUrl,
      'name': 'Skills for Next.js on skilld',
      'description': `${data.value.totalSkills} agent skills for Next.js curated on skilld.`,
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
    framework="Next.js"
    title="Skills for Next.js"
    description="Agent skills for the Next.js App Router, Server Components, caching, and routing. Every result links to its SKILL.md source."
    heading-id="nextjs-heading"
    icon="i-simple-icons-nextdotjs"
    website-url="https://nextjs.org"
    website-label="nextjs.org"
    :synced-ago
    @refresh="refresh"
  />
</template>
