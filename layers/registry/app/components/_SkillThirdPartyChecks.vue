<script setup lang="ts">
import type { SkillAudit } from '~~/app/utils/skill-audit-overview'
import { resolveSkillAuditOverview } from '~~/app/utils/skill-audit-overview'

// Feature-local: SkillDetail is the only consumer. Sits last in the sidebar,
// below the people and the signing sentence, because these reports come from
// outside skilld and never stand in for reading the file.

const { audits = [] } = defineProps<{
  audits?: SkillAudit[]
}>()

const AUDIT_META: Record<string, { icon: string, klass: string }> = {
  pass: { icon: 'i-lucide-shield-check', klass: 'text-success' },
  warn: { icon: 'i-lucide-shield-alert', klass: 'text-warning' },
  fail: { icon: 'i-lucide-shield-x', klass: 'text-error' },
}
const FAIL_AUDIT_META = AUDIT_META.fail!

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
</script>

<template>
  <section
    id="third-party-checks"
    aria-labelledby="third-party-checks-heading"
    class="scroll-mt-20"
  >
    <h2
      id="third-party-checks-heading"
      class="section-label"
    >
      Third-party checks
    </h2>
    <p class="mt-1 mb-3 text-xs text-muted">
      Reports from outside skilld.
    </p>

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
              <span class="font-mono text-sm text-default">{{ auditOverview.label }}</span>
              <span
                v-if="auditOverview.latestAuditedAt"
                class="font-mono text-[10px] uppercase tracking-wide text-muted shrink-0"
              >{{ relativeDay(auditOverview.latestAuditedAt) }}</span>
            </span>
            <span class="mt-0.5 block text-xs text-muted leading-snug">
              {{ auditOverview.detail }}
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
        No third-party reports yet.
      </div>
    </div>
  </section>
</template>
