<script setup lang="ts">
import type { IndexedRepositorySkill, RepositoryIndexProgress } from '#shared/repository-index'

const { repositoryModalOpen, repositoryTask, submitRepository } = useSkillSearch()
const { isLiked, isPending } = useLikes()
const toast = useToast()

const repositoryLabel = computed(() => {
  const task = repositoryTask.value
  return task._tag === 'idle' ? '' : `${task.repository.owner}/${task.repository.repo}`
})

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
    return `Indexed ${task.skills.length} ${task.skills.length === 1 ? 'skill' : 'skills'}. ${likeStatusLabel(task.likes._tag)}.`
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
    return 'Liked automatically'
  if (status === 'partial')
    return 'Some likes could not be saved'
  return 'Sign in to use automatic likes'
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
  const task = repositoryTask.value
  if (task._tag === 'idle')
    return { owner: '', repo: '', name: skill.name }
  return { owner: task.repository.owner, repo: task.repository.repo, name: skill.name }
}

function skillLikeLabel(skill: IndexedRepositorySkill): string {
  const ref = skillRef(skill)
  if (isPending(ref))
    return 'Saving like'
  return isLiked(ref) ? 'Liked' : 'Not liked'
}

function skillPath(skill: IndexedRepositorySkill): string {
  const task = repositoryTask.value
  if (task._tag === 'idle')
    return '/skills'
  return repoSkillPath(task.repository.owner, task.repository.repo, skill.name)
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
      title: 'Repository indexed',
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
    :ui="{ content: 'w-[calc(100vw-1.5rem)] max-w-lg rounded-lg border border-default bg-default shadow-none' }"
  >
    <template #content>
      <div v-if="repositoryTask._tag !== 'idle'" class="relative flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header class="shrink-0 border-b border-default px-5 py-5 pe-14 sm:px-6">
          <p class="section-label">
            Repository indexing
          </p>
          <h2 class="mt-2 text-lg font-medium text-highlighted">
            <template v-if="repositoryTask._tag === 'indexing'">
              {{ progressLabel(repositoryTask.progress) }}
            </template>
            <template v-else-if="repositoryTask._tag === 'indexed'">
              Repository indexed
            </template>
            <template v-else>
              Indexing failed
            </template>
          </h2>
          <p class="mt-1 truncate font-mono text-sm text-muted">
            {{ repositoryLabel }}
          </p>
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
          <div v-if="repositoryTask._tag === 'indexing'">
            <UProgress
              :model-value="progressValue"
              :max="100"
              size="sm"
              aria-label="Repository indexing progress"
            />

            <ol class="mt-6 space-y-4" aria-label="Indexing stages">
              <li
                v-for="(label, index) in ['Queue work', 'Check GitHub', 'Index skills']"
                :key="label"
                class="flex min-h-8 items-center gap-3"
                :class="stepState(index) === 'upcoming' ? 'text-dimmed' : 'text-highlighted'"
              >
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full border"
                  :class="stepState(index) === 'current' ? 'border-primary text-primary' : 'border-default'"
                >
                  <UIcon
                    :name="stepIcon(index)"
                    class="size-4"
                    :class="stepState(index) === 'current' ? 'animate-spin motion-reduce:animate-none' : ''"
                    aria-hidden="true"
                  />
                </span>
                <span class="text-sm font-medium">{{ label }}</span>
                <span v-if="index === 2 && repositoryTask.progress._tag === 'indexing'" class="ms-auto font-mono text-xs text-muted">
                  {{ repositoryTask.progress.indexed }}/{{ repositoryTask.progress.total }}
                </span>
                <span class="sr-only">{{ stepState(index) }}</span>
              </li>
            </ol>

            <p class="mt-6 text-sm text-muted">
              You can close this dialog. Indexing continues in the background.
            </p>
          </div>

          <div v-else-if="repositoryTask._tag === 'indexed'">
            <div
              class="flex items-start gap-3 rounded-md border px-4 py-3"
              :class="repositoryTask.likes._tag === 'partial' ? 'border-warning/40 bg-warning/5' : 'border-default bg-muted/40'"
            >
              <UIcon
                :name="repositoryTask.likes._tag === 'partial' ? 'i-lucide-circle-alert' : repositoryTask.likes._tag === 'anonymous' ? 'i-lucide-heart' : 'i-lucide-heart'"
                class="mt-0.5 size-5 shrink-0"
                :class="repositoryTask.likes._tag === 'liked' || repositoryTask.likes._tag === 'pending' ? 'fill-primary text-primary' : repositoryTask.likes._tag === 'partial' ? 'text-warning' : 'text-muted'"
                aria-hidden="true"
              />
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ likeStatusLabel(repositoryTask.likes._tag) }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  <template v-if="repositoryTask.likes._tag === 'pending'">
                    Every indexed skill will appear in your likes.
                  </template>
                  <template v-else-if="repositoryTask.likes._tag === 'liked'">
                    Every indexed skill now appears in your likes.
                  </template>
                  <template v-else-if="repositoryTask.likes._tag === 'partial'">
                    {{ repositoryTask.likes.failed.length }} {{ repositoryTask.likes.failed.length === 1 ? 'like needs' : 'likes need' }} another attempt.
                  </template>
                  <template v-else>
                    The skills are ready in search.
                  </template>
                </p>
              </div>
            </div>

            <ul class="mt-5 divide-y divide-default border-y border-default" aria-label="Indexed skills">
              <li v-for="skill in repositoryTask.skills" :key="skill.name">
                <NuxtLink
                  :to="skillPath(skill)"
                  class="group flex min-h-14 items-center gap-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  @click="close"
                >
                  <span class="min-w-0 flex-1 truncate font-mono font-medium text-highlighted group-hover:text-primary">
                    {{ skill.name }}
                  </span>
                  <span class="flex shrink-0 items-center gap-2 text-xs" :class="isLiked(skillRef(skill)) ? 'text-primary' : 'text-muted'">
                    <span>{{ skillLikeLabel(skill) }}</span>
                    <UIcon
                      name="i-lucide-heart"
                      class="size-5"
                      :class="isLiked(skillRef(skill)) ? 'fill-primary' : ''"
                      aria-hidden="true"
                    />
                  </span>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" aria-hidden="true" />
                </NuxtLink>
              </li>
            </ul>
          </div>

          <div v-else class="py-2">
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
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            class="min-h-11 justify-center"
            @click="close"
          >
            Close
          </UButton>
          <UButton
            v-if="repositoryTask._tag === 'failed'"
            icon="i-lucide-refresh-cw"
            size="lg"
            class="min-h-11 justify-center"
            @click="retry"
          >
            Retry indexing
          </UButton>
          <UButton
            v-else-if="repositoryTask._tag === 'indexed'"
            :to="repoHubPath(repositoryTask.repository.owner, repositoryTask.repository.repo)"
            trailing-icon="i-lucide-arrow-right"
            size="lg"
            class="min-h-11 justify-center"
            @click="close"
          >
            Open repository
          </UButton>
        </footer>

        <p class="sr-only" aria-live="polite" aria-atomic="true">
          {{ liveMessage }}
        </p>
      </div>
    </template>
  </UModal>
</template>
