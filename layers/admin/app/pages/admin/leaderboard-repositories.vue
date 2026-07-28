<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: 'Repository reviews (admin)',
  robots: 'noindex,nofollow',
})

type ReviewStatus = 'eligible' | 'rejected'

interface ReviewCandidate {
  owner: string
  repo: string
  stars: number
  skillCount: number
  pushedAt: number | null
}

interface ReviewDecision {
  owner: string
  repo: string
  status: ReviewStatus
  reason: string
  reviewedBy: string
  reviewedAt: number
  visibility: 'visible' | 'pending'
}

interface StuckApproval {
  owner: string
  repo: string
  reason: string
  reviewedAt: number
}

interface ReviewQueueResponse {
  candidates: ReviewCandidate[]
  decisions: ReviewDecision[]
  stuckApprovals: StuckApproval[]
}

const reviewSchema = z.object({
  status: z.enum(['eligible', 'rejected']),
  reason: z.string().trim().min(20, 'Give a review reason of at least 20 characters.').max(300),
})
type ReviewForm = z.output<typeof reviewSchema>

const toast = useToast()
const formState = reactive<Record<string, ReviewForm>>({})
const submitting = ref<string | null>(null)

const { data, status, error, refresh } = await useFetch<ReviewQueueResponse>(
  '/api/admin/leaderboard-repositories',
  {
    lazy: true,
    server: false,
  },
)

const candidates = computed(() => data.value?.candidates ?? [])
const decisions = computed(() => data.value?.decisions ?? [])
const stuckApprovals = computed(() => data.value?.stuckApprovals ?? [])

watch(candidates, (rows) => {
  for (const candidate of rows) {
    const key = repositoryKey(candidate)
    formState[key] ??= {
      status: 'eligible',
      reason: 'Repository primarily distributes agent skills.',
    }
  }
}, { immediate: true })

function repositoryKey(repository: { owner: string, repo: string }): string {
  return `${repository.owner}/${repository.repo}`
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp * 1000)
}

async function saveReview(
  event: FormSubmitEvent<ReviewForm>,
  repository: { owner: string, repo: string },
) {
  const key = repositoryKey(repository)
  submitting.value = key
  const response = await $fetch<{
    result: 'eligible_visible' | 'eligible_sync_required' | 'rejected'
    prioritySyncQueued: boolean
  }>('/api/admin/leaderboard-repositories', {
    method: 'POST',
    body: {
      owner: repository.owner,
      repo: repository.repo,
      ...event.data,
    },
  }).then(result => ({ _tag: 'ok' as const, result })).catch(cause => ({ _tag: 'error' as const, cause }))

  submitting.value = null
  if (response._tag === 'error') {
    toast.add({
      title: 'Review failed',
      description: response.cause instanceof Error ? response.cause.message : 'Try again.',
      color: 'error',
    })
    return
  }

  toast.add({
    title: event.data.status === 'eligible' ? 'Repository approved' : 'Repository rejected',
    description: response.result.prioritySyncQueued
      ? 'Priority inventory sync queued.'
      : 'Leaderboard decision saved.',
    color: 'success',
  })
  await refresh()
}

async function retryQueue(decision: ReviewDecision) {
  await saveReview({
    data: {
      status: 'eligible',
      reason: decision.reason,
    },
  } as FormSubmitEvent<ReviewForm>, decision)
}
</script>

