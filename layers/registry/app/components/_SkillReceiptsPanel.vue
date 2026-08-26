<script setup lang="ts">
import type { SkillAudit } from '~~/app/utils/skill-audit-overview'
import { resolveSkillAuditOverview } from '~~/app/utils/skill-audit-overview'

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
  pass: { icon: 'i-lucide-shield-check', klass: 'text-success' },
  warn: { icon: 'i-lucide-shield-alert', klass: 'text-warning' },
  fail: { icon: 'i-lucide-shield-x', klass: 'text-error' },
}
const FAIL_AUDIT_META = AUDIT_META.fail!

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

function auditMeta(a: SkillAudit) {
  return AUDIT_META[a.status] ?? FAIL_AUDIT_META
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

const auditOverview = computed(() => resolveSkillAuditOverview(audits))

const AUDIT_TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
} as const

const MATURITY_META: Record<MaturitySummary['cadence'], { icon: string, label: string, hint: string, klass: string }> = {
  active: { icon: 'i-lucide-activity', label: 'Active', hint: 'Updated in the last 30 days', klass: 'text-success' },
  steady: { icon: 'i-lucide-minus', label: 'Steady', hint: 'Updated in the last 6 months', klass: 'text-muted' },
  dormant: { icon: 'i-lucide-moon', label: 'Dormant', hint: 'No updates in 6+ months', klass: 'text-warning' },
}

const hasStatus = computed(() => Boolean(maturity || verifiedSummary))
const hasProvenance = computed(() => Boolean(shortSha.value || modifiedDate.value))
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
        :title="formatDateTitle(lastSyncedDate)"
      >
        Verified {{ lastSyncedAgo }}{{ stale ? ' · stale' : '' }}
      </span>
    </div>

    <div class="rounded-lg border border-default min-h-[3.5rem]">
      <details
        v-if="auditOverview"
        class="group"
      >
        <summary class="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors [&::-webkit-details-marker]:hidden">
          <UIcon
            :name="auditOverview.icon"
            :class="AUDIT_TONE_CLASS[auditOverview.tone]"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="block min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-2">
              <span class="font-mono text-sm text-default">Security checks</span>
              <span
                v-if="auditOverview.latestAuditedAt"
                class="font-mono text-[10px] uppercase tracking-wide text-muted shrink-0"
              >{{ relativeDay(auditOverview.latestAuditedAt) }}</span>
            </span>
            <span class="mt-0.5 block text-xs text-muted leading-snug">
              {{ auditOverview.label }} · {{ auditOverview.detail }}
            </span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
        </summary>

        <ul class="border-t border-default divide-y divide-default bg-muted/20">
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
      </details>

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
              :class="verifiedSummary.verified === verifiedSummary.total ? 'text-success' : 'text-muted'"
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
            :title="formatDateTitle(modifiedDate)"
          >· updated {{ modifiedAgo }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
