<script setup lang="ts">
import type { SkillsLeaderboardResponse } from '#layers/registry/server/api/skills/leaderboard.get'

useSeoMeta({
  title: 'Agent skill repository leaderboard',
  description: 'Reusable skill repositories from individual GitHub creators, reviewed for eligibility and ranked by current GitHub stars.',
})

defineOgImage('Page.takumi', {
  title: 'Skill repo leaderboard',
  description: 'Individual creators publishing reusable agent skills, ranked by GitHub stars.',
}, { alt: 'Agent skill repository leaderboard on skilld' })

const { isBot } = useBotDetection()
const route = useRoute()
const page = computed(() => {
  const value = Number(route.query.page)
  return Number.isInteger(value) && value > 0 ? value : 1
})
const { data, status, error, refresh } = useFetch<SkillsLeaderboardResponse>(
  '/api/skills/leaderboard',
  {
    key: 'skills-leaderboard-v2',
    lazy: !isBot.value,
    query: { page },
  },
)

const items = computed(() => data.value?.items ?? [])
const isLoading = computed(() => status.value === 'pending' && !data.value)
const formattedSyncDate = computed(() => formatDate(data.value?.starsSyncedAt ?? null))
const pageCount = computed(() => data.value?.pageCount ?? 1)

function pageLocation(target: number): { path: string, query?: { page: number } } {
  return target <= 1
    ? { path: '/skills/leaderboard' }
    : { path: '/skills/leaderboard', query: { page: target } }
}

function formatDate(timestamp: number | null): string | null {
  if (!timestamp)
    return null
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp * 1000)
}
</script>

