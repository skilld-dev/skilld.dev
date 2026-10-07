<script setup lang="ts">
import type { TrendingBoardRow, TrendingPost } from '#shared/trending-range'
import { avatarProxyUrl, githubAvatarProxyUrl } from '#shared/image-proxy'
import { postExcerpt } from '#shared/trending-post'
import WhyPanel from './_WhyPanel.vue'

/**
 * The people behind a Skill, drawn small: the maintainer who wrote one, then
 * the devs who posted about the head of the trending board, in their words.
 *
 * The maintainer is `mattpocock/skills` `grill-me` as production listed it on
 * 2026-10-07. The posters are live: the caller passes the first trending row
 * ranked by posts. Without one, only the maintainer shows, because a made-up
 * post would put words in a real dev's mouth.
 */
const { row } = defineProps<{
  row: TrendingBoardRow | null
}>()

const MAINTAINER = {
  login: 'mattpocock',
  name: 'Matt Pocock',
  skill: 'grill-me',
  to: '/gh/mattpocock/skills/grill-me',
  repository: 'mattpocock/skills',
  skillPath: 'skills/productivity/grill-me/SKILL.md',
  sourceUrl: 'https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md',
}

/** Circles before the stack counts the rest, as on the board. */
const MAX_FACES = 3

const posts = computed<readonly TrendingPost[]>(() => row?.reason._tag === 'posts' ? row.reason.posts : [])
const faces = computed(() => posts.value.slice(0, posts.value.length > MAX_FACES ? MAX_FACES - 1 : MAX_FACES))
const rest = computed(() => posts.value.length - faces.value.length)
/** Quotes under the faces. Two read as a conversation; more crowd the picture. */
const QUOTED = 2

const firstPost = computed(() => posts.value[0] ?? null)
const quotes = computed(() => posts.value.slice(0, QUOTED).map(post => ({
  post,
  segments: postExcerpt({ text: post.text, names: row?.names ?? [], budget: 90 }),
})))
</script>

<template>
  <WhyPanel label="skilld.dev · people">
    <p class="why-human__heading">
      Written by
    </p>
    <div class="why-human__maintainer">
      <img
        :src="githubAvatarProxyUrl(MAINTAINER.login, 80)"
        alt=""
        width="36"
        height="36"
        loading="lazy"
        decoding="async"
        class="why-human__avatar"
      >
      <div class="min-w-0">
        <p class="why-human__name">
          {{ MAINTAINER.name }}
        </p>
        <p class="why-human__role">
          wrote <NuxtLink :to="MAINTAINER.to" class="why-human__skill">
            /{{ MAINTAINER.skill }}
          </NuxtLink>
        </p>
      </div>
    </div>
    <a :href="MAINTAINER.sourceUrl" target="_blank" rel="noopener" class="why-human__source">
      <UIcon name="i-simple-icons-github" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="why-human__path">
        <span class="text-default">{{ MAINTAINER.repository }}</span>
        <span aria-hidden="true"> › </span>{{ MAINTAINER.skillPath }}
      </span>
      <UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" aria-hidden="true" />
    </a>

    <template v-if="row && firstPost">
      <p class="why-human__heading why-human__heading--rule">
        Talked about by
      </p>
      <NuxtLink :to="row.to" class="why-human__talk">
        <span class="why-human__faces" aria-hidden="true">
          <span v-for="post in faces" :key="post.url" class="why-human__face">
            <img
              v-if="post.authorAvatar"
              :src="avatarProxyUrl(post.authorAvatar)"
              alt=""
              width="20"
              height="20"
              loading="lazy"
              decoding="async"
            >
            <template v-else>{{ post.handle.slice(0, 1).toUpperCase() }}</template>
          </span>
          <span v-if="rest > 0" class="why-human__face why-human__face--rest">+{{ rest }}</span>
        </span>
        <span class="min-w-0">
          <span class="why-human__about">
            Devs who posted about /{{ row.name }}
          </span>
          <span v-for="quote in quotes" :key="quote.post.url" class="why-human__quote">
            <span class="why-human__handle">@{{ quote.post.handle }}</span>
            <template v-for="(segment, index) in quote.segments" :key="index">
              <mark v-if="segment._tag === 'mention'" class="why-human__mention">{{ segment.value }}</mark>
              <template v-else>{{ segment.value }}</template>
            </template>
          </span>
        </span>
      </NuxtLink>
    </template>
  </WhyPanel>
</template>

<style scoped>
/* Normal case, so names keep their own casing. */
.why-human__heading {
  margin-bottom: 0.5rem;
  color: var(--ui-text-muted);
}

.why-human__heading--rule {
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
}

.why-human__maintainer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.why-human__avatar {
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-muted);
}

.why-human__name {
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.375rem;
  color: var(--ui-text-highlighted);
}

.why-human__role {
  color: var(--ui-text-muted);
}

.why-human__skill {
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
}

.why-human__source {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  margin-top: 0.625rem;
  margin-bottom: 0.875rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
  color: var(--ui-text-muted);
  transition: border-color 200ms ease-out;
}

.why-human__source:hover,
.why-human__source:focus-visible {
  border-color: var(--ui-border-accented);
}

.why-human__path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.why-human__talk {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.625rem;
  margin: -0.25rem -0.375rem 0;
  padding: 0.25rem 0.375rem;
  border-radius: calc(var(--ui-radius) * 0.75);
  transition: background-color 200ms ease-out;
}

@media (hover: hover) {
  .why-human__talk:hover {
    background: var(--ui-bg-elevated);
  }
}

.why-human__faces {
  display: inline-flex;
  flex: none;
  margin-top: 0.125rem;
}

.why-human__face {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  overflow: hidden;
  border: 2px solid var(--ui-bg);
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  font-size: 0.5625rem;
  color: var(--ui-text-muted);
}

.why-human__face + .why-human__face {
  margin-left: -0.5rem;
}

.why-human__face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.why-human__about {
  display: block;
  color: var(--ui-text);
}

.why-human__quote {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  color: var(--ui-text-muted);
}

.why-human__handle {
  margin-right: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
}

.why-human__mention {
  background: none;
  color: var(--ui-text-toned);
}

@media (prefers-reduced-motion: reduce) {
  .why-human__source,
  .why-human__talk {
    transition: none;
  }
}
</style>
