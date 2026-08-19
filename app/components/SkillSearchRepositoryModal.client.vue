<script setup lang="ts">
import type { IndexedRepositorySkill, RepositoryIndexProgress } from '#shared/repository-index'
import type { RepoSourceProfile } from '../../layers/registry/server/api/repos/[owner]/[repo].get'

type RepositoryPreviewState
  = | { _tag: 'idle' }
    | { _tag: 'loading' }
    | { _tag: 'ready', data: RepoSourceProfile }
    | { _tag: 'unavailable' }

const { repositoryModalOpen, repositoryTask, submitRepository } = useSkillSearch()
const { isLiked, isPending, likeCount } = useLikes()
const toast = useToast()

const repositoryLabel = computed(() => {
  const task = repositoryTask.value
  return task._tag === 'idle' ? '' : `${task.repository.owner}/${task.repository.repo}`
})

const repositoryOwner = computed(() => {
  const task = repositoryTask.value
  return task._tag === 'idle' ? '' : task.repository.owner
})

const repositoryName = computed(() => {
  const task = repositoryTask.value
  return task._tag === 'idle' ? '' : task.repository.repo
})

const repositoryPreview = shallowRef<RepositoryPreviewState>({ _tag: 'idle' })
let previewAttempt = 0

watch(repositoryLabel, (label) => {
  const attempt = ++previewAttempt
  const task = repositoryTask.value
  if (!label || task._tag === 'idle') {
    repositoryPreview.value = { _tag: 'idle' }
    return
  }

  repositoryPreview.value = { _tag: 'loading' }
  void $fetch<RepoSourceProfile>(`/api/repos/${encodeURIComponent(task.repository.owner)}/${encodeURIComponent(task.repository.repo)}`)
    .then((data) => {
      if (attempt === previewAttempt)
        repositoryPreview.value = { _tag: 'ready', data }
    })
    .catch((error) => {
      console.warn(`[repository-preview] ${error instanceof Error ? error.message : String(error)}`)
      if (attempt === previewAttempt)
        repositoryPreview.value = { _tag: 'unavailable' }
    })
}, { immediate: true })

const progressStep = computed(() => {
  const task = repositoryTask.value
  if (task._tag !== 'indexing')
    return 0
  if (task.progress._tag === 'checking')
    return 1
  if (task.progress._tag === 'indexing')
    return 2
  return 0
})

const progressValue = computed(() => {
  const task = repositoryTask.value
  if (task._tag !== 'indexing' || task.progress._tag !== 'indexing' || !task.progress.total)
    return null
  return task.progress.indexed / task.progress.total * 100
})

const liveMessage = computed(() => {
  const task = repositoryTask.value
  if (task._tag === 'indexing')
    return progressLabel(task.progress)
  if (task._tag === 'indexed')
    return `${task.skills.length} ${task.skills.length === 1 ? 'skill is' : 'skills are'} ready in search. ${likeStatusLabel(task.likes._tag)}.`
  if (task._tag === 'failed')
    return `Indexing failed. ${task.reason}`
  return ''
})

function progressLabel(progress: RepositoryIndexProgress): string {
  if (progress._tag === 'queued')
    return 'Queued for indexing'
  if (progress._tag === 'checking')
    return 'Checking GitHub'
  return `Indexing ${progress.indexed} of ${progress.total} skill files`
}

function likeStatusLabel(status: 'pending' | 'anonymous' | 'liked' | 'partial'): string {
  if (status === 'pending')
    return 'Saving your likes'
  if (status === 'liked')
    return 'Added to your likes'
  if (status === 'partial')
    return 'Some likes could not be saved'
  return 'Skills are ready to like'
}

function stepState(index: number): 'complete' | 'current' | 'upcoming' {
  if (index < progressStep.value)
    return 'complete'
  return index === progressStep.value ? 'current' : 'upcoming'
}

function stepIcon(index: number): string {
  const state = stepState(index)
  if (state === 'complete')
    return 'i-lucide-check'
  if (state === 'current')
    return 'i-lucide-loader-circle'
  return 'i-lucide-circle'
}

