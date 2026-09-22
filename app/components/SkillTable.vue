<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { trendingSkillKey } from '#shared/trending-keys'

/**
 * Dense browse table for skill lists. One row per skill, sized to fit as many
 * skills on screen as the registry can give us. Descriptions stay on a single
 * truncated line; anything longer lives on the skill page.
 */
interface SkillRow {
  owner: string
  repo: string
  name: string
  registryPath: string
  slug: string
  description?: string | null
  stars?: number
  likeCount?: number
  official?: boolean
  pushedAt?: number | null
  modifiedAt?: number | null
  /** GitHub profile name of the owner, when the owner has been synced. */
  authorName?: string | null
  /** SKILL.md on GitHub at the synced revision. */
  skillFileUrl?: string | null
}

const {
  skills,
  ariaLabel = 'Skills',
  showHeader = true,
  metric = 'stars',
  trendingKeys,
} = defineProps<{
  skills: readonly SkillRow[]
  ariaLabel?: string
  showHeader?: boolean
  metric?: 'stars' | 'likes'
  /**
   * Skills currently on the trending board, keyed by `trendingSkillKey`.
   *
   * Optional so every other caller of this table is unaffected. Omitted means
   * no flames, not an empty board.
   */
  trendingKeys?: ReadonlySet<string>
}>()

function isTrending(skill: SkillRow): boolean {
  return trendingKeys?.has(trendingSkillKey(skill.owner, skill.repo, skill.name)) ?? false
}

const now = useState('render:now', () => Number(new Date()))

function repoSlug(skill: SkillRow): string {
  return `${skill.owner}/${skill.repo}`
}

function authorName(skill: SkillRow): string | null {
  return resolveAuthorName(skill.owner, skill.authorName)
}

function updatedAt(skill: SkillRow): number | null {
  return skill.modifiedAt ?? skill.pushedAt ?? null
}

function updatedLabel(skill: SkillRow): string {
  const ts = updatedAt(skill)
  if (ts == null)
    return '—'

  const days = Math.floor((now.value - ts * 1000) / 86_400_000)
  if (days < 1)
    return 'today'
  if (days < 30)
    return `${days}d`
  if (days < 365)
    return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}
</script>

<template>
  <div class="skill-table">
    <div v-if="showHeader" class="skill-table__head" aria-hidden="true">
      <span>Skill</span>
      <span>Source</span>
      <span class="skill-table__col-description">What it does</span>
      <span class="skill-table__col-metric skill-table__metric-heading">
        {{ metric === 'likes' ? 'Likes' : 'Stars' }}
      </span>
      <span class="skill-table__col-updated">Updated</span>
    </div>

    <ul class="skill-table__body list-none p-0" :aria-label="ariaLabel">
      <li v-for="skill in skills" :key="skill.slug" class="relative">
        <NuxtLink
          :to="skill.registryPath"
          class="skill-table__row group"
          :aria-label="`/${skill.name} by ${authorName(skill) ?? skill.owner}`"
        >
          <span class="skill-table__skill">
            <span class="truncate font-mono text-sm">/{{ skill.name }}</span>
            <!--
              The flame is decorative, so the meaning goes in text a screen
              reader can reach. Without it the row says nothing about why this
              skill differs from the one above it.
            -->
            <span v-if="isTrending(skill)" class="shrink-0">
              <span class="trending-fire" aria-hidden="true">🔥</span>
              <span class="sr-only">Trending</span>
            </span>
            <UIcon
              v-if="skill.official"
              name="i-lucide-badge-check"
              class="size-3.5 shrink-0 text-muted"
              title="Official publisher"
              aria-hidden="true"
            />
          </span>

          <span class="skill-table__source">
            <img
              :src="githubAvatarProxyUrl(skill.owner, 40)"
              alt=""
              width="20"
              height="20"
              class="size-5 shrink-0 rounded-full bg-muted"
              loading="lazy"
              decoding="async"
            >
            <span class="skill-table__byline">
              <span
                v-if="authorName(skill)"
                class="truncate text-xs text-toned"
              >{{ authorName(skill) }}</span>
              <span class="truncate font-mono text-[11px] leading-4 text-muted">{{ repoSlug(skill) }}</span>
            </span>
          </span>

          <span class="skill-table__col-description text-xs leading-4 text-muted">
            {{ skill.description || '—' }}
          </span>

          <span class="skill-table__col-metric skill-table__metric data-label justify-end">
            <template v-if="metric === 'likes'">
              <UIcon name="i-lucide-heart" class="size-3" aria-hidden="true" />
              {{ skill.likeCount ?? 0 }}
            </template>
            <template v-else-if="skill.stars">
              <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
              {{ formatGithubStars(skill.stars) }}
            </template>
            <template v-else>
              —
            </template>
          </span>

          <span class="skill-table__col-updated data-label justify-end">
            {{ updatedLabel(skill) }}
          </span>
        </NuxtLink>
        <!-- Sibling of the row link: anchors cannot nest. -->
        <a
          v-if="skill.skillFileUrl"
          :href="skill.skillFileUrl"
          target="_blank"
          rel="noopener"
          aria-label="Read SKILL.md on GitHub"
          class="skill-table__file text-muted transition-colors duration-200 hover:text-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <UIcon name="i-lucide-file-text" class="size-3.5" aria-hidden="true" />
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.skill-table {
  min-inline-size: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.skill-table__head,
.skill-table__row {
  display: grid;
  align-items: center;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
  padding-inline: 0.75rem 2.75rem;
}

.skill-table__head {
  border-block-end: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  padding-block: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.skill-table__body > li + li {
  border-block-start: 1px solid var(--ui-border);
}

.skill-table__row {
  min-block-size: 2.5rem;
  padding-block: 0.4375rem;
  transition: background-color 200ms ease-out;
}

.skill-table__skill,
.skill-table__source {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.5rem;
}

.skill-table__byline {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
}

.skill-table__file {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: 0.25rem;
  display: inline-flex;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius);
  translate: 0 -50%;
}

.skill-table__col-description,
.skill-table__col-metric,
.skill-table__col-updated {
  display: none;
}

.skill-table__col-metric,
.skill-table__col-updated {
  align-items: center;
  gap: 0.25rem;
}

@media (hover: hover) {
  .skill-table__row:hover {
    background: var(--ui-bg-elevated);
  }
}

@media (min-width: 48rem) {
  .skill-table__head,
  .skill-table__row {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 1.6fr) 4rem;
  }

  .skill-table__head .skill-table__col-description {
    display: block;
  }

  .skill-table__row .skill-table__col-description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .skill-table__col-metric {
    display: flex;
  }
}

@media (min-width: 64rem) {
  .skill-table__head,
  .skill-table__row {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.75fr) minmax(0, 1.7fr) 4rem 4rem;
  }

  .skill-table__col-updated {
    display: flex;
  }
}

@media (forced-colors: active) {
  .skill-table {
    border-color: CanvasText;
  }
}
</style>
