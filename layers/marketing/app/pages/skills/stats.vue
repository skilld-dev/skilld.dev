<script setup lang="ts">
import type { SkillsStats } from '#layers/registry/server/api/skills/stats.get'

useSeoMeta({
  title: 'Stats',
  description: 'Six charts covering repository age, maintenance, stars, installs, owners, and skill counts.',
})

defineOgImage('Page.takumi', {
  title: 'Stats',
  description: 'Charts for repository maintenance, age, stars, and installs.',
}, { alt: 'Skills stats on skilld' })

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch<SkillsStats>('/api/skills/stats', {
  lazy: !isBot.value,
})

const { prefersReducedMotion } = useMotionA11y()

function entrance(i: number) {
  if (prefersReducedMotion.value) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.15 },
    }
  }
  return {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }
}

const summaryMetrics = computed(() => {
  const s = data.value?.summary
  if (!s)
    return []
  return [
    { label: 'Skills', value: s.skills.toLocaleString() },
    { label: 'Repos', value: s.repos.toLocaleString() },
    { label: 'Owners', value: s.owners.toLocaleString() },
    { label: 'Avg stars', value: s.avgStars.toLocaleString() },
  ]
})
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="stats-heading"
    >
      <h1
        id="stats-heading"
        class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
      >
        Stats
      </h1>
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Compare repository age, maintenance, stars, and installs. Owner and skill counts fill in the rest.
      </p>
    </section>

    <USeparator />

    <section class="mx-auto max-w-5xl px-4 sm:px-6 py-6 md:py-8">
      <div
        v-if="status === 'pending' && !data"
        class="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-busy="true"
      >
        <div
          v-for="i in 4"
          :key="i"
          class="rounded-lg border border-default p-4"
        >
          <USkeleton class="h-3 w-12" />
          <USkeleton class="mt-2 h-6 w-20" />
        </div>
      </div>

      <dl
        v-else-if="data"
        class="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div
          v-for="m in summaryMetrics"
          :key="m.label"
          class="rounded-lg border border-default p-4"
        >
          <dt class="font-mono text-xs uppercase tracking-widest text-muted">
            {{ m.label }}
          </dt>
          <dd class="mt-1 font-mono text-2xl font-medium tabular-nums">
            {{ m.value }}
          </dd>
        </div>
      </dl>
    </section>

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pb-12 md:pb-16"
      aria-labelledby="charts-heading"
    >
      <h2
        id="charts-heading"
        class="sr-only"
      >
        Registry charts
      </h2>

      <div
        v-if="error"
        role="alert"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load stats. Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          size="sm"
          variant="outline"
          color="neutral"
          class="mt-4"
          @click="refresh()"
        />
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <Motion
          as="article"
          class="rounded-lg border border-default p-4 sm:p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          v-bind="entrance(0)"
        >
          <header class="mb-3">
            <h3 class="font-mono text-sm font-medium">
              Star distribution
            </h3>
            <p class="font-mono text-xs text-muted">
              Dedicated skill repos · {{ data?.starHistogramTotal ?? 0 }} repos · log bins · sqrt scale
            </p>
          </header>
          <div v-if="status === 'pending' && !data">
            <USkeleton class="h-[180px] w-full" />
          </div>
          <StatsBars
            v-else-if="data"
            :ariaLabel="'Star count distribution across dedicated skill repos'"
            :bins="data.starHistogram"
            scale="sqrt"
          />
        </Motion>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Motion
            as="article"
            class="rounded-lg border border-default p-4 sm:p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            v-bind="entrance(1)"
          >
            <header class="mb-3">
              <h3 class="font-mono text-sm font-medium">
                Maintenance freshness
              </h3>
              <p class="font-mono text-xs text-muted">
                All active repos · days since last push
              </p>
            </header>
            <div v-if="status === 'pending' && !data">
              <USkeleton class="h-[60px] w-full" />
              <USkeleton class="mt-3 h-16 w-full" />
            </div>
            <StatsHBar
              v-else-if="data"
              :ariaLabel="'Repo maintenance freshness, days since last push'"
              :bins="data.maintenance"
            />
          </Motion>

          <Motion
            as="article"
            class="rounded-lg border border-default p-4 sm:p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            v-bind="entrance(2)"
          >
            <header class="mb-3">
              <h3 class="font-mono text-sm font-medium">
                Repo age
              </h3>
              <p class="font-mono text-xs text-muted">
                All active repos · time since created · sqrt scale
              </p>
            </header>
            <div v-if="status === 'pending' && !data">
              <USkeleton class="h-[180px] w-full" />
            </div>
            <StatsBars
              v-else-if="data"
              :ariaLabel="'Repo age cohorts, time since the repo was created'"
              :bins="data.ageCohorts"
              scale="sqrt"
            />
          </Motion>
        </div>

        <Motion
          as="article"
          class="rounded-lg border border-default p-4 sm:p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          v-bind="entrance(3)"
        >
          <header class="mb-3">
            <h3 class="font-mono text-sm font-medium">
              Top owners by stars
            </h3>
            <p class="font-mono text-xs text-muted">
              Top 15 · ranked by max repo stars · ★ then skill count
            </p>
          </header>
          <div v-if="status === 'pending' && !data">
            <USkeleton
              v-for="i in 8"
              :key="i"
              class="my-1.5 h-5 w-full"
            />
          </div>
          <StatsLeaderboard
            v-else-if="data"
            :ariaLabel="'Top owners ranked by their highest-starred repository'"
            :rows="data.topOwners"
          />
        </Motion>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Motion
            as="article"
            class="rounded-lg border border-default p-4 sm:p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            v-bind="entrance(4)"
          >
            <header class="mb-3">
              <h3 class="font-mono text-sm font-medium">
                Installs vs stars
              </h3>
              <p class="font-mono text-xs text-muted">
                Top {{ data?.scatter.length ?? 0 }} skills with both values · log scale · compare installs with stars
              </p>
            </header>
            <div v-if="status === 'pending' && !data">
              <USkeleton class="h-[240px] w-full" />
            </div>
            <StatsScatter
              v-else-if="data"
              :ariaLabel="'Scatter of npm installs against GitHub stars on log-log scale'"
              :points="data.scatter"
            />
          </Motion>

          <Motion
            as="article"
            class="rounded-lg border border-default p-4 sm:p-5 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            v-bind="entrance(5)"
          >
            <header class="mb-3">
              <h3 class="font-mono text-sm font-medium">
                Skills per repo
              </h3>
              <p class="font-mono text-xs text-muted">
                All active repos · how many skills each ships
              </p>
            </header>
            <div v-if="status === 'pending' && !data">
              <USkeleton class="h-[180px] w-full" />
            </div>
            <StatsBars
              v-else-if="data"
              :ariaLabel="'Distribution of how many skills each repo publishes'"
              :bins="data.skillsPerRepo"
            />
          </Motion>
        </div>
      </div>
    </section>
  </div>
</template>