function skillRef(skill: IndexedRepositorySkill) {
  return { owner: repositoryOwner.value, repo: repositoryName.value, name: skill.name }
}

function displayedLikeCount(skill: IndexedRepositorySkill): number {
  return likeCount(skillRef(skill)) ?? skill.likeCount
}

function skillLikeLabel(skill: IndexedRepositorySkill): string {
  const count = displayedLikeCount(skill)
  if (isPending(skillRef(skill)))
    return `Saving like. ${count} ${count === 1 ? 'like' : 'likes'}`
  if (isLiked(skillRef(skill)))
    return `Liked by you. ${count} ${count === 1 ? 'like' : 'likes'}`
  return `${count} ${count === 1 ? 'like' : 'likes'}`
}

function skillPath(skill: IndexedRepositorySkill): string {
  return repoSkillPath(repositoryOwner.value, repositoryName.value, skill.name)
}

function sourceFileUrl(path: string): string {
  const preview = repositoryPreview.value
  if (preview._tag !== 'ready')
    return '#'
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `${preview.data.githubUrl}/blob/${encodeURIComponent(preview.data.defaultBranch)}/${encodedPath}`
}

function close(): void {
  repositoryModalOpen.value = false
}

function retry(): void {
  const task = repositoryTask.value
  if (task._tag === 'failed')
    void submitRepository(task.repository)
}

watch(repositoryTask, (task, previous) => {
  if (repositoryModalOpen.value || previous?._tag !== 'indexing')
    return
  if (task._tag === 'indexed') {
    toast.add({
      title: 'Repository ready',
      description: `${task.skills.length} ${task.skills.length === 1 ? 'skill is' : 'skills are'} ready in search.`,
      color: 'success',
      icon: 'i-lucide-circle-check',
      actions: [{ label: 'View', color: 'neutral', variant: 'outline', onClick: () => { repositoryModalOpen.value = true } }],
    })
  }
  if (task._tag === 'failed') {
    toast.add({
      title: 'Indexing failed',
      description: task.reason,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: [{ label: 'Retry', color: 'neutral', variant: 'outline', onClick: retry }],
    })
  }
})
</script>

