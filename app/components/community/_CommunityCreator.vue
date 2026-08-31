<script setup lang="ts">
// Explicitly imported by the community page; the underscore keeps it out of global auto-imports.
import type { CommunityDirectoryItem } from '~~/server/utils/community'
import CollectionAvatar from '../collections/_CollectionAvatar.vue'

const { creator } = defineProps<{
  creator: CommunityDirectoryItem
}>()

const displayName = computed(() => creator.name || `@${creator.login}`)
const contributionSummary = computed(() => [
  creator.collectionCount
    ? `${creator.collectionCount} ${creator.collectionCount === 1 ? 'collection' : 'collections'}`
    : null,
  creator.skillCount
    ? `${creator.skillCount} ${creator.skillCount === 1 ? 'skill' : 'skills'}`
    : null,
].filter(Boolean).join(' · '))

function formatStars(stars: number): string {
  return new Intl.NumberFormat('en', {
    notation: stars >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(stars)
}
</script>

<template>
  <article class="community-creator">
    <div class="community-creator__identity">
      <NuxtLink
        :to="`/@${creator.login}`"
        class="community-creator__profile group"
        :aria-label="`View ${displayName}'s profile`"
      >
        <CollectionAvatar
          :src="creator.avatar"
          :name="displayName"
          size="lg"
          class="community-creator__avatar"
        />
        <span class="min-w-0">
          <span class="block truncate text-lg font-semibold tracking-tight group-hover:text-muted">
            {{ displayName }}
          </span>
          <span
            v-if="displayName !== `@${creator.login}`"
            class="mt-1 block truncate font-mono text-sm text-muted"
          >
            @{{ creator.login }}
          </span>
        </span>
      </NuxtLink>

      <p class="mt-4 font-mono text-sm text-muted">
        {{ contributionSummary }}
      </p>
    </div>

    <div class="community-creator__contributions">
      <NuxtLink
        v-if="creator.topCollection"
        :to="`/@${creator.topCollection.authorLogin}/${creator.topCollection.slug}`"
        class="community-contribution group"
      >
        <span class="flex items-center justify-between gap-4">
          <span class="font-mono text-sm uppercase tracking-widest text-muted">
            {{ creator.featured ? 'Featured collection' : 'Latest collection' }}
          </span>
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </span>
        <span class="mt-4 block text-xl font-semibold leading-tight tracking-tight">
          {{ creator.topCollection.name }}
        </span>
        <span
          v-if="creator.topCollection.preamble"
          class="mt-2 line-clamp-3 text-base leading-relaxed text-muted text-pretty"
        >
          {{ creator.topCollection.preamble }}
        </span>
        <div
          v-if="creator.topCollection.skills.length"
          class="community-contribution__skill-preview"
        >
          <span class="section-label">Included skills</span>
          <ul class="community-contribution__skill-list">
            <li
              v-for="skill in creator.topCollection.skills"
              :key="`${skill.owner}/${skill.repo}/${skill.name}`"
              class="community-contribution__skill"
            >
              <UIcon name="i-lucide-file-code-2" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span class="truncate">{{ skill.displayName || skill.name }}</span>
            </li>
          </ul>
          <span
            v-if="creator.topCollection.skillCount > creator.topCollection.skills.length"
            class="mt-2 block font-mono text-xs text-muted"
          >
            +{{ creator.topCollection.skillCount - creator.topCollection.skills.length }} more
          </span>
        </div>
        <span
          class="mt-auto pt-5 font-mono text-sm text-muted"
          :class="{ 'community-contribution__count--previewed': creator.topCollection.skills.length }"
        >
          {{ creator.topCollection.skillCount }} {{ creator.topCollection.skillCount === 1 ? 'skill' : 'skills' }}
        </span>
      </NuxtLink>

      <NuxtLink
        v-if="creator.topSkill"
        :to="creator.topSkill.registryPath"
        class="community-contribution group"
      >
        <span class="flex items-center justify-between gap-4">
          <span class="font-mono text-sm uppercase tracking-widest text-muted">
            Most popular skill
          </span>
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </span>
        <span class="mt-4 block text-xl font-semibold leading-tight tracking-tight">
          {{ creator.topSkill.displayName || creator.topSkill.name }}
        </span>
        <span class="mt-2 block font-mono text-sm text-muted">
          {{ creator.topSkill.owner }}/{{ creator.topSkill.repo }}
        </span>
        <span
          v-if="creator.topSkill.description"
          class="mt-3 line-clamp-3 text-base leading-relaxed text-muted text-pretty"
        >
          {{ creator.topSkill.description }}
        </span>
        <span class="mt-auto flex items-center gap-2 pt-5 font-mono text-sm text-muted">
          <UIcon name="i-lucide-star" class="size-4" aria-hidden="true" />
          {{ formatStars(creator.topSkill.stars) }} GitHub {{ creator.topSkill.stars === 1 ? 'star' : 'stars' }}
        </span>
      </NuxtLink>
    </div>
  </article>
</template>

<style scoped>
.community-creator {
  display: grid;
  min-width: 0;
  gap: 1.5rem;
  padding-block: 1.5rem;
}

.community-creator__identity {
  min-width: 0;
}

.community-creator__profile {
  display: flex;
  min-height: 3rem;
  align-items: center;
  gap: 0.875rem;
}

.community-creator__profile :deep(.community-creator__avatar) {
  font-size: 0.875rem;
}

.community-creator__contributions {
  display: grid;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.community-contribution {
  display: flex;
  min-width: 0;
  min-height: 11rem;
  flex-direction: column;
  padding: 1.25rem;
  container-type: inline-size;
  transition: background-color 200ms ease-out;
}

.community-contribution__skill-preview {
  display: none;
}

.community-contribution__skill-list {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 1rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.community-contribution__skill {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

@container (min-width: 36rem) {
  .community-contribution__skill-preview {
    display: block;
    margin-top: 1.25rem;
    padding-block: 1rem;
    border-block: 1px solid var(--ui-border);
  }

  .community-contribution__count--previewed {
    display: none;
  }
}

.community-contribution + .community-contribution {
  border-top: 1px solid var(--ui-border);
}

@media (min-width: 48rem) {
  .community-creator {
    grid-template-columns: minmax(12rem, 0.55fr) minmax(0, 1.45fr);
    gap: 2rem;
  }
}

@media (min-width: 64rem) {
  .community-creator__contributions {
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  }

  .community-contribution + .community-contribution {
    border-top: 0;
    border-left: 1px solid var(--ui-border);
  }
}

@media (hover: hover) {
  .community-contribution:hover {
    background: var(--ui-bg-muted);
  }
}
</style>
