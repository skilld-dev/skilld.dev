<script setup lang="ts">
// This panel is feature-local because SkillDetail is its only consumer.

interface SkillProvenance {
  owner: string
  repo: string
  branch: string
  skillPath: string | null
  sourceCommitSha: string | null
  sourceCommitUrl: string | null
  skillFileUrl: string | null
  historyUrl: string | null
  modifiedAt: number | null
  referencesCount: number
  lastSyncedAt: number | null
  syncStatus: string | null
}

interface MaturitySummary {
  cadence: 'active' | 'steady' | 'dormant'
  ageDays: number
  sinceUpdateDays: number
}

const {
  provenance,
  verifiedSummary = null,
  maturity = null,
} = defineProps<{
  provenance: SkillProvenance
  verifiedSummary?: { verified: number, total: number } | null
  maturity?: MaturitySummary | null
}>()

const modifiedDate = computed(() =>
  provenance.modifiedAt ? new Date(provenance.modifiedAt * 1000) : null,
)
const modifiedAgo = useTimeAgo(computed(() => modifiedDate.value ?? new Date(0)))

const lastSyncedDate = computed(() =>
  provenance.lastSyncedAt ? new Date(provenance.lastSyncedAt * 1000) : null,
)
const lastSyncedAgo = useTimeAgo(computed(() => lastSyncedDate.value ?? new Date(0)))

const now = useTimestamp({ scheduler: cb => useIntervalFn(cb, 60_000) })
const stale = computed(() => {
  if (!provenance.lastSyncedAt)
    return false
  const ageHours = (now.value / 1000 - provenance.lastSyncedAt) / 3600
  return ageHours > 24
})

const shortSha = computed(() =>
  provenance.sourceCommitSha ? provenance.sourceCommitSha.slice(0, 7) : null,
)

// Plain words. Signing ties bytes to a commit; it says nothing about the
// instructions themselves, and the sentence says so.
const signedByLabel = computed(() =>
  shortSha.value ? `Signed by skilld at ${shortSha.value}.` : 'Signed by skilld.',
)

const DATETIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
  timeZoneName: 'short',
})

function formatDateTitle(value: Date): string {
  return DATETIME_FORMAT.format(value)
}

const MATURITY_META: Record<MaturitySummary['cadence'], { icon: string, label: string, hint: string, klass: string }> = {
  active: { icon: 'i-lucide-activity', label: 'Active', hint: 'Updated in the last 30 days', klass: 'text-success' },
  steady: { icon: 'i-lucide-minus', label: 'Steady', hint: 'Updated in the last 6 months', klass: 'text-muted' },
  dormant: { icon: 'i-lucide-moon', label: 'Dormant', hint: 'No updates in 6+ months', klass: 'text-warning' },
}

const hasStatus = computed(() => Boolean(maturity || verifiedSummary || modifiedDate.value))
</script>

<template>
  <section
    id="receipts"
    aria-labelledby="receipts-heading"
    class="scroll-mt-20"
  >
    <h2
      id="receipts-heading"
      class="section-label mb-3"
    >
      Provenance
    </h2>

    <div class="rounded-lg border border-default min-h-[3.5rem]">
      <div class="px-4 py-3">
        <p class="text-xs leading-snug text-default">
          <a
            v-if="shortSha && provenance.sourceCommitUrl"
            :href="provenance.sourceCommitUrl"
            target="_blank"
            rel="noopener"
            class="font-mono hover:underline underline-offset-2"
            :title="provenance.sourceCommitSha ?? ''"
          >{{ signedByLabel }}</a>
          <span
            v-else
            class="font-mono"
          >{{ signedByLabel }}</span>
          This ties the file your Agent reads to that commit on GitHub. It does not review the instructions.
        </p>
        <p
          v-if="lastSyncedDate"
          class="mt-2 font-mono text-[10px] uppercase tracking-widest"
          :class="stale ? 'text-amber-500' : 'text-muted'"
          :title="formatDateTitle(lastSyncedDate)"
        >
          Last checked against GitHub {{ lastSyncedAgo }}.
        </p>
      </div>

      <div
        v-if="hasStatus"
        class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-default px-4 py-3 font-mono text-xs text-muted"
      >
        <span
          v-if="maturity"
          class="inline-flex items-center gap-1.5"
          :title="MATURITY_META[maturity.cadence].hint"
        >
          <UIcon
            :name="MATURITY_META[maturity.cadence].icon"
            class="size-3.5 shrink-0"
            :class="MATURITY_META[maturity.cadence].klass"
            aria-hidden="true"
          />
          {{ MATURITY_META[maturity.cadence].label }}
        </span>
        <span
          v-if="verifiedSummary"
          class="inline-flex items-center gap-1.5"
          title="Recent commits with a GPG or SSH signature"
        >
          <UIcon
            name="i-lucide-key-round"
            class="size-3.5 shrink-0"
            :class="verifiedSummary.verified === verifiedSummary.total ? 'text-success' : 'text-muted'"
            aria-hidden="true"
          />
          <span class="tabular-nums">{{ verifiedSummary.verified }}/{{ verifiedSummary.total }}</span> signed commits
        </span>
        <span
          v-if="modifiedDate"
          class="tabular-nums"
          :title="formatDateTitle(modifiedDate)"
        >updated {{ modifiedAgo }}</span>
      </div>
    </div>
  </section>
</template>
