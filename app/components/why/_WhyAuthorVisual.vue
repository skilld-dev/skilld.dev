<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import WhyPanel from './_WhyPanel.vue'

/**
 * Provenance, drawn small: the person who wrote the Skill comes first, then
 * the Skill, then the exact SKILL.md in their Repository. `mattpocock/skills`
 * `grill-me` as production listed it on 2026-10-07.
 */
const SKILL = {
  login: 'mattpocock',
  authorName: 'Matt Pocock',
  name: 'grill-me',
  description: 'A relentless interview to sharpen a plan or design.',
  to: '/gh/mattpocock/skills/grill-me',
  repository: 'mattpocock/skills',
  skillPath: 'skills/productivity/grill-me/SKILL.md',
  sourceUrl: 'https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md',
}

/** Other Skills in the same Repository, so the picture reads as a person's body of work. */
const MORE = ['tdd', 'diagnose', 'zoom-out']
</script>

<template>
  <WhyPanel label="skilld.dev/gh/mattpocock/skills/grill-me">
    <div class="why-author">
      <img
        :src="githubAvatarProxyUrl(SKILL.login, 80)"
        alt=""
        width="40"
        height="40"
        loading="lazy"
        decoding="async"
        class="why-author__avatar"
      >
      <div class="min-w-0">
        <p class="why-author__person">
          {{ SKILL.authorName }}
        </p>
        <p class="why-author__role">
          wrote <NuxtLink :to="SKILL.to" class="why-author__skill">
            /{{ SKILL.name }}
          </NuxtLink>
        </p>
      </div>
    </div>
    <p class="why-author__description">
      {{ SKILL.description }}
    </p>
    <a :href="SKILL.sourceUrl" target="_blank" rel="noopener" class="why-author__source">
      <UIcon name="i-simple-icons-github" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="why-author__path">
        <span class="text-default">{{ SKILL.repository }}</span>
        <span aria-hidden="true"> › </span>{{ SKILL.skillPath }}
      </span>
      <UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" aria-hidden="true" />
    </a>
    <p class="why-author__more">
      <span>Also by {{ SKILL.authorName }}</span>
      <NuxtLink
        v-for="name in MORE"
        :key="name"
        :to="`/gh/${SKILL.repository}/${name}`"
        class="why-author__chip"
      >
        /{{ name }}
      </NuxtLink>
    </p>
  </WhyPanel>
</template>

<style scoped>
.why-author {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.why-author__avatar {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-muted);
}

.why-author__person {
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.375rem;
  color: var(--ui-text-highlighted);
}

.why-author__role {
  color: var(--ui-text-muted);
}

.why-author__skill {
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
}

.why-author__skill:hover {
  text-decoration-color: currentColor;
}

.why-author__description {
  margin-top: 0.75rem;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--ui-text);
}

.why-author__source {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  margin-top: 0.75rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
  color: var(--ui-text-muted);
  transition: border-color 200ms ease-out;
}

.why-author__source:hover,
.why-author__source:focus-visible {
  border-color: var(--ui-border-accented);
}

.why-author__path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.why-author__source {
  margin-bottom: 0.875rem;
}

/* Pinned to the foot when a grid stretches the panel. */
.why-author__more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
  color: var(--ui-text-dimmed);
}

.why-author__more > span {
  margin-right: 0.25rem;
}

.why-author__chip {
  padding: 0 0.375rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.5);
  color: var(--ui-text);
  transition: border-color 200ms ease-out;
}

.why-author__chip:hover,
.why-author__chip:focus-visible {
  border-color: var(--ui-border-accented);
}

@media (prefers-reduced-motion: reduce) {
  .why-author__chip,
  .why-author__source {
    transition: none;
  }
}
</style>
