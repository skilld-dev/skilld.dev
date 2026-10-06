<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'
import { getTagRedirect } from '#layers/registry/server/utils/tag-quality'
import { avatarProxyUrl } from '#shared/image-proxy'

const route = useRoute()
const tagSlug = computed(() => route.params.slug as string)
const tagRedirect = getTagRedirect(tagSlug.value)

if (tagRedirect)
  await navigateTo(tagRedirect, { redirectCode: 301 })

const { data, error } = await useFetch<TagProfile>(
  () => `/api/tags/${tagSlug.value}?view=data`,
)

if (error.value || !data.value?.tag) {
  throw createError({ statusCode: 404, statusMessage: 'Unknown tag' })
}

const tag = computed(() => data.value!.tag)
const skills = computed(() => data.value!.skills)
const topOwners = computed(() => data.value!.topOwners)
const relatedTags = computed(() => data.value!.relatedTags)
const totalSkills = computed(() => data.value!.totalSkills)
const totalStars = computed(() => data.value!.totalStars)

// No ` · skilld` suffix: site.titleSeparator drives a global titleTemplate that
// already appends it, so writing it here rendered "... · skilld · skilld".
const title = computed(() => `${tag.value.label} skills`)
const description = computed(
  () => `Browse ${totalSkills.value} agent skills tagged ${tag.value.label}. ${tag.value.description}.`,
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  // Tag pages are noindex by default sitewide since 2026-08-22. They were
  // auto-generated lists with no editorial text, and 16% of the sitemap.
  // Indexable only for a vocab tag with an editorial keep=1 decision.
  robots: () => (data.value?.indexable ? 'index,follow' : 'noindex,follow'),
})

defineOgImage('Page.takumi', {
  title: `${tag.value.label} skills`,
  description: tag.value.description,
}, { alt: `${tag.value.label} skills on skilld` })
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16">
    <NuxtLink to="/skills" class="font-mono text-xs text-muted hover:text-default">
      ← All skills
    </NuxtLink>

    <div class="mt-4 flex items-center gap-3">
      <UIcon name="i-lucide-tag" class="size-5 text-muted" />
      <h1 class="font-mono text-2xl sm:text-3xl font-medium tracking-tight">
        {{ tag.label }}
      </h1>
    </div>
    <p class="mt-3 text-sm text-muted max-w-xl leading-relaxed">
      {{ tag.description }}
    </p>
    <p class="mt-2 font-mono text-xs text-muted tabular-nums">
      {{ totalSkills }} {{ totalSkills === 1 ? 'skill' : 'skills' }}
      <span class="mx-1.5 text-default/30">·</span>
      <span :title="`${totalStars.toLocaleString()} GitHub stars`">
        {{ formatGithubStars(totalStars) }} stars
      </span>
    </p>

    <div
      v-if="topOwners.length"
      class="mt-6"
    >
      <h2 class="section-label mb-2">
        Top curators
      </h2>
      <ul class="flex flex-wrap gap-2 list-none p-0">
        <li
          v-for="o in topOwners"
          :key="o.owner"
        >
          <NuxtLink
            :to="`/@${o.owner}`"
            class="inline-flex items-center gap-2 rounded-md border border-default bg-muted/40 px-2 py-1 font-mono text-xs text-muted hover:text-default hover:border-inverted/30 transition-colors"
          >
            <img
              :src="avatarProxyUrl(o.avatar)"
              :alt="o.owner"
              class="size-4 rounded-sm"
              loading="lazy"
            >
            {{ o.owner }}
            <span class="text-default/40 tabular-nums">{{ o.count }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>

    <USeparator class="my-8" />

    <ul
      v-if="skills.length"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
    >
      <li
        v-for="s in skills"
        :key="`${s.owner}/${s.name}`"
      >
        <SkillCard
          :skill="s"
          variant="grid"
          signal="stars"
          show-owner-path
        />
      </li>
    </ul>

    <p v-else class="text-sm text-muted">
      No skills here yet.
    </p>

    <div
      v-if="relatedTags.length"
      class="mt-12"
    >
      <h2 class="section-label mb-3">
        Related tags
      </h2>
      <ul class="flex flex-wrap gap-1.5 list-none p-0">
        <li
          v-for="r in relatedTags"
          :key="r.slug"
        >
          <NuxtLink
            :to="`/skills/tag/${r.slug}`"
            class="inline-flex items-center gap-1 rounded-md border border-default bg-muted/40 px-2 py-1 font-mono text-xs text-muted hover:text-default hover:border-inverted/30 transition-colors"
          >
            <UIcon name="i-lucide-tag" class="size-3" />
            {{ r.label }}
            <span class="text-default/40 tabular-nums">{{ r.count }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
