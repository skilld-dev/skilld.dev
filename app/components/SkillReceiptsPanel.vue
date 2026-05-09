<script setup lang="ts">
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

interface SkillAudit {
  provider: string
  slug: string
  status: 'pass' | 'warn' | 'fail' | string
  summary?: string
  auditedAt?: string
  riskLevel?: string
}

interface MaturitySummary {
  cadence: 'active' | 'steady' | 'dormant'
  ageDays: number
  sinceUpdateDays: number
}

const {
  provenance,
  audits = [],
  verifiedSummary = null,
  maturity = null,
} = defineProps<{
  provenance: SkillProvenance
  audits?: SkillAudit[]
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

const now = useTimestamp({ interval: 60_000 })
const stale = computed(() => {
  if (!provenance.lastSyncedAt)
    return false
  const ageHours = (now.value / 1000 - provenance.lastSyncedAt) / 3600
  return ageHours > 24
})

const shortSha = computed(() =>
  provenance.sourceCommitSha ? provenance.sourceCommitSha.slice(0, 7) : null,
)

const AUDIT_META: Record<string, { icon: string, klass: string }> = {
  pass: { icon: 'i-lucide-shield-check', klass: 'text-emerald-500' },
  warn: { icon: 'i-lucide-shield-alert', klass: 'text-amber-500' },
  fail: { icon: 'i-lucide-shield-x', klass: 'text-rose-500' },
}
function auditMeta(a: SkillAudit) {
  return AUDIT_META[a.status] ?? AUDIT_META.fail!
}
function auditTitle(a: SkillAudit) {
  const parts = [`${a.provider}: ${a.summary || a.status}`]
  if (a.auditedAt)
    parts.push(`audited ${new Date(a.auditedAt).toLocaleDateString()}`)
  return parts.join(' · ')
}
function relativeDay(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1)
    return 'today'
  if (days === 1)
    return '1d'
  if (days < 30)
    return `${days}d`
  if (days < 365)
    return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

const MATURITY_META: Record<MaturitySummary['cadence'], { icon: string, label: string, hint: string, klass: string }> = {
  active: { icon: 'i-lucide-activity', label: 'Active', hint: 'Updated in the last 30 days', klass: 'text-emerald-500' },
  steady: { icon: 'i-lucide-minus', label: 'Steady', hint: 'Updated in the last 6 months', klass: 'text-muted' },
  dormant: { icon: 'i-lucide-moon', label: 'Dormant', hint: 'No updates in 6+ months', klass: 'text-amber-500' },
}

const hasStatus = computed(() => Boolean(maturity || verifiedSummary))
const hasProvenance = computed(() => Boolean(shortSha.value || modifiedDate.value))
const hasActions = computed(() => Boolean(provenance.skillFileUrl || provenance.historyUrl))
</script>

<template>
  <section
    id="receipts"
    aria-labelledby="receipts-heading"
    class="scroll-mt-20"
  >
    <div class="mb-3 flex items-baseline justify-between gap-2">
      <h2
        id="receipts-heading"
        class="section-label"
      >
        Trust
      </h2>
      <span
        v-if="lastSyncedDate"
        class="font-mono text-[10px] uppercase tracking-widest"
        :class="stale ? 'text-amber-500' : 'text-muted'"
        :title="lastSyncedDate.toLocaleString()"
      >
        Verified {{ lastSyncedAgo }}{{ stale ? ' · stale' : '' }}
      </span>
    </div>

    <div class="rounded-lg border border-default">
      <ul
        v-if="audits.length"
        class="divide-y divide-default"
      >
        <li
          v-for="a in audits"
          :key="a.slug"
          class="flex items-start gap-3 px-4 py-3"
        >
          <UIcon
            :name="auditMeta(a).icon"
            :class="auditMeta(a).klass"
            class="size-4 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-mono text-sm text-default">{{ a.provider }}</span>
              <span
                v-if="a.auditedAt"
                class="font-mono text-[10px] uppercase tracking-wide text-muted shrink-0"
              >{{ relativeDay(a.auditedAt) }}</span>
            </div>
            <p
              v-if="a.summary"
              class="mt-0.5 text-xs text-muted leading-snug line-clamp-2"
              :title="a.summary"
            >
              {{ a.summary }}
            </p>
          </div>
        </li>
      </ul>

      <div
        v-if="audits.length === 0"
        class="px-4 py-3 font-mono text-xs text-muted"
      >
        No third-party audits yet.
      </div>

      <div
        v-if="hasStatus || hasProvenance"
        class="border-t border-default px-4 py-3 font-mono text-xs"
      >
        <div
          v-if="hasStatus"
          class="flex flex-wrap items-center gap-x-3 gap-y-1.5"
        >
          <span
            v-if="maturity"
            class="inline-flex items-center gap-1.5 text-muted"
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
            class="inline-flex items-center gap-1.5 text-muted"
            title="Recent commits with verified signatures (GPG/SSH)"
          >
            <UIcon
              name="i-lucide-key-round"
              class="size-3.5 shrink-0"
              :class="verifiedSummary.verified === verifiedSummary.total ? 'text-emerald-500' : 'text-muted'"
              aria-hidden="true"
            />
            <span class="tabular-nums">{{ verifiedSummary.verified }}/{{ verifiedSummary.total }}</span> signed
          </span>
        </div>
        <div
          v-if="hasProvenance"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted"
          :class="hasStatus ? 'mt-2' : ''"
        >
          <a
            v-if="shortSha && provenance.sourceCommitUrl"
            :href="provenance.sourceCommitUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 hover:text-default transition-colors"
            :title="provenance.sourceCommitSha ?? ''"
          >
            <UIcon
              name="i-lucide-git-commit-horizontal"
              class="size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span class="text-default">{{ shortSha }}</span>
          </a>
          <span
            v-if="modifiedDate"
            class="tabular-nums"
            :title="modifiedDate.toLocaleString()"
          >· updated {{ modifiedAgo }}</span>
        </div>
      </div>

      <div
        v-if="hasActions"
        class="flex divide-x divide-default border-t border-default font-mono text-xs"
      >
        <a
          v-if="provenance.skillFileUrl"
          :href="provenance.skillFileUrl"
          target="_blank"
          rel="noopener"
          class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted hover:text-default hover:bg-elevated/40 transition-colors"
        >
          <UIcon
            name="i-lucide-file-text"
            class="size-3.5"
            aria-hidden="true"
          />
          SKILL.md
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-3"
            aria-hidden="true"
          />
        </a>
        <a
          v-if="provenance.historyUrl"
          :href="provenance.historyUrl"
          target="_blank"
          rel="noopener"
          class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-muted hover:text-default hover:bg-elevated/40 transition-colors"
        >
          <UIcon
            name="i-lucide-history"
            class="size-3.5"
            aria-hidden="true"
          />
          History
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-3"
            aria-hidden="true"
          />
        </a>
      </div>
    </div>
  </section>
</template>
