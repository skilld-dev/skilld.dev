<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import WhyPanel from './_WhyPanel.vue'

/**
 * Who builds skilld, and what the registry never sells. The commitments are
 * the money posture in VISION.md, so this picture changes only with that.
 */
const MAKER = {
  login: 'harlan-zw',
  name: 'Harlan Wilton',
  url: 'https://github.com/harlan-zw',
}

const NEVER = ['Sponsored listings', 'Paid placement', 'Paywalls']
</script>

<template>
  <WhyPanel label="skilld.dev · about">
    <a :href="MAKER.url" target="_blank" rel="noopener" class="why-maker">
      <img
        :src="githubAvatarProxyUrl(MAKER.login, 96)"
        alt=""
        width="48"
        height="48"
        loading="lazy"
        decoding="async"
        class="why-maker__avatar"
      >
      <span class="min-w-0">
        <span class="why-maker__name">{{ MAKER.name }}</span>
        <span class="why-maker__role">builds skilld · @{{ MAKER.login }}</span>
      </span>
    </a>
    <p class="why-maker__heading">
      Never on skilld
    </p>
    <ul class="why-maker__never">
      <li v-for="item in NEVER" :key="item">
        <UIcon name="i-lucide-x" class="size-3.5 shrink-0" aria-hidden="true" />
        {{ item }}
      </li>
    </ul>
  </WhyPanel>
</template>

<style scoped>
.why-maker {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: -0.25rem -0.375rem 0;
  padding: 0.25rem 0.375rem;
  border-radius: calc(var(--ui-radius) * 0.75);
  transition: background-color 200ms ease-out;
}

@media (hover: hover) {
  .why-maker:hover {
    background: var(--ui-bg-elevated);
  }
}

.why-maker:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.why-maker__avatar {
  flex: none;
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-muted);
}

.why-maker__name {
  display: block;
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.375rem;
  color: var(--ui-text-highlighted);
}

.why-maker__role {
  display: block;
  color: var(--ui-text-muted);
}

.why-maker__heading {
  margin-top: 0.875rem;
  margin-bottom: 0.375rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.why-maker__never {
  display: grid;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-maker__never li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.5rem;
  color: var(--ui-text);
}

.why-maker__never :deep(svg),
.why-maker__never span[class*='i-'] {
  color: var(--ui-text-dimmed);
}

@media (prefers-reduced-motion: reduce) {
  .why-maker {
    transition: none;
  }
}
</style>
