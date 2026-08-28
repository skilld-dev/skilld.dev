<script setup lang="ts">
import type { SkillBadgeEmbedInput, SkillBadgeTheme } from '~~/shared/skill-badge'
import { skillBadgeEmbed, skillBadgeImagePath } from '~~/shared/skill-badge'
import { repoHubPath } from '~~/shared/skill-routes'

const props = defineProps<Pick<SkillBadgeEmbedInput, 'owner' | 'repo' | 'name' | 'registryPath'>>()

const open = ref(false)
const showLabel = ref(true)
const showLikes = ref(false)
const previewTheme = ref<SkillBadgeTheme>('light')
const { copy, copied } = useClipboard()

const badgeInput = computed(() => ({
  owner: props.owner,
  repo: props.repo,
  name: props.name,
  registryPath: props.registryPath,
}))
const configuredInput = computed(() => ({
  ...badgeInput.value,
  showLabel: showLabel.value,
  showLikes: showLikes.value,
}))
const minimalInput = computed(() => ({ ...badgeInput.value, showLabel: false }))
const minimalLightImage = computed(() => skillBadgeImagePath(minimalInput.value, 'light'))
const minimalDarkImage = computed(() => skillBadgeImagePath(minimalInput.value, 'dark'))
const previewImage = computed(() => skillBadgeImagePath(configuredInput.value, previewTheme.value))
const previewWidth = computed(() => (showLabel.value ? 153 : 81) + (showLikes.value ? 46 : 0))
const targetLabel = computed(() => props.registryPath === repoHubPath(props.owner, props.repo)
  ? `${props.owner}/${props.repo}`
  : `${props.owner}/${props.repo}/${props.name}`)

function copyEmbed(): void {
  void copy(skillBadgeEmbed(configuredInput.value))
}
</script>

<template>
  <div class="inline-flex min-h-11 items-center gap-0.5">
    <span class="inline-flex h-[22px] shrink-0">
      <img
        :src="minimalLightImage"
        :alt="`README badge for ${targetLabel}`"
        width="81"
        height="22"
        loading="lazy"
        decoding="async"
        class="block h-[22px] w-[81px] dark:hidden"
        data-testid="minimal-badge-light"
      >
      <img
        :src="minimalDarkImage"
        alt=""
        width="81"
        height="22"
        loading="lazy"
        decoding="async"
        class="hidden h-[22px] w-[81px] dark:block"
        aria-hidden="true"
        data-testid="minimal-badge-dark"
      >
    </span>

    <UButton
      type="button"
      icon="i-lucide-pencil"
      size="xs"
      color="neutral"
      variant="ghost"
      class="min-h-11 min-w-11 justify-center"
      aria-label="Configure README badge"
      @click="open = true"
    />

    <UModal
      v-model:open="open"
      title="README badge"
      :description="targetLabel"
      :close="{ size: 'md', class: 'min-h-11 min-w-11 justify-center' }"
      :ui="{
        content: 'w-[calc(100vw-1.5rem)] max-w-lg rounded-lg border border-default bg-default shadow-none',
        header: 'px-5 py-5 sm:px-6',
        body: 'px-5 py-5 sm:px-6',
        footer: 'justify-end px-5 py-4 sm:px-6',
        title: 'font-mono text-base font-medium text-highlighted',
        description: 'truncate font-mono text-xs text-muted',
      }"
    >
      <template #body>
        <section aria-labelledby="badge-preview-heading">
          <div class="flex items-center justify-between gap-4">
            <h3 id="badge-preview-heading" class="section-label">
              Preview
            </h3>
          </div>
          <div class="mt-3 overflow-hidden rounded-lg border border-default">
            <div class="flex min-h-11 items-center justify-between gap-3 border-b border-default bg-default ps-3">
              <span class="data-label">{{ previewWidth }} × 22 px</span>
              <div class="flex" role="group" aria-label="Badge preview color">
                <UButton
                  type="button"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11 min-w-11 justify-center rounded-none"
                  aria-label="Preview light badge"
                  :aria-pressed="previewTheme === 'light'"
                  @click="previewTheme = 'light'"
                >
                  <span
                    class="size-3 rounded-sm border"
                    :class="previewTheme === 'light' ? 'border-primary ring-2 ring-primary/20' : 'border-default'"
                    style="background: #f6f8fa"
                    aria-hidden="true"
                  />
                </UButton>
                <UButton
                  type="button"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11 min-w-11 justify-center rounded-none"
                  aria-label="Preview dark badge"
                  :aria-pressed="previewTheme === 'dark'"
                  @click="previewTheme = 'dark'"
                >
                  <span
                    class="size-3 rounded-sm border"
                    :class="previewTheme === 'dark' ? 'border-primary ring-2 ring-primary/20' : 'border-default'"
                    style="background: #0d1117"
                    aria-hidden="true"
                  />
                </UButton>
              </div>
            </div>
            <div
              class="flex h-20 items-center justify-center p-4 transition-colors duration-200"
              :style="{ background: previewTheme === 'dark' ? '#0d1117' : '#f6f8fa' }"
            >
              <img
                :src="previewImage"
                :alt="`Preview of the README badge for ${targetLabel}`"
                :width="previewWidth"
                height="22"
                class="block h-[22px] max-w-full"
                data-testid="badge-preview"
              >
            </div>
          </div>
        </section>

        <div class="mt-5 divide-y divide-default border-y border-default">
          <fieldset class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
            <legend class="sr-only">
              Category
            </legend>
            <div>
              <p class="font-mono text-sm text-highlighted" aria-hidden="true">
                Category
              </p>
              <p class="mt-0.5 text-xs text-muted">
                Name the artifact before skilld.
              </p>
            </div>
            <div class="flex gap-1" role="group" aria-label="Badge category">
              <UButton
                type="button"
                label="Show"
                size="sm"
                color="neutral"
                :variant="showLabel ? 'soft' : 'ghost'"
                class="min-h-11"
                :aria-pressed="showLabel"
                @click="showLabel = true"
              />
              <UButton
                type="button"
                label="Hide"
                size="sm"
                color="neutral"
                :variant="showLabel ? 'ghost' : 'soft'"
                class="min-h-11"
                :aria-pressed="!showLabel"
                @click="showLabel = false"
              />
            </div>
          </fieldset>

          <fieldset class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
            <legend class="sr-only">
              Likes
            </legend>
            <div>
              <p class="font-mono text-sm text-highlighted" aria-hidden="true">
                Likes
              </p>
              <p class="mt-0.5 text-xs text-muted">
                Add the current skilld like count.
              </p>
            </div>
            <div class="flex gap-1" role="group" aria-label="Badge likes">
              <UButton
                type="button"
                label="Plain"
                size="sm"
                color="neutral"
                :variant="showLikes ? 'ghost' : 'soft'"
                class="min-h-11"
                :aria-pressed="!showLikes"
                @click="showLikes = false"
              />
              <UButton
                type="button"
                label="With likes"
                size="sm"
                color="neutral"
                :variant="showLikes ? 'soft' : 'ghost'"
                class="min-h-11"
                :aria-pressed="showLikes"
                @click="showLikes = true"
              />
            </div>
          </fieldset>
        </div>
      </template>

      <template #footer>
        <UButton
          type="button"
          :label="copied ? 'Badge copied' : 'Copy README badge'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="primary"
          variant="solid"
          class="min-h-11"
          :aria-label="copied ? 'README badge copied' : 'Copy README badge'"
          @click="copyEmbed"
        />
      </template>
    </UModal>
  </div>
</template>
