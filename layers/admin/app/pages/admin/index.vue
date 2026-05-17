<script setup lang="ts">
definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: 'Integrity checks (admin)',
  robots: 'noindex,nofollow',
})

type Severity = 'critical' | 'warning' | 'info'

interface Metric {
  label: string
  value: number
  tone: Severity | 'ok'
  help: string
}

interface CheckIssue {
  slug: string | null
  owner: string | null
  repo: string | null
  name: string | null
  displayName: string | null
  value: string | number | null
  detail: string
}

interface IntegrityCheck {
  id: string
  label: string
  severity: Severity
  count: number
  description: string
  issues: CheckIssue[]
}

interface DistributionItem {
  label: string
  count: number
}

interface RecentRegeneration {
  owner: string
  repo: string
  name: string
  generatedAt: number
}

interface AiSpend {
  windowDays: number
  totalUsd: number
  batchCount: number
  inputTokens: number
  outputTokens: number
  recentRegenerations: RecentRegeneration[]
}

interface IntegrityResponse {
  generatedAt: string
  metrics: Metric[]
  reasonDistribution: DistributionItem[]
  scoreDistribution: DistributionItem[]
  trustDistribution?: DistributionItem[]
  trustSourceDistribution?: DistributionItem[]
  aiSpend?: AiSpend | null
  checks: IntegrityCheck[]
}

const severityFilter = ref<'all' | Severity>('all')
const checkQuery = ref('')

const { data, status, error, refresh } = await useFetch<IntegrityResponse>(
  '/api/admin/integrity',
  {
    lazy: true,
    server: false,
  },
)

const checks = computed(() => {
  const list = data.value?.checks ?? []
  const severityFiltered = severityFilter.value === 'all'
    ? list
    : list.filter(check => check.severity === severityFilter.value)
  const q = checkQuery.value.trim().toLowerCase()
  if (!q)
    return severityFiltered
  return severityFiltered.filter(check =>
    check.label.toLowerCase().includes(q)
    || check.description.toLowerCase().includes(q)
    || check.id.toLowerCase().includes(q)
    || check.issues.some(issue =>
      `${issue.owner ?? ''}/${issue.repo ?? ''}/${issue.name ?? ''}`.toLowerCase().includes(q)
      || String(issue.value ?? '').toLowerCase().includes(q)
      || issue.detail.toLowerCase().includes(q),
    ),
  )
})

const totals = computed(() => {
  const list = data.value?.checks ?? []
  return {
    critical: list.filter(c => c.severity === 'critical').reduce((sum, c) => sum + c.count, 0),
    warning: list.filter(c => c.severity === 'warning').reduce((sum, c) => sum + c.count, 0),
    info: list.filter(c => c.severity === 'info').reduce((sum, c) => sum + c.count, 0),
  }
})

const maxReasonCount = computed(() =>
  Math.max(1, ...((data.value?.reasonDistribution ?? []).map(item => item.count))),
)

const maxScoreCount = computed(() =>
  Math.max(1, ...((data.value?.scoreDistribution ?? []).map(item => item.count))),
)

const trustDistribution = computed(() => data.value?.trustDistribution ?? [])
const trustSourceDistribution = computed(() => data.value?.trustSourceDistribution ?? [])

const maxTrustCount = computed(() =>
  Math.max(1, ...(trustDistribution.value.map(item => item.count))),
)

const maxTrustSourceCount = computed(() =>
  Math.max(1, ...(trustSourceDistribution.value.map(item => item.count))),
)

const metricByLabel = computed(() => {
  const map = new Map<string, Metric>()
  for (const metric of data.value?.metrics ?? [])
    map.set(metric.label.toLowerCase(), metric)
  return map
})

function metricValue(label: string) {
  return metricByLabel.value.get(label.toLowerCase())?.value ?? 0
}

const totalSkills = computed(() => metricValue('Total skills'))
const indexableSkills = computed(() => metricValue('Indexable skills'))
const noindexSkills = computed(() => metricValue('Noindex skills'))

const preciseIndexCoverage = computed(() => {
  if (!totalSkills.value)
    return '0.0'
  return ((indexableSkills.value / totalSkills.value) * 100).toFixed(1)
})

