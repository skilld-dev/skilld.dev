<script setup lang="ts">
definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: 'Discovery holds (admin)',
  robots: 'noindex,nofollow',
})

interface Hold {
  id: number
  source: 'x' | 'hn' | 'bsky'
  owner: string
  repo: string
  heldReason: string | null
  skillCount: number | null
  evidenceScore: number
  mentionCount: number
  evidenceUrl: string
  evidenceText: string
  firstSeenAt: number
}

interface HoldsResponse {
  skillLimit: number
  holds: Hold[]
}

/**
 * The note is not pre-filled, on purpose.
 *
 * It is the evidence that a person judged this repository, and it is written
 * to `review_note` permanently. A default turns the minimum-length check into
 * a formality that always passes, and it records a claim the reviewer never
 * made. It read "Curated skills, worth indexing" on every row, including the
 * ones about to be rejected.
 */

const toast = useToast()
const notes = reactive<Record<number, string>>({})
const submitting = ref<number | null>(null)

const { data, status, error, refresh } = await useFetch<HoldsResponse>(
  '/api/admin/discovery-holds',
  {
    lazy: true,
    server: false,
  },
)

const holds = computed(() => data.value?.holds ?? [])
const skillLimit = computed(() => data.value?.skillLimit ?? 25)

const oversizedCount = computed(() =>
  holds.value.filter(hold => hold.heldReason === 'oversized').length,
)
const goneCount = computed(() =>
  holds.value.filter(hold => hold.heldReason === 'repo-gone').length,
)

watch(holds, (rows) => {
  for (const hold of rows)
    notes[hold.id] ??= ''
}, { immediate: true })

const sourceLabel: Record<Hold['source'], string> = {
  x: 'X',
  hn: 'Hacker News',
  bsky: 'Bluesky',
}

function heldLabel(hold: Hold): string {
  if (hold.heldReason === 'oversized')
    return `Over the ${skillLimit.value} skill limit`
  if (hold.heldReason === 'repo-gone')
    return 'Gone from GitHub'
  return hold.heldReason ?? 'Held'
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(timestamp * 1000)
}

