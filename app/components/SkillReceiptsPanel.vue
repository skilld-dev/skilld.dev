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

const { provenance } = defineProps<{
  provenance: SkillProvenance
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
      Receipts
    </h2>

    <div class="rounded-lg border border-default p-4 sm:p-5">
      <div class="flex items-start gap-2">
        <UIcon
          name="i-lucide-shield-check"
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

      <p
        v-if="lastSyncedDate"
        class="mt-4 flex items-center gap-1.5 font-mono text-xs"
        :class="stale ? 'text-amber-500' : 'text-muted'"
      >
        <UIcon
          v-if="stale"
          name="i-lucide-clock-alert"
          class="size-3.5"
          aria-hidden="true"
        />
        <span :title="lastSyncedDate.toLocaleString()">
          Verified {{ lastSyncedAgo }}{{ stale ? ' (stale)' : '' }}
        </span>
      </p>
    </div>
  </section>
</template>
