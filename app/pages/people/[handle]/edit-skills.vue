<script setup lang="ts">
import type { CollectionSkill } from '../../../../server/utils/atproto/lexicons/collection'
import type { SitemapSkill } from '../../../../server/utils/skills-sitemap'
import { Reorder } from 'motion-v'
import { PERSONAL_COLLECTION_SLUG } from '~/composables/useOnboarding'

const route = useRoute()
const handle = computed(() => route.params.handle as string)

const { user, isAuthenticated } = useAuth()
const isOwnProfile = computed(() => isAuthenticated.value && user.value?.handle === handle.value)

const { personalCollection } = useOnboarding()
const { publish, publishing, error: mutationError } = useCollectionMutations()
const { copy: copyInstall } = useClipboard({ source: computed(() => `skilld add @${handle.value}`) })

// Editable skills state
const skills = ref<CollectionSkill[]>(
  personalCollection.value?.record.skills.map(s => ({ ...s })) ?? [],
)

// Sync from server data when it loads
watch(personalCollection, (pc) => {
  if (pc && !skills.value.length)
    skills.value = pc.record.skills.map(s => ({ ...s }))
})

// Autocomplete
const searchQuery = ref('')
const debouncedQuery = refDebounced(searchQuery, 200)
const showSuggestions = ref(false)

const { data: suggestions } = useFetch<{ items: SitemapSkill[] }>('/api/skills', {
  query: { q: debouncedQuery, limit: 8 },
  watch: [debouncedQuery],
  immediate: false,
  server: false,
})

const filteredSuggestions = computed(() => {
  if (!suggestions.value?.items.length)
    return []
  const existing = new Set(skills.value.map(s => s.packageName))
  return suggestions.value.items.filter(s => !existing.has(s.name))
})

function selectSuggestion(skill: SitemapSkill) {
  if (!skills.value.some(s => s.packageName === skill.name)) {
    skills.value.push({ packageName: skill.name })
  }
  searchQuery.value = ''
  showSuggestions.value = false
  nextTick(() => document.getElementById('skill-search-input')?.focus())
}

function addManualSkill() {
  const pkg = searchQuery.value.trim()
  if (!pkg)
    return
  if (skills.value.some(s => s.packageName === pkg))
    return
  skills.value.push({ packageName: pkg })
  searchQuery.value = ''
}

function removeSkill(index: number) {
  skills.value.splice(index, 1)
}

function updateReason(index: number, reason: string) {
  skills.value[index]!.reason = reason || undefined
}

// Editing reason inline
const editingReason = ref<number | null>(null)
const reasonInput = ref('')

function startEditReason(index: number) {
  editingReason.value = index
  reasonInput.value = skills.value[index]!.reason ?? ''
  nextTick(() => {
    const el = document.getElementById(`reason-input-${index}`)
    el?.focus()
  })
}

function commitReason(index: number) {
  updateReason(index, reasonInput.value.trim())
  editingReason.value = null
}

const hasChanges = computed(() => {
  const existing = personalCollection.value?.record.skills ?? []
  if (existing.length !== skills.value.length)
    return true
  return existing.some((s, i) =>
    s.packageName !== skills.value[i]?.packageName
    || (s.reason ?? '') !== (skills.value[i]?.reason ?? ''),
  )
})

const justPublished = ref(false)

async function handlePublish() {
  if (!skills.value.length)
    return

  await publish({
    name: 'My Skills',
    slug: PERSONAL_COLLECTION_SLUG,
    description: `Skills curated by @${handle.value}`,
    skills: skills.value,
    stacks: personalCollection.value?.record.stacks ?? [],
  })

  justPublished.value = true
  setTimeout(() => {
    justPublished.value = false
  }, 6000)
}

// Import from CLI
const importToken = ref('')
const importing = ref(false)
const importError = ref('')

async function handleImport() {
  if (!importToken.value.trim())
    return
  importing.value = true
  importError.value = ''
  $fetch<{ skills: string[] }>(`/api/collections/import/${importToken.value.trim()}`)
    .then((data) => {
      const existing = new Set(skills.value.map(s => s.packageName))
      for (const name of data.skills) {
        if (!existing.has(name)) {
          skills.value.push({ packageName: name })
          existing.add(name)
        }
      }
      importToken.value = ''
    })
    .catch((err: Error) => {
      importError.value = err.message || 'Failed to import skills'
    })
    .finally(() => { importing.value = false })
}

