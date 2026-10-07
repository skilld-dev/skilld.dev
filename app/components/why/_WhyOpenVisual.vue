<script setup lang="ts">
import type { RecentPullRequest } from '#shared/open-source-pull-requests'
import { avatarProxyUrl } from '#shared/image-proxy'
import { OPEN_SOURCE_REPOSITORIES } from '#shared/open-source-pull-requests'
import WhyPanel from './_WhyPanel.vue'

/**
 * skilld's two public repositories, then the pull requests merged into them
 * most recently, live from `/api/feed/recent-pull-requests`. Without pulls,
 * the repositories still show, because the claim is that the code is public,
 * and the links prove it on their own.
 */
const { pulls, compact = false } = defineProps<{
  pulls: readonly RecentPullRequest[]
  /** Fewer rows, for a narrow column. */
  compact?: boolean
}>()

const shown = computed(() => pulls.slice(0, compact ? 3 : 6))

function repositoryLabel(fullName: string): string {
  return OPEN_SOURCE_REPOSITORIES.find(repository => repository.fullName === fullName)?.label ?? fullName
}
</script>

<template>
  <WhyPanel label="github.com/skilld-dev">
    <ul class="why-open__repos" aria-label="skilld's public repositories">
      <li v-for="repository in OPEN_SOURCE_REPOSITORIES" :key="repository.fullName">
        <a :href="`https://github.com/${repository.fullName}`" target="_blank" rel="noopener" class="why-open__repo">
          <UIcon name="i-simple-icons-github" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="why-open__repo-name">{{ repository.fullName.split('/')[1] }}</span>
          <span class="why-open__repo-meta">{{ repository.label }} · MIT</span>
        </a>
      </li>
    </ul>
    <template v-if="shown.length">
      <p class="why-open__heading">
        Recently merged
      </p>
      <ul class="why-open__pulls" aria-label="Recently merged pull requests">
        <li v-for="pull in shown" :key="`${pull.repository}#${pull.number}`">
          <a :href="pull.url" target="_blank" rel="noopener" class="why-open__pull">
            <img
              v-if="pull.avatarUrl"
              :src="avatarProxyUrl(pull.avatarUrl)"
              alt=""
              width="16"
              height="16"
              loading="lazy"
              decoding="async"
              class="why-open__avatar"
            >
            <span class="min-w-0 flex-1">
              <span class="why-open__title">{{ pull.title }}</span>
              <span class="why-open__meta">
                {{ repositoryLabel(pull.repository) }} #{{ pull.number }} ·
                <NuxtTime :datetime="pull.mergedAt * 1000" locale="en" relative numeric="auto" relative-style="short" />
              </span>
            </span>
          </a>
        </li>
      </ul>
    </template>
  </WhyPanel>
</template>

<style scoped>
.why-open__repos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-open__repo {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
  color: var(--ui-text-muted);
  transition: border-color 200ms ease-out;
}

.why-open__repo:hover,
.why-open__repo:focus-visible {
  border-color: var(--ui-border-accented);
}

.why-open__repo-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.why-open__repo-meta {
  flex: none;
  margin-left: auto;
  color: var(--ui-text-dimmed);
}

.why-open__heading {
  margin-top: 0.875rem;
  margin-bottom: 0.375rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
  color: var(--ui-text-muted);
}

.why-open__pulls {
  display: grid;
  /* minmax, so a long title truncates instead of widening the panel. */
  grid-template-columns: minmax(0, 1fr);
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-open__pull {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.5rem;
  margin-inline: -0.375rem;
  padding: 0.25rem 0.375rem;
  border-radius: calc(var(--ui-radius) * 0.75);
  transition: background-color 200ms ease-out;
}

@media (hover: hover) {
  .why-open__pull:hover {
    background: var(--ui-bg-elevated);
  }
}

.why-open__avatar {
  flex: none;
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  border-radius: 999px;
  background: var(--ui-bg-muted);
}

.why-open__title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--ui-text);
}

.why-open__meta {
  display: block;
  color: var(--ui-text-dimmed);
}

/* A narrow column stacks the two repositories, so both names fit. */
@container (max-width: 26rem) {
  .why-open__repos {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .why-open__repo,
  .why-open__pull {
    transition: none;
  }
}
</style>
