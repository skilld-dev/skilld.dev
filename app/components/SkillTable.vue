<script setup lang="ts">
/**
 * Dense browse table for skill lists. One row per skill, sized to fit as many
 * skills on screen as the registry can give us. Descriptions stay on a single
 * truncated line; anything longer lives on the skill page.
 */
interface SkillRow {
  owner: string
  repo: string
  name: string
  slug: string
  description?: string | null
  stars?: number
  likeCount?: number
  official?: boolean
  pushedAt?: number | null
  modifiedAt?: number | null
}

const {
  skills,
  ariaLabel = 'Skills',
  showHeader = true,
} = defineProps<{
  skills: readonly SkillRow[]
  ariaLabel?: string
  showHeader?: boolean
}>()

const now = useState('render:now', () => Number(new Date()))

function ownerPath(skill: SkillRow): string {
  return `${skill.owner}/${skill.repo}`
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
      <span class="skill-table__col-stars">Stars</span>
      <span class="skill-table__col-updated">Updated</span>
    </div>

    <ul class="skill-table__body list-none p-0" :aria-label="ariaLabel">
      <li v-for="skill in skills" :key="skill.slug">
        <NuxtLink
          :to="repoSkillPath(skill.owner, skill.repo, skill.name)"
          class="skill-table__row group"
          :aria-label="`/${skill.name} by ${skill.owner}`"
        >
          <span class="skill-table__skill">
            <img
              :src="`https://github.com/${skill.owner}.png?size=32`"
              alt=""
              width="16"
              height="16"
              class="size-4 shrink-0 rounded-full bg-muted"
              loading="lazy"
              decoding="async"
            >
            <span class="truncate font-mono text-sm">/{{ skill.name }}</span>
            <UIcon
              v-if="skill.official"
              name="i-lucide-badge-check"
              class="size-3.5 shrink-0 text-muted"
              title="Official publisher"
              aria-hidden="true"
            />
          </span>

          <span class="skill-table__source truncate font-mono text-xs text-muted">
            {{ ownerPath(skill) }}
          </span>

          <span class="skill-table__col-description truncate text-sm text-muted">
            {{ skill.description || '—' }}
          </span>

          <span class="skill-table__col-stars data-label justify-end">
            <template v-if="skill.stars">
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
  padding-inline: 0.75rem;
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

.skill-table__skill {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.5rem;
}

.skill-table__col-description,
.skill-table__col-stars,
.skill-table__col-updated {
  display: none;
}

.skill-table__col-stars,
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

  .skill-table__col-description {
    display: block;
  }

  .skill-table__col-stars {
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