const trustBucketCounts = computed(() => {
  const map = new Map(trustDistribution.value.map(item => [item.label, item.count]))
  return {
    official: map.get('official') ?? 0,
    trustedAuthor: map.get('trusted-author') ?? 0,
    trustedCurator: map.get('trusted-curator') ?? 0,
    candidate: map.get('candidate') ?? 0,
    untrusted: map.get('untrusted') ?? 0,
    quarantined: map.get('quarantined') ?? 0,
  }
})

const aiSpend = computed(() => data.value?.aiSpend ?? null)

const aiSpendCostLabel = computed(() => {
  const usd = aiSpend.value?.totalUsd ?? 0
  return usd >= 10 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`
})

const severityColor: Record<Severity, 'error' | 'warning' | 'neutral'> = {
  critical: 'error',
  warning: 'warning',
  info: 'neutral',
}

function issuePath(issue: CheckIssue) {
  if (issue.owner && issue.repo && issue.name)
    return `/skills/${issue.owner}/${issue.repo}/${issue.name}`
  return issue.slug ? `/skills/${issue.slug}` : null
}

const filters = [
  { label: 'All', value: 'all' as const },
  { label: 'Critical', value: 'critical' as const },
  { label: 'Warnings', value: 'warning' as const },
  { label: 'Info', value: 'info' as const },
]

const recoveryCards = computed(() => [
  {
    label: 'Indexable',
    value: metricValue('Indexable skills'),
    icon: 'i-lucide-globe',
    help: 'Allowed into the skills sitemap.',
  },
  {
    label: 'Noindex',
    value: metricValue('Noindex skills'),
    icon: 'i-lucide-eye-off',
    help: 'Kept reachable but out of search.',
  },
  {
    label: 'Coverage',
    value: metricValue('Index coverage %'),
    suffix: '%',
    icon: 'i-lucide-percent',
    help: 'Share of registry rows indexable.',
  },
  {
    label: 'Stale scoring',
    value: metricValue('Stale scoring'),
    icon: 'i-lucide-clock-alert',
    help: 'Needs indexability recompute.',
  },
])
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Integrity checks
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted">
          Registry signals that can make skill pages thin, stale, uncrawlable, or inconsistent with generated pages.
        </p>
        <p
          v-if="data?.generatedAt"
          class="mt-2 font-mono text-xs text-dimmed"
        >
          Generated {{ new Date(data.generatedAt).toLocaleString() }}
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        label="Refresh"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </header>

    <div
      v-if="error"
      class="rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error"
    >
      {{ error.message || 'Failed to load integrity checks.' }}
    </div>

    <div
      v-if="status === 'pending' && !data"
      class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <USkeleton
        v-for="i in 4"
        :key="i"
        class="h-28 rounded-lg"
      />
    </div>

    <template v-else-if="data">
      <section class="rounded-lg border border-default bg-elevated p-5">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div class="mb-2 flex items-center gap-2">
              <UIcon
                name="i-lucide-radar"
                class="size-4 text-muted"
                aria-hidden="true"
              />
              <h2 class="font-medium">
                Corpus summary
              </h2>
            </div>
            <p class="max-w-2xl text-sm text-muted">
              {{ indexableSkills.toLocaleString() }} of {{ totalSkills.toLocaleString() }} skills are indexable. {{ noindexSkills.toLocaleString() }} remain reachable but excluded from search.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">
                Indexable surface
              </p>
              <p class="mt-1 font-mono text-xl">
                {{ preciseIndexCoverage }}%
              </p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">
                Trusted
              </p>
              <p class="mt-1 font-mono text-xl">
                {{ (trustBucketCounts.official + trustBucketCounts.trustedAuthor + trustBucketCounts.trustedCurator).toLocaleString() }}
              </p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">
                Review queue
              </p>
              <p class="mt-1 font-mono text-xl">
                {{ trustBucketCounts.candidate.toLocaleString() }}
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="trustDistribution.length"
          class="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-6"
        >
          <div
            v-for="item in trustDistribution"
            :key="`summary-${item.label}`"
            class="rounded-md bg-muted/40 px-3 py-2"
          >
            <p class="break-all font-mono text-xs text-muted">
              {{ item.label }}
            </p>
            <p class="mt-1 font-mono text-sm">
              {{ item.count.toLocaleString() }}
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="card in recoveryCards"
          :key="card.label"
          class="rounded-lg border border-default bg-elevated p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                {{ card.label }}
              </p>
              <p class="mt-3 text-2xl font-semibold">
                {{ card.value.toLocaleString() }}{{ card.suffix ?? '' }}
              </p>
            </div>
            <span class="flex size-9 items-center justify-center rounded-md bg-muted">
              <UIcon
                :name="card.icon"
                class="size-4 text-muted"
                aria-hidden="true"
              />
            </span>
          </div>
          <p class="mt-2 text-xs text-dimmed">
            {{ card.help }}
          </p>
        </div>
      </section>

      <section
        v-if="aiSpend"
        class="rounded-lg border border-default bg-elevated p-4"
      >
        <div class="mb-4 flex items-center gap-2">
          <UIcon
            name="i-lucide-receipt"
            class="size-4 text-muted"
            aria-hidden="true"
          />
          <h2 class="font-medium">
            AI batch spend
          </h2>
          <span class="text-xs text-dimmed">
            last {{ aiSpend.windowDays }}d
          </span>
        </div>

        <div class="grid gap-3 sm:grid-cols-4">
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Est. cost (USD)
            </p>
            <p class="mt-1 font-mono text-xl">
              {{ aiSpendCostLabel }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Batches
            </p>
            <p class="mt-1 font-mono text-xl">
              {{ aiSpend.batchCount.toLocaleString() }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Input tokens
            </p>
            <p class="mt-1 font-mono text-xl">
              {{ aiSpend.inputTokens.toLocaleString() }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Output tokens
            </p>
            <p class="mt-1 font-mono text-xl">
              {{ aiSpend.outputTokens.toLocaleString() }}
            </p>
          </div>
        </div>

        <div
          v-if="aiSpend.recentRegenerations.length"
          class="mt-4"
        >
          <p class="mb-2 text-xs text-muted">
            Most recently regenerated
          </p>
          <ul class="space-y-1 text-sm">
            <li
              v-for="row in aiSpend.recentRegenerations"
              :key="`${row.owner}/${row.repo}/${row.name}`"
              class="flex items-center justify-between gap-3"
            >
              <NuxtLink
                :to="`/skills/${row.owner}/${row.repo}/${row.name}`"
                class="font-mono text-primary hover:underline"
              >
                {{ row.owner }}/{{ row.repo }}/{{ row.name }}
              </NuxtLink>
              <span class="font-mono text-xs text-dimmed">
                {{ new Date(row.generatedAt * 1000).toLocaleString() }}
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="metric in data.metrics"
          :key="metric.label"
          class="rounded-lg border border-default bg-elevated p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm text-muted">
              {{ metric.label }}
            </p>
            <UBadge
              :label="metric.tone"
              size="xs"
              variant="subtle"
              :color="metric.tone === 'critical' ? 'error' : metric.tone === 'warning' ? 'warning' : 'neutral'"
            />
          </div>
          <p class="mt-3 text-2xl font-semibold">
            {{ metric.value.toLocaleString() }}
          </p>
          <p class="mt-2 text-xs text-dimmed">
            {{ metric.help }}
          </p>
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-lg border border-default bg-elevated p-4">
          <div class="mb-4 flex items-center gap-2">
            <UIcon
              name="i-lucide-shield-check"
              class="size-4 text-muted"
              aria-hidden="true"
            />
            <h2 class="font-medium">
              Trust tiers
            </h2>
          </div>

          <div
            v-if="!trustDistribution.length"
            class="text-sm text-muted"
          >
            Trust tier distribution will appear here once the integrity API exposes it.
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="item in trustDistribution"
              :key="item.label"
              class="space-y-1"
            >
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="break-all font-mono">{{ item.label }}</span>
                <span class="font-mono text-xs text-muted">{{ item.count.toLocaleString() }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${Math.max(2, (item.count / maxTrustCount) * 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated p-4">
          <div class="mb-4 flex items-center gap-2">
            <UIcon
              name="i-lucide-git-branch"
              class="size-4 text-muted"
              aria-hidden="true"
            />
            <h2 class="font-medium">
              Trust sources
            </h2>
          </div>

          <div
            v-if="!trustSourceDistribution.length"
            class="text-sm text-muted"
          >
            Trust source distribution will appear here once the integrity API exposes it.
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="item in trustSourceDistribution"
              :key="item.label"
              class="space-y-1"
            >
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="break-all font-mono">{{ item.label }}</span>
                <span class="font-mono text-xs text-muted">{{ item.count.toLocaleString() }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${Math.max(2, (item.count / maxTrustSourceCount) * 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated p-4">
          <div class="mb-4 flex items-center gap-2">
            <UIcon
              name="i-lucide-list-filter"
              class="size-4 text-muted"
              aria-hidden="true"
            />
            <h2 class="font-medium">
              Index reasons
            </h2>
          </div>

          <div
            v-if="!data.reasonDistribution.length"
            class="text-sm text-muted"
          >
            No indexability reasons recorded.
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="item in data.reasonDistribution"
              :key="item.label"
              class="space-y-1"
            >
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="break-all font-mono">{{ item.label }}</span>
                <span class="font-mono text-xs text-muted">{{ item.count.toLocaleString() }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${Math.max(2, (item.count / maxReasonCount) * 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated p-4">
          <div class="mb-4 flex items-center gap-2">
            <UIcon
              name="i-lucide-bar-chart-3"
              class="size-4 text-muted"
              aria-hidden="true"
            />
            <h2 class="font-medium">
              Score distribution
            </h2>
          </div>

          <div
            v-if="!data.scoreDistribution.length"
            class="text-sm text-muted"
          >
            No score distribution recorded.
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="item in data.scoreDistribution"
              :key="item.label"
              class="grid grid-cols-[3rem_1fr_5rem] items-center gap-3 text-sm"
            >
              <span class="font-mono">{{ item.label }}</span>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${Math.max(2, (item.count / maxScoreCount) * 100)}%` }"
                />
              </div>
              <span class="text-right font-mono text-xs text-muted">{{ item.count.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-lg border border-default bg-elevated p-4">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="filter in filters"
              :key="filter.value"
              :label="filter.label"
              size="sm"
              :variant="severityFilter === filter.value ? 'solid' : 'ghost'"
              :color="severityFilter === filter.value ? 'primary' : 'neutral'"
              @click="severityFilter = filter.value"
            />
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <UInput
              v-model="checkQuery"
              icon="i-lucide-search"
              placeholder="Filter checks or rows"
              size="sm"
              class="sm:w-64"
            />
            <div class="flex flex-wrap gap-2 text-xs">
              <UBadge
                :label="`${totals.critical} critical`"
                color="error"
                variant="subtle"
              />
              <UBadge
                :label="`${totals.warning} warning`"
                color="warning"
                variant="subtle"
              />
              <UBadge
                :label="`${totals.info} info`"
                color="neutral"
                variant="subtle"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div
          v-for="check in checks"
          :key="check.id"
          class="rounded-lg border border-default bg-elevated"
        >
          <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-medium">
                  {{ check.label }}
                </h2>
                <UBadge
                  :label="check.severity"
                  size="xs"
                  variant="subtle"
                  :color="severityColor[check.severity]"
                />
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ check.description }}
              </p>
            </div>
            <p class="font-mono text-xl">
              {{ check.count.toLocaleString() }}
            </p>
          </div>

          <div
            v-if="check.issues.length"
            class="border-t border-default"
          >
            <div
              v-for="issue in check.issues"
              :key="`${check.id}:${issue.slug}:${issue.detail}`"
              class="grid gap-2 border-b border-default px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(180px,280px)]"
            >
              <div class="min-w-0">
                <NuxtLink
                  v-if="issuePath(issue)"
                  :to="issuePath(issue)!"
                  class="font-mono text-primary hover:underline"
                >
                  {{ issue.owner }}/{{ issue.repo }}/{{ issue.name }}
                </NuxtLink>
                <p
                  v-else
                  class="font-mono"
                >
                  {{ issue.slug || 'unknown' }}
                </p>
                <p class="mt-1 text-muted">
                  {{ issue.detail }}
                </p>
              </div>
              <p class="break-words font-mono text-xs text-dimmed md:text-right">
                {{ issue.value ?? 'missing' }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