<template>
  <div>
    <EditorialMasthead
      label="Leaderboard"
      title="Skill repos, ranked."
      description="Repositories from individual creators publishing reusable agent skills, ranked by GitHub stars. Every repository is reviewed before it can appear."
      palette="stone"
      geometry="wash"
      heading-id="leaderboard-heading"
    >
      <template #aside>
        <div class="border-s border-default ps-4 sm:ps-6">
          <p class="section-label">
            Admission rule
          </p>
          <p class="mt-3 text-base font-medium text-default">
            Individual creators. Generic skills.
          </p>
          <p class="mt-2 max-w-sm text-base leading-relaxed text-muted">
            Organization-owned repositories, vendor catalogs, project rules, prompts, bookmarks, and narrow app packs do not qualify.
          </p>
        </div>
      </template>
    </EditorialMasthead>

    <div>
      <section
        class="leaderboard-shell mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
        aria-labelledby="ranking-heading"
      >
        <div class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="section-label">
              Current ranking
            </p>
            <h2 id="ranking-heading" class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Most starred
            </h2>
          </div>
          <p v-if="data" class="data-label">
            {{ data.total }} reviewed {{ data.total === 1 ? 'repo' : 'repos' }}
            <template v-if="formattedSyncDate">
              · stars synced {{ formattedSyncDate }}
            </template>
          </p>
        </div>

        <div
          v-if="isLoading"
          class="editorial-ledger"
          role="status"
          aria-busy="true"
          aria-label="Loading repository leaderboard"
        >
          <div
            v-for="index in 4"
            :key="index"
            class="leaderboard-row"
            aria-hidden="true"
          >
            <USkeleton class="h-4 w-7" />
            <div class="leaderboard-row__repository">
              <USkeleton class="size-10 shrink-0 rounded-full" />
              <div class="min-w-0 flex-1">
                <USkeleton class="h-5 w-44 max-w-full" />
                <USkeleton class="mt-2 h-3 w-64 max-w-full" />
              </div>
            </div>
            <div class="leaderboard-row__metrics">
              <USkeleton class="h-4 w-16" />
              <USkeleton class="h-4 w-20" />
            </div>
            <USkeleton class="leaderboard-row__github size-11 rounded-lg" />
          </div>
        </div>

        <div v-else-if="error" class="editorial-state" role="alert">
          <p class="font-medium">
            Couldn't load the leaderboard.
          </p>
          <p class="mt-1 max-w-lg text-base leading-relaxed text-muted">
            The ranking is unavailable right now. Check your connection and try again.
          </p>
          <UButton
            label="Retry ranking"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
            @click="() => refresh()"
          />
        </div>

        <div v-else-if="items.length === 0" class="editorial-state" role="status">
          <p class="font-medium">
            No repositories have qualified yet.
          </p>
          <p class="mt-1 max-w-lg text-base leading-relaxed text-muted">
            Repositories appear after their purpose and skill inventory have been reviewed.
          </p>
          <UButton
            to="/skills"
            label="Browse skills"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
          />
        </div>

        <template v-else>
          <div class="leaderboard-head" aria-hidden="true">
            <span>Rank</span>
            <span>Repository</span>
            <div class="leaderboard-head__metrics">
              <span>Skills</span>
              <span>GitHub stars</span>
            </div>
            <span class="sr-only">GitHub</span>
          </div>

          <ol
            class="editorial-ledger list-none p-0"
            aria-label="Agent skill repositories ranked by GitHub stars"
          >
            <li
              v-for="item in items"
              :key="`${item.owner}/${item.repo}`"
              class="leaderboard-row group"
            >
              <span class="leaderboard-row__rank">
                <span class="sr-only">Rank </span>
                {{ String(item.rank).padStart(2, '0') }}
              </span>

              <div class="leaderboard-row__repository">
                <img
                  :src="item.avatarUrl"
                  alt=""
                  width="40"
                  height="40"
                  class="leaderboard-row__avatar"
                  loading="lazy"
                  decoding="async"
                >
                <div class="leaderboard-row__content">
                  <NuxtLink
                    :to="item.registryUrl"
                    class="inline-flex min-h-11 max-w-full items-center font-mono text-base font-medium text-default transition-colors duration-200 hover:text-primary focus-visible:text-primary"
                  >
                    <span class="[overflow-wrap:anywhere]">{{ item.owner }}/{{ item.repo }}</span>
                  </NuxtLink>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span class="inline-flex items-center gap-1 font-mono text-xs text-muted">
                      <UIcon name="i-lucide-badge-check" class="size-3.5" aria-hidden="true" />
                      Individual creator · Purpose reviewed
                    </span>
                    <time
                      v-if="item.pushedAt"
                      :datetime="new Date(item.pushedAt * 1000).toISOString()"
                      class="data-label"
                    >
                      Updated {{ formatDate(item.pushedAt) }}
                    </time>
                  </div>
                  <p
                    v-if="item.description"
                    class="mt-2 max-w-2xl text-sm leading-relaxed text-muted"
                  >
                    {{ item.description }}
                  </p>
                  <div class="leaderboard-row__featured">
                    <span class="data-label">Most popular skill</span>
                    <NuxtLink
                      :to="item.topSkill.registryUrl"
                      class="leaderboard-row__featured-link min-h-11"
                      :aria-label="`Open ${item.topSkill.displayName} skill`"
                    >
                      {{ item.topSkill.displayName }}
                      <UIcon
                        name="i-lucide-arrow-up-right"
                        class="size-3.5 shrink-0 text-muted"
                        aria-hidden="true"
                      />
                    </NuxtLink>
                    <span class="leaderboard-row__featured-installs">
                      <span class="sr-only">Featured skill installs: </span>
                      {{ item.topSkill.installs.toLocaleString() }} installs
                    </span>
                  </div>
                </div>
              </div>

              <div class="leaderboard-row__metrics">
                <span class="leaderboard-row__metric">
                  <span class="sr-only">Skill count: </span>
                  <span class="leaderboard-row__mobile-label" aria-hidden="true">Skills</span>
                  <span class="tabular-nums">{{ item.skillCount.toLocaleString() }}</span>
                </span>
                <span class="leaderboard-row__metric">
                  <span class="sr-only">GitHub stars: </span>
                  <span class="leaderboard-row__mobile-label" aria-hidden="true">Stars</span>
                  <span class="inline-flex items-center justify-end gap-1 tabular-nums">
                    <UIcon name="i-lucide-star" class="size-3.5 text-muted" aria-hidden="true" />
                    {{ item.stars.toLocaleString() }}
                  </span>
                </span>
              </div>

              <UButton
                :to="item.githubUrl"
                target="_blank"
                rel="noopener noreferrer"
                icon="i-lucide-github"
                color="neutral"
                variant="ghost"
                class="leaderboard-row__github min-h-11 min-w-11 self-start"
                :aria-label="`Open ${item.owner}/${item.repo} on GitHub in a new tab`"
              />
            </li>
          </ol>

          <nav
            v-if="pageCount > 1"
            class="mt-8 flex items-center justify-between gap-4 border-t border-default pt-6"
            aria-label="Leaderboard pages"
          >
            <UButton
              label="Previous"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="outline"
              :to="pageLocation(page - 1)"
              :disabled="page <= 1"
              class="min-h-11"
            />
            <span class="data-label">
              Page {{ page }} of {{ pageCount }}
            </span>
            <UButton
              label="Next"
              trailing-icon="i-lucide-arrow-right"
              color="neutral"
              variant="outline"
              :to="pageLocation(page + 1)"
              :disabled="page >= pageCount"
              class="min-h-11"
            />
          </nav>
        </template>
      </section>

      <section
        class="border-t border-default bg-muted"
        aria-labelledby="method-heading"
      >
        <div class="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] md:py-16">
          <div>
            <p class="section-label">
              Method
            </p>
            <h2 id="method-heading" class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              A deliberately narrow list.
            </h2>
          </div>
          <div class="max-w-2xl space-y-4 text-base leading-relaxed text-muted">
            <p>
              A reviewer must confirm that the owner is an individual GitHub user and the repository primarily publishes reusable, generic agent skills. Documentation, assets, scripts, and tests are allowed.
            </p>
            <p>
              Organizations, vendor catalogs, app-specific packs, prompts, bookmarks, and general applications are excluded. Repositories rank by current GitHub stars. Each row features its most installed skill; ties sort by skill name.
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.leaderboard-shell {
  container: leaderboard / inline-size;
}