async function decide(hold: Hold, decision: 'release' | 'reject') {
  const note = (notes[hold.id] ?? '').trim()
  if (note.length < 10) {
    toast.add({
      title: 'Note too short',
      description: 'Say why in at least 10 characters.',
      color: 'error',
    })
    return
  }

  submitting.value = hold.id
  const response = await $fetch<{ decision: string, id: number }>('/api/admin/discovery-holds', {
    method: 'POST',
    body: { id: hold.id, decision, note },
  })
    .then(result => ({ _tag: 'ok' as const, result }))
    .catch(cause => ({ _tag: 'error' as const, cause }))

  submitting.value = null
  if (response._tag === 'error') {
    toast.add({
      title: decision === 'release' ? 'Release failed' : 'Reject failed',
      description: response.cause instanceof Error ? response.cause.message : 'Try again.',
      color: 'error',
    })
    return
  }

  toast.add({
    title: decision === 'release' ? 'Hold released' : 'Discovery rejected',
    description: decision === 'release'
      ? `${hold.owner}/${hold.repo} is queued for the next submit run.`
      : `${hold.owner}/${hold.repo} will not be submitted again.`,
    color: 'success',
  })
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Discovery holds
        </h1>
        <p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Discovery parks a repository when it holds more than {{ skillLimit }} skills, or when GitHub no longer serves it.
          Release a repository to let the next submit run measure and index it.
        </p>
      </div>
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        class="min-h-11"
        @click="refresh()"
      />
    </header>

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-scale"
      title="Admission checklist"
      description="Release a repository when its skills are curated, generic, and written by the owner. Reject an aggregator dump. One dump can add many times the whole curated registry, which is the shape that suppressed the site in June 2026."
    />

    <div
      v-if="error"
      class="rounded-lg border border-error/30 bg-error/10 p-5"
      role="alert"
    >
      <p class="font-medium text-error">
        Could not load discovery holds.
      </p>
      <p class="mt-1 text-sm text-muted">
        {{ error.message || 'The admin API refused the request.' }}
      </p>
      <UButton
        label="Retry"
        color="neutral"
        variant="outline"
        class="mt-4 min-h-11"
        @click="refresh()"
      />
    </div>

    <div
      v-else-if="status === 'pending' && !data"
      class="space-y-3"
      role="status"
      aria-label="Loading discovery holds"
    >
      <USkeleton
        v-for="index in 3"
        :key="index"
        class="h-40 rounded-lg"
      />
    </div>

    <section v-else aria-labelledby="discovery-holds-heading">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="discovery-holds-heading" class="text-xl font-semibold">
            Waiting on a person
          </h2>
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge
            :label="`${oversizedCount} oversized`"
            color="warning"
            variant="subtle"
            size="xs"
          />
          <UBadge
            :label="`${goneCount} gone`"
            color="neutral"
            variant="subtle"
            size="xs"
          />
        </div>
      </div>

      <div
        v-if="holds.length === 0"
        class="mt-4 rounded-lg border border-default bg-elevated p-6"
        role="status"
      >
        <p class="font-medium">
          No parked discoveries
        </p>
        <p class="mt-1 text-sm text-muted">
          Every discovered repository cleared the size guard. New holds appear here as discovery measures them.
        </p>
      </div>

      <ul v-else class="mt-4 space-y-4">
        <li
          v-for="hold in holds"
          :key="hold.id"
          class="rounded-lg border border-default bg-default p-4 sm:p-5"
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <a
                :href="`https://github.com/${hold.owner}/${hold.repo}`"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center font-mono font-medium hover:text-primary"
              >
                {{ hold.owner }}/{{ hold.repo }}
                <UIcon name="i-lucide-external-link" class="ms-2 size-4" aria-hidden="true" />
              </a>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="heldLabel(hold)"
                  :color="hold.heldReason === 'oversized' ? 'warning' : 'neutral'"
                  variant="subtle"
                  size="xs"
                />
                <UBadge
                  :label="sourceLabel[hold.source]"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                />
              </div>
              <p class="mt-2 font-mono text-xs text-dimmed">
                Evidence {{ hold.evidenceScore.toLocaleString() }} on {{ sourceLabel[hold.source] }}
                · {{ hold.mentionCount.toLocaleString() }} {{ hold.mentionCount === 1 ? 'mention' : 'mentions' }}
                · first seen {{ formatDate(hold.firstSeenAt) }}
              </p>
            </div>

            <div class="shrink-0 rounded-md border border-default px-4 py-3 text-center sm:min-w-32">
              <p class="font-mono text-3xl tabular-nums">
                {{ hold.skillCount?.toLocaleString() ?? '—' }}
              </p>
              <p class="mt-1 font-mono text-xs uppercase tracking-widest text-muted">
                skills
              </p>
            </div>
          </div>

          <blockquote class="mt-4 border-s-2 border-default ps-3 text-sm leading-relaxed text-muted">
            {{ hold.evidenceText }}
          </blockquote>
          <a
            :href="hold.evidenceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 inline-flex min-h-11 items-center font-mono text-xs text-primary hover:underline"
          >
            Open the evidence
            <UIcon name="i-lucide-external-link" class="ms-1 size-3.5" aria-hidden="true" />
          </a>

          <p
            v-if="hold.heldReason === 'repo-gone'"
            class="mt-2 text-xs text-muted"
          >
            GitHub returned 404 when discovery measured this. Release it only if the repository came back.
          </p>

          <div class="mt-4 space-y-3">
            <UFormField
              :label="`Review note for ${hold.owner}/${hold.repo}`"
              :name="`note-${hold.id}`"
              :ui="{ label: 'sr-only' }"
            >
              <UTextarea
                v-model="notes[hold.id]"
                :rows="2"
                autoresize
                placeholder="Why this decision, in your words"
                class="w-full"
              />
            </UFormField>

            <div class="flex flex-wrap gap-2">
              <UButton
                label="Release"
                icon="i-lucide-check"
                :loading="submitting === hold.id"
                class="min-h-11"
                @click="() => decide(hold, 'release')"
              />
              <UButton
                label="Reject"
                icon="i-lucide-x"
                color="error"
                variant="outline"
                :disabled="submitting === hold.id"
                class="min-h-11"
                @click="() => decide(hold, 'reject')"
              />
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