<template>
  <div class="space-y-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Repository reviews
        </h1>
        <p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Admit repositories whose primary purpose is distributing agent skills or plugin bundles.
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
      v-if="stuckApprovals.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-clock-alert"
      :title="`${stuckApprovals.length} approved ${stuckApprovals.length === 1 ? 'repository is' : 'repositories are'} still invisible`"
      description="These approvals have waited over 15 minutes for active skill inventory."
    />

    <div
      v-if="status === 'pending' && !data"
      class="space-y-3"
      role="status"
      aria-label="Loading repository review queue"
    >
      <USkeleton v-for="index in 3" :key="index" class="h-64 rounded-lg" />
    </div>

    <div
      v-else-if="error"
      class="rounded-lg border border-error/30 bg-error/10 p-5"
      role="alert"
    >
      <p class="font-medium text-error">
        Could not load the review queue.
      </p>
      <UButton
        label="Retry queue"
        color="neutral"
        variant="outline"
        class="mt-4 min-h-11"
        @click="refresh()"
      />
    </div>

    <section v-else aria-labelledby="pending-reviews-heading">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="font-mono text-xs uppercase tracking-wider text-muted">
            Pending
          </p>
          <h2 id="pending-reviews-heading" class="mt-2 text-xl font-semibold">
            Inventory candidates
          </h2>
        </div>
        <span class="font-mono text-xs text-muted">{{ candidates.length }} waiting</span>
      </div>

      <div
        v-if="candidates.length === 0"
        class="mt-4 rounded-lg border border-default bg-muted p-6"
        role="status"
      >
        <p class="font-medium">
          No repositories waiting for review
        </p>
        <p class="mt-1 text-sm text-muted">
          New multi-skill repositories appear here after inventory sync.
        </p>
      </div>

      <ul v-else class="mt-4 space-y-4">
        <li
          v-for="candidate in candidates"
          :key="repositoryKey(candidate)"
          class="rounded-lg border border-default bg-default p-4 sm:p-5"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <a
                :href="`https://github.com/${candidate.owner}/${candidate.repo}`"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center font-mono font-medium hover:text-primary"
              >
                {{ candidate.owner }}/{{ candidate.repo }}
                <UIcon name="i-lucide-external-link" class="ms-2 size-4" aria-hidden="true" />
              </a>
              <p class="text-sm text-muted">
                {{ candidate.skillCount }} skills, {{ candidate.stars.toLocaleString() }} stars
              </p>
            </div>
          </div>

          <UForm
            :schema="reviewSchema"
            :state="formState[repositoryKey(candidate)]"
            class="mt-5 space-y-4"
            @submit="saveReview($event, candidate)"
          >
            <UFormField label="Review reason" name="reason" required>
              <UTextarea
                v-model="formState[repositoryKey(candidate)]!.reason"
                :rows="3"
                autoresize
                class="w-full"
              />
            </UFormField>

            <fieldset>
              <legend class="mb-2 text-sm font-medium text-default">
                Decision
              </legend>
              <div class="flex flex-wrap gap-2">
                <UButton
                  label="Eligible"
                  icon="i-lucide-check"
                  :variant="formState[repositoryKey(candidate)]!.status === 'eligible' ? 'solid' : 'outline'"
                  :color="formState[repositoryKey(candidate)]!.status === 'eligible' ? 'primary' : 'neutral'"
                  class="min-h-11"
                  @click="formState[repositoryKey(candidate)]!.status = 'eligible'"
                />
                <UButton
                  label="Reject"
                  icon="i-lucide-x"
                  :variant="formState[repositoryKey(candidate)]!.status === 'rejected' ? 'solid' : 'outline'"
                  :color="formState[repositoryKey(candidate)]!.status === 'rejected' ? 'error' : 'neutral'"
                  class="min-h-11"
                  @click="formState[repositoryKey(candidate)]!.status = 'rejected'"
                />
              </div>
            </fieldset>

            <UButton
              type="submit"
              label="Save review"
              :loading="submitting === repositoryKey(candidate)"
              class="min-h-11"
            />
          </UForm>
        </li>
      </ul>
    </section>

    <section aria-labelledby="recent-decisions-heading">
      <h2 id="recent-decisions-heading" class="text-xl font-semibold">
        Recent decisions
      </h2>
      <div class="mt-4 overflow-x-auto rounded-lg border border-default">
        <table class="w-full min-w-3xl border-collapse text-start text-sm">
          <thead class="bg-muted text-xs text-muted">
            <tr>
              <th scope="col" class="px-4 py-3 text-start font-medium">
                Repository
              </th>
              <th scope="col" class="px-4 py-3 text-start font-medium">
                Decision
              </th>
              <th scope="col" class="px-4 py-3 text-start font-medium">
                Visibility
              </th>
              <th scope="col" class="px-4 py-3 text-start font-medium">
                Reviewed
              </th>
              <th scope="col" class="px-4 py-3 text-end font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="decision in decisions"
              :key="repositoryKey(decision)"
              class="border-t border-default"
            >
              <td class="px-4 py-3 font-mono">
                {{ decision.owner }}/{{ decision.repo }}
              </td>
              <td class="px-4 py-3">
                {{ decision.status }}
              </td>
              <td class="px-4 py-3">
                {{ decision.visibility }}
              </td>
              <td class="px-4 py-3 text-muted">
                {{ formatDate(decision.reviewedAt) }}
              </td>
              <td class="px-4 py-3 text-end">
                <UButton
                  v-if="decision.status === 'eligible' && decision.visibility === 'pending'"
                  label="Retry queue"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :loading="submitting === repositoryKey(decision)"
                  class="min-h-11"
                  @click="retryQueue(decision)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