useSeoMeta({
  title: `Edit skills · @${handle.value}`,
})
</script>

<template>
  <div>
    <section class="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-8 md:pt-16">
      <!-- Auth guard -->
      <div
        v-if="!isAuthenticated || !isOwnProfile"
        class="py-12 text-center"
      >
        <UIcon
          name="i-lucide-lock"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <h1 class="sr-only">
          Edit skills
        </h1>
        <p class="mt-3 text-sm">
          Sign in with Bluesky to edit your skills.
        </p>
        <UButton
          to="/"
          label="Back to home"
          variant="outline"
          color="neutral"
          size="sm"
          class="mt-4"
        />
      </div>

      <template v-else>
        <div class="mb-8">
          <h1 class="font-mono text-xl font-medium">
            Your skills
          </h1>
          <p class="mt-1 text-sm text-muted leading-relaxed">
            The tools you reach for every day. Add a note about why each one matters to you.
          </p>
        </div>

        <InlineTip id="edit-skills-intro">
          Skills resolve by npm package name. Your collection publishes to your Personal Data Server, where you control the data.
        </InlineTip>

        <!-- Success banner -->
        <div
          v-if="justPublished"
          class="mt-4 flex items-center gap-3 rounded-lg border border-default p-3"
          role="status"
        >
          <UIcon
            name="i-lucide-check-circle"
            class="size-5 text-[var(--ui-color-primary-500)]"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              Skills published.
            </p>
            <p class="text-xs text-muted">
              Anyone can now run
              <code class="font-mono">skilld add @{{ handle }}</code>
              to get your setup.
            </p>
          </div>
        </div>

        <!-- Search and add skills -->
        <div class="relative mt-6">
          <label
            for="skill-search-input"
            class="sr-only"
          >Search skills</label>
          <div class="flex gap-2">
            <UInput
              id="skill-search-input"
              v-model="searchQuery"
              placeholder="Search skills (e.g. vue, nuxt, tailwindcss)"
              icon="i-lucide-search"
              class="flex-1 font-mono"
              @focus="showSuggestions = true"
              @keydown.enter.prevent="addManualSkill"
              @keydown.escape="showSuggestions = false"
            />
            <UButton
              label="Add"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="sm"
              @click="addManualSkill"
            />
          </div>

          <!-- Autocomplete dropdown -->
          <div
            v-if="showSuggestions && searchQuery.length >= 2 && filteredSuggestions.length"
            class="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-default bg-elevated shadow-sm"
          >
            <button
              v-for="suggestion in filteredSuggestions"
              :key="suggestion.slug"
              class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted"
              @mousedown.prevent="selectSuggestion(suggestion)"
            >
              <span class="font-mono text-sm">{{ suggestion.name }}</span>
              <span class="text-xs text-muted">{{ suggestion.owner }}{{ suggestion.repo !== 'skills' ? `/${suggestion.repo}` : '' }}</span>
            </button>
          </div>
        </div>

        <!-- Click outside to close suggestions -->
        <div
          v-if="showSuggestions"
          class="fixed inset-0 z-10"
          @click="showSuggestions = false"
        />

        <!-- Skills list: drag to reorder -->
        <div class="mt-6">
          <div
            v-if="!skills.length"
            class="rounded-lg border border-default p-6 text-center"
          >
            <p class="text-sm text-muted">
              No skills yet. Search above or type a package name and press Enter.
            </p>
          </div>

          <Reorder.Group
            v-else
            v-model:values="skills"
            axis="y"
            as="div"
            class="space-y-2"
          >
            <Reorder.Item
              v-for="(skill, i) in skills"
              :key="skill.packageName"
              :value="skill"
              as="div"
              class="group relative flex items-start gap-3 rounded-lg border border-default p-3 transition-colors duration-200 cursor-grab active:cursor-grabbing active:border-[var(--ui-text-muted)]"
              style="position: relative;"
            >
              <!-- Drag handle -->
              <UIcon
                name="i-lucide-grip-vertical"
                class="mt-0.5 size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-60"
                aria-hidden="true"
              />

              <div class="min-w-0 flex-1">
                <p class="font-mono text-sm font-medium">
                  {{ skill.packageName }}
                </p>

                <!-- Inline reason editor -->
                <div
                  v-if="editingReason === i"
                  class="mt-1"
                >
                  <input
                    :id="`reason-input-${i}`"
                    v-model="reasonInput"
                    class="w-full rounded border border-default bg-transparent px-2 py-1 text-xs text-muted outline-none focus:border-[var(--ui-text-muted)]"
                    placeholder="Why do you use this?"
                    @blur="commitReason(i)"
                    @keydown.enter.prevent="commitReason(i)"
                    @keydown.escape="editingReason = null"
                  >
                </div>
                <button
                  v-else-if="skill.reason"
                  class="mt-0.5 text-left text-xs text-muted leading-relaxed hover:text-default"
                  @click="startEditReason(i)"
                >
                  {{ skill.reason }}
                </button>
                <button
                  v-else
                  class="mt-0.5 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-default focus:opacity-100"
                  @click="startEditReason(i)"
                >
                  + add reason
                </button>
              </div>

              <button
                type="button"
                class="shrink-0 rounded-sm p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-default focus:opacity-100"
                :aria-label="`Remove ${skill.packageName}`"
                @click="removeSkill(i)"
              >
                <UIcon
                  name="i-lucide-x"
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
            </Reorder.Item>
          </Reorder.Group>

          <p
            v-if="skills.length"
            class="mt-2 text-xs text-muted"
          >
            Drag to reorder. Order matters: first skill = highest priority.
          </p>
        </div>

        <!-- Import from CLI -->
        <InlineTip
          id="cli-import"
          icon="i-lucide-terminal"
          class="mt-6"
        >
          Already using skilld? Run <code class="font-mono">npx skilld upload</code> to generate an import token, then paste it below to import your installed skills.
        </InlineTip>

        <details class="mt-4 rounded-lg border border-default">
          <summary class="cursor-pointer px-4 py-3 text-sm font-mono select-none">
            Import from CLI
          </summary>
          <div class="border-t border-default px-4 py-3 space-y-3">
            <div class="flex gap-2">
              <UInput
                v-model="importToken"
                placeholder="Paste import token"
                class="flex-1 font-mono"
                @keydown.enter.prevent="handleImport"
              />
              <UButton
                label="Import"
                icon="i-lucide-download"
                color="neutral"
                variant="outline"
                size="sm"
                :loading="importing"
                @click="handleImport"
              />
            </div>
            <p
              v-if="importError"
              class="text-xs text-[var(--ui-color-primary-500)]"
            >
              {{ importError }}
            </p>
            <p class="text-xs text-muted leading-relaxed">
              Skills from your CLI will be added to the list above. You can reorder them and add reasons before publishing.
            </p>
          </div>
        </details>

        <!-- Error display -->
        <div
          v-if="mutationError"
          role="alert"
          class="mt-4 rounded-lg border border-default bg-muted p-3"
        >
          <p class="text-sm text-default">
            {{ mutationError }}
          </p>
        </div>

        <!-- Publish -->
        <div class="mt-8 flex items-center gap-3">
          <UButton
            :label="personalCollection ? 'Update skills' : 'Publish your skills'"
            icon="i-lucide-upload"
            :loading="publishing"
            :disabled="!skills.length || (!hasChanges && !!personalCollection)"
            @click="handlePublish"
          />
          <p class="text-xs text-muted">
            Stored on your Personal Data Server.
          </p>
        </div>

        <!-- Install command preview -->
        <div
          v-if="skills.length"
          class="mt-6 rounded-lg border border-default p-3"
        >
          <p class="section-label mb-2">
            Install command
          </p>
          <div class="flex items-center gap-2">
            <code class="flex-1 font-mono text-sm">skilld add @{{ handle }}</code>
            <UButton
              icon="i-lucide-clipboard"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Copy install command"
              @click="copyInstall()"
            />
          </div>
        </div>
      </template>
    </section>
  </div>
</template>