.leaderboard-row {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: start;
  padding-block: 1.25rem;
}

.leaderboard-row__rank {
  padding-block-start: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}

.leaderboard-row__repository {
  grid-column: 2 / -1;
  display: flex;
  min-width: 0;
  gap: 0.75rem;
  align-items: flex-start;
}

.leaderboard-row__content {
  min-width: 0;
  flex: 1;
  container-type: inline-size;
}

.leaderboard-row__avatar {
  width: 2.5rem;
  height: 2.5rem;
  margin-block-start: 0.125rem;
  flex: none;
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--ui-bg-muted);
  object-fit: cover;
}

.leaderboard-row__featured {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.125rem 0.75rem;
  align-items: center;
  margin-block-start: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
}

.leaderboard-row__featured > .data-label {
  grid-column: 1 / -1;
}

.leaderboard-row__featured-link {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-text);
  text-decoration: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.25rem;
  transition: color 200ms;
}

.leaderboard-row__featured-link:hover,
.leaderboard-row__featured-link:focus-visible {
  color: var(--ui-primary);
}

.leaderboard-row__featured-installs {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

@container (min-width: 28rem) {
  .leaderboard-row__featured {
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: 0.875rem;
  }

  .leaderboard-row__featured > .data-label {
    grid-column: auto;
  }
}

.leaderboard-row__metrics {
  grid-column: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.leaderboard-row__github {
  grid-column: 3;
  grid-row: 2;
  align-self: center;
}

.leaderboard-row__metric {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ui-text);
}

.leaderboard-row__mobile-label,
.leaderboard-head {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.leaderboard-head {
  display: none;
}

@container leaderboard (min-width: 42rem) {
  .leaderboard-head,
  .leaderboard-row {
    grid-template-columns: 3rem minmax(0, 1fr) minmax(14rem, 0.65fr) 2.75rem;
    gap: 1rem;
  }

  .leaderboard-head {
    display: grid;
    align-items: center;
    padding-block: 0 0.75rem;
  }

  .leaderboard-head__metrics,
  .leaderboard-row__metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(6rem, 1fr));
    gap: 1rem;
    text-align: end;
  }

  .leaderboard-row__metrics {
    grid-column: auto;
    align-self: center;
  }

  .leaderboard-row__repository {
    grid-column: auto;
  }

  .leaderboard-row__github {
    grid-column: 4;
    grid-row: 1;
    align-self: start;
  }

  .leaderboard-row__metric {
    display: block;
    text-align: end;
  }

  .leaderboard-row__mobile-label {
    display: none;
  }
}
</style>
