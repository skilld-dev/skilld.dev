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

const MATURITY_META: Record<MaturitySummary['cadence'], { icon: string, label: string, hint: string, klass: string }> = {
  active: { icon: 'i-lucide-activity', label: 'Active', hint: 'Updated in the last 30 days', klass: 'text-emerald-500' },
  steady: { icon: 'i-lucide-minus', label: 'Steady', hint: 'Updated in the last 6 months', klass: 'text-muted' },
  dormant: { icon: 'i-lucide-moon', label: 'Dormant', hint: 'No updates in 6+ months', klass: 'text-amber-500' },
}

const hasGlance = computed(() => Boolean(
  audits.length || verifiedSummary || maturity || lastSyncedDate.value,
))
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
      Trust
    </h2>

    <div class="rounded-lg border border-default p-4 sm:p-5">
      <div
        v-if="hasGlance"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs"
      >
        <span
          v-for="a in audits"
          :key="a.slug"
          class="inline-flex items-center gap-1 text-muted"
          :title="auditTitle(a)"
        >
          <UIcon
            :name="auditMeta(a).icon"
            class="size-3.5"
            :class="auditMeta(a).klass"
            aria-hidden="true"
          />
          {{ a.provider }}
        </span>
        <span
          v-if="verifiedSummary"
          class="inline-flex items-center gap-1 text-muted"
          :title="`Recent commits with verified signatures (GPG/SSH)`"
        >
          <UIcon
            name="i-lucide-key-round"
            class="size-3.5"
            :class="verifiedSummary.verified === verifiedSummary.total ? 'text-emerald-500' : 'text-muted'"
            aria-hidden="true"
          />
          <span class="tabular-nums">{{ verifiedSummary.verified }}/{{ verifiedSummary.total }}</span>
          signed
        </span>
        <span
          v-if="maturity"
          class="inline-flex items-center gap-1 text-muted"
          :title="MATURITY_META[maturity.cadence].hint"
        >
          <UIcon
            :name="MATURITY_META[maturity.cadence].icon"
            class="size-3.5"
            :class="MATURITY_META[maturity.cadence].klass"
            aria-hidden="true"
          />
          {{ MATURITY_META[maturity.cadence].label }}
        </span>
        <span
          v-if="lastSyncedDate"
          class="inline-flex items-center gap-1"
          :class="stale ? 'text-amber-500' : 'text-muted'"
          :title="lastSyncedDate.toLocaleString()"
        >
          <UIcon
            :name="stale ? 'i-lucide-clock-alert' : 'i-lucide-clock'"
            class="size-3.5"
            aria-hidden="true"
          />
          Verified {{ lastSyncedAgo }}{{ stale ? ' (stale)' : '' }}
        </span>
      </div>

      <div
        class="flex items-start gap-2"
        :class="hasGlance ? 'mt-4 border-t border-default pt-4' : ''"
      >
        <UIcon
          name="i-lucide-link"
          class="mt-0.5 size-4 shrink-0 text-muted"
          aria-hidden="true"
        />
        <p class="text-sm leading-relaxed">
          Indexed from
          <NuxtLink
            :to="`https://github.com/${provenance.owner}/${provenance.repo}`"
            target="_blank"
            rel="noopener"
            class="font-mono hover:text-default text-muted transition-colors"
          >
            github.com/{{ provenance.owner }}/{{ provenance.repo }}
          </NuxtLink>
          on branch
          <code class="font-mono text-muted">{{ provenance.branch }}</code>.
        </p>
      </div>

      <dl class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-if="shortSha && provenance.sourceCommitUrl"
          class="flex min-w-0 flex-col gap-0.5"
        >
          <dt class="data-label">
            Commit
          </dt>
          <dd class="m-0 min-w-0">
            <a
              :href="provenance.sourceCommitUrl"
              target="_blank"
              rel="noopener"
              class="block truncate font-mono text-sm hover:text-muted transition-colors"
              :title="provenance.sourceCommitSha ?? ''"
            >
              {{ shortSha }}
            </a>
          </dd>
        </div>

        <div
          v-if="provenance.skillPath && provenance.skillFileUrl"
          class="flex min-w-0 flex-col gap-0.5"
        >
          <dt class="data-label">
            SKILL.md
          </dt>
          <dd class="m-0 min-w-0">
            <a
              :href="provenance.skillFileUrl"
              target="_blank"
              rel="noopener"
              class="block break-words font-mono text-sm hover:text-muted transition-colors"
              :title="provenance.skillPath"
            >
              {{ provenance.skillPath }}
            </a>
          </dd>
        </div>

        <div
          v-if="modifiedDate"
          class="flex min-w-0 flex-col gap-0.5"
        >
          <dt class="data-label">
            Last modified
          </dt>
          <dd
            class="m-0 font-mono text-sm tabular-nums"
            :title="modifiedDate.toLocaleString()"
          >
            {{ modifiedAgo }}
          </dd>
        </div>

        <div
          v-if="provenance.referencesCount > 0"
          class="flex min-w-0 flex-col gap-0.5"
        >
          <dt class="data-label">
            References
          </dt>
          <dd class="m-0 font-mono text-sm tabular-nums">
            {{ provenance.referencesCount }} file{{ provenance.referencesCount === 1 ? '' : 's' }}
          </dd>
        </div>

        <div
          v-if="provenance.historyUrl"
          class="flex min-w-0 flex-col gap-0.5"
        >
          <dt class="data-label">
            History
          </dt>
          <dd class="m-0 min-w-0">
            <a
              :href="provenance.historyUrl"
              target="_blank"
              rel="noopener"
              class="font-mono text-sm hover:text-muted transition-colors"
            >
              View commits
            </a>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