<template>
  <UModal
    v-model:open="repositoryModalOpen"
    aria-label="Repository indexing"
    scrollable
    :ui="{ content: 'w-[calc(100vw-1.5rem)] max-w-xl rounded-lg border border-default bg-default shadow-none' }"
  >
    <template #content>
      <div v-if="repositoryTask._tag !== 'idle'" class="relative flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header class="flex shrink-0 items-start gap-3 border-b border-default px-5 py-5 pe-14 sm:px-6">
          <NuxtLink
            :to="ownerHubPath(repositoryOwner)"
            class="shrink-0 rounded-full"
            :aria-label="`${repositoryOwner} profile`"
            @click="close"
          >
            <img
              :src="`https://github.com/${repositoryOwner}.png?size=96`"
              :alt="`${repositoryOwner} avatar`"
              width="48"
              height="48"
              class="size-12 rounded-full border border-default bg-muted"
            >
          </NuxtLink>
          <div class="min-w-0 flex-1">
            <h2 id="repository-indexing-heading" class="break-words font-mono text-base font-medium text-highlighted sm:text-lg">
              <NuxtLink
                v-if="repositoryTask._tag === 'indexed'"
                :to="repoHubPath(repositoryOwner, repositoryName)"
                class="hover:text-primary"
                @click="close"
              >
                {{ repositoryName }}
              </NuxtLink>
              <template v-else>
                {{ repositoryName }}
              </template>
            </h2>
            <NuxtLink
              :to="ownerHubPath(repositoryOwner)"
              class="mt-0.5 inline-flex min-h-6 items-center font-mono text-xs text-muted hover:text-primary"
              @click="close"
            >
              @{{ repositoryOwner }}
            </NuxtLink>
            <p class="data-label mt-1" aria-live="polite">
              {{ repositoryTask._tag === 'indexed' ? 'Repository ready' : repositoryTask._tag === 'failed' ? 'Repository failed' : 'Adding repository' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="md"
            class="absolute end-3 top-3 min-h-11 min-w-11 justify-center"
            aria-label="Close repository indexing"
            @click="close"
          />
        </header>

        <div class="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div v-if="repositoryPreview._tag === 'loading'" class="flex min-h-16 items-center gap-3 border-b border-default pb-5 text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Loading repository details
          </div>
          <div v-else-if="repositoryPreview._tag === 'ready'" class="border-b border-default pb-5">
            <p v-if="repositoryPreview.data.description" class="text-sm leading-relaxed text-muted">
              {{ repositoryPreview.data.description }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted">
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-file-code-2" class="size-3.5" aria-hidden="true" />
                <template v-if="repositoryPreview.data.skillFileScanStatus === 'unavailable'">
                  Indexing will check for SKILL.md files
                </template>
                <template v-else>
                  {{ repositoryPreview.data.skillFileCount }}{{ repositoryPreview.data.skillFileScanStatus === 'truncated' ? '+' : '' }} SKILL.md {{ repositoryPreview.data.skillFileCount === 1 ? 'file' : 'files' }}
                </template>
              </span>
              <a
                :href="repositoryPreview.data.githubUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-6 items-center gap-1.5 hover:text-primary"
              >
                GitHub
                <UIcon name="i-lucide-external-link" class="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <p v-else-if="repositoryPreview._tag === 'unavailable'" class="border-b border-default pb-5 text-sm text-muted">
            Repository details are unavailable. Indexing continues.
          </p>

          <div v-if="repositoryTask._tag === 'indexing'" class="pt-5">
            <div class="flex items-center justify-between gap-4">
              <h3 id="repository-progress-heading" class="text-sm font-medium text-highlighted">
                {{ progressLabel(repositoryTask.progress) }}
              </h3>
              <span v-if="repositoryTask.progress._tag === 'indexing'" class="font-mono text-xs text-muted">
                {{ repositoryTask.progress.indexed }}/{{ repositoryTask.progress.total }}
              </span>
            </div>
            <UProgress :model-value="progressValue" :max="100" size="sm" class="mt-3" aria-hidden="true" />
            <progress :value="progressValue ?? undefined" max="100" class="sr-only" aria-labelledby="repository-progress-heading" />

            <ol class="mt-5 grid grid-cols-3 gap-2" aria-label="Indexing stages">
              <li
                v-for="(label, index) in ['Queued', 'GitHub', 'Skills']"
                :key="label"
                class="flex min-w-0 items-center gap-2"
                :class="stepState(index) === 'upcoming' ? 'text-dimmed' : 'text-highlighted'"
              >
                <span class="flex size-6 shrink-0 items-center justify-center rounded-full border" :class="stepState(index) === 'current' ? 'border-primary text-primary' : 'border-default'">
                  <UIcon :name="stepIcon(index)" class="size-3.5" :class="stepState(index) === 'current' ? 'animate-spin motion-reduce:animate-none' : ''" aria-hidden="true" />
                </span>
                <span class="truncate text-xs font-medium">{{ label }}</span>
                <span class="sr-only">{{ stepState(index) }}</span>
              </li>
            </ol>

            <section v-if="repositoryPreview._tag === 'ready' && repositoryPreview.data.skillFiles.length" class="mt-6" aria-labelledby="repository-files-heading">
              <div class="flex items-center justify-between gap-4">
                <h3 id="repository-files-heading" class="section-label">
                  Skills found on GitHub
                </h3>
                <span class="font-mono text-xs tabular-nums text-muted">{{ repositoryPreview.data.skillFiles.length }}</span>
              </div>
              <ul class="mt-2 divide-y divide-default border-y border-default">
                <li v-for="path in repositoryPreview.data.skillFiles" :key="path">
                  <a
                    :href="sourceFileUrl(path)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="group flex min-h-11 items-center gap-3 py-2"
                  >
                    <UIcon name="i-lucide-file-code-2" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <code class="min-w-0 flex-1 truncate font-mono text-xs text-muted group-hover:text-primary">{{ path }}</code>
                    <UIcon name="i-lucide-external-link" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </section>

            <p class="mt-5 text-xs text-muted">
              You can close this dialog. Indexing continues in the background.
            </p>
          </div>

          <div v-else-if="repositoryTask._tag === 'indexed'" class="pt-5">
            <div class="flex items-center gap-2 text-sm text-highlighted">
              <UIcon name="i-lucide-circle-check" class="size-4 text-success" aria-hidden="true" />
              <p>
                {{ repositoryTask.skills.length }} {{ repositoryTask.skills.length === 1 ? 'skill is' : 'skills are' }} ready in search.
              </p>
            </div>

            <section class="mt-5" aria-labelledby="indexed-skills-heading">
              <div class="flex items-center justify-between gap-4">
                <h3 id="indexed-skills-heading" class="section-label">
                  Skills
                </h3>
                <span class="font-mono text-xs tabular-nums text-muted">{{ repositoryTask.skills.length }}</span>
              </div>
              <ul class="mt-2 divide-y divide-default border-y border-default">
                <li v-for="skill in repositoryTask.skills" :key="skill.name">
                  <NuxtLink
                    :to="skillPath(skill)"
                    class="group flex min-h-14 items-center gap-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    @click="close"
                  >
                    <UIcon name="i-lucide-file-code-2" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-mono font-medium text-highlighted group-hover:text-primary">{{ skill.name }}</span>
                      <code v-if="skill.path" class="mt-0.5 block truncate font-mono text-xs text-muted">{{ skill.path }}</code>
                    </span>
                    <span class="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums" :class="isLiked(skillRef(skill)) ? 'text-primary' : 'text-muted'" :aria-label="skillLikeLabel(skill)">
                      <UIcon
                        :name="isPending(skillRef(skill)) ? 'i-lucide-loader-circle' : 'i-lucide-heart'"
                        class="size-4"
                        :class="[
                          isLiked(skillRef(skill)) ? 'fill-current' : '',
                          isPending(skillRef(skill)) ? 'animate-spin motion-reduce:animate-none' : '',
                        ]"
                        aria-hidden="true"
                      />
                      <span aria-hidden="true">{{ displayedLikeCount(skill) }}</span>
                    </span>
                    <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
                  </NuxtLink>
                </li>
              </ul>
            </section>

            <p v-if="repositoryTask.likes._tag === 'partial'" class="mt-4 flex items-center gap-2 text-xs text-warning">
              <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" aria-hidden="true" />
              {{ repositoryTask.likes.failed.length }} {{ repositoryTask.likes.failed.length === 1 ? 'like needs' : 'likes need' }} another attempt.
            </p>
          </div>

          <div v-else class="pt-5">
            <div class="flex items-start gap-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
                <UIcon name="i-lucide-circle-alert" class="size-5" aria-hidden="true" />
              </span>
              <div>
                <p class="font-medium text-highlighted">
                  We could not index this repository
                </p>
                <p class="mt-1 text-sm text-muted">
                  {{ repositoryTask.reason }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer class="flex shrink-0 flex-col-reverse gap-2 border-t border-default px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <UButton color="neutral" variant="ghost" size="lg" class="min-h-11 justify-center" @click="close">
            Close
          </UButton>
          <UButton v-if="repositoryTask._tag === 'failed'" icon="i-lucide-refresh-cw" size="lg" class="min-h-11 justify-center" @click="retry">
            Retry indexing
          </UButton>
          <UButton
            v-else-if="repositoryTask._tag === 'indexed'"
            :to="repoHubPath(repositoryOwner, repositoryName)"
            trailing-icon="i-lucide-arrow-right"
            size="lg"
            class="min-h-11 justify-center"
            @click="close"
          >
            View repository
          </UButton>
        </footer>

        <p class="sr-only" aria-live="polite" aria-atomic="true">
          {{ liveMessage }}
        </p>
      </div>
    </template>
  </UModal>
</template>
