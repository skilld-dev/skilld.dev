<script setup lang="ts">
import type { CollectionSkill } from '../../../../server/utils/atproto/lexicons/collection'
import type { RegistrySkill } from '../../../../server/utils/skills-registry'
import { Reorder } from 'motion-v'
import { PERSONAL_COLLECTION_SLUG } from '~/composables/useOnboarding'

type SearchSkill = RegistrySkill & { official?: boolean }

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

const suggestions = ref<{ items: SearchSkill[] } | null>(null)

// Map of packageName -> { owner, repo, official } for selected skills resolved from search
const skillMeta = ref<Map<string, { owner: string, repo: string, official: boolean }>>(new Map())

// Hydrate metadata for skills loaded from PDS
async function hydrateSkillMeta(packageNames: string[]) {
  const missing = packageNames.filter(n => !skillMeta.value.has(n))
  if (!missing.length)
    return
  const results = await Promise.allSettled(
    missing.map(name =>
      $fetch<{ items: SearchSkill[] }>('/api/skills', { query: { q: name, limit: 1 } }),
    ),
  )
  for (let i = 0; i < missing.length; i++) {
    const r = results[i]!
    if (r.status !== 'fulfilled')
      continue
    const match = r.value.items.find(s => s.name === missing[i])
    if (match)
      skillMeta.value.set(missing[i]!, { owner: match.owner, repo: match.repo, official: !!match.official })
  }
}

// Hydrate on initial load and when synced from server
if (skills.value.length)
  hydrateSkillMeta(skills.value.map(s => s.packageName))

watch(personalCollection, (pc) => {
  if (pc?.record.skills.length)
    hydrateSkillMeta(pc.record.skills.map(s => s.packageName))
})

watch(debouncedQuery, async (q) => {
  if (q.length < 2) {
    suggestions.value = null
    return
  }
  suggestions.value = await $fetch<{ items: SearchSkill[] }>('/api/skills', {
    query: { q, limit: 8 },
  })
})

const filteredSuggestions = computed(() => {
  if (!suggestions.value?.items.length)
    return []
  const existing = new Set(skills.value.map(s => s.packageName))
  return suggestions.value.items.filter(s => !existing.has(s.name))
})

function selectSuggestion(skill: SearchSkill) {
  if (!skills.value.some(s => s.packageName === skill.name)) {
    skills.value.push({ packageName: skill.name })
    skillMeta.value.set(skill.name, { owner: skill.owner, repo: skill.repo, official: !!skill.official })
  }
  searchQuery.value = ''
  showSuggestions.value = false
  nextTick(() => document.getElementById('skill-search-input')?.focus())
}

const GITHUB_SKILL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+\/(.+))?/

function parseGitHubUrl(input: string): { owner: string, repo: string, path?: string } | null {
  const m = input.match(GITHUB_SKILL_RE)
  if (!m)
    return null
  return { owner: m[1]!, repo: m[2]!, path: m[3] }
}

function githubUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`
}

function addManualSkill() {
  const raw = searchQuery.value.trim()
  if (!raw)
    return

  const gh = parseGitHubUrl(raw)
  if (gh) {
    // Derive skill name from GitHub URL path or repo name
    const name = gh.path || gh.repo
    if (skills.value.some(s => s.packageName === name))
      return
    skills.value.push({ packageName: name })
    skillMeta.value.set(name, { owner: gh.owner, repo: gh.repo, official: false })
    searchQuery.value = ''
    return
  }

  if (skills.value.some(s => s.packageName === raw))
    return
  skills.value.push({ packageName: raw })
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

function formatInstalls(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(0)}k`
  return String(n)
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

  try {
    await publish({
      name: 'My Skills',
      slug: PERSONAL_COLLECTION_SLUG,
      description: `Skills curated by @${handle.value}`,
      skills: skills.value,
      stacks: personalCollection.value?.record.stacks ?? [],
    })
  }
  catch {
    // error.value is already set by useCollectionMutations
    return
  }

  justPublished.value = true
  setTimeout(() => {
    justPublished.value = false
  }, 6000)
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
          Sign in with your Atmosphere account to edit your skills.
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
          Search the <a href="https://skills.sh" target="_blank" class="underline underline-offset-2">skills.sh</a> directory to find skills. Your collection publishes to your PDS, where you control the data.
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
              placeholder="Search skills or paste a GitHub URL"
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
              <img
                v-if="suggestion.official"
                :src="`https://github.com/${suggestion.owner}.png?size=32`"
                :alt="`${suggestion.owner}`"
                class="size-4 shrink-0 rounded-full"
              >
              <span class="font-mono text-sm">{{ suggestion.displayName || suggestion.name }}</span>
              <span class="ml-auto flex items-center gap-2 text-xs text-muted font-mono">
                <span v-if="suggestion.installs" class="tabular-nums">{{ formatInstalls(suggestion.installs) }}</span>
                <span>{{ suggestion.owner }}/{{ suggestion.repo }}</span>
              </span>
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
                <div class="flex items-center gap-2">
                  <img
                    v-if="skillMeta.get(skill.packageName)?.official"
                    :src="`https://github.com/${skillMeta.get(skill.packageName)!.owner}.png?size=32`"
                    :alt="skillMeta.get(skill.packageName)!.owner"
                    class="size-4 shrink-0 rounded-full"
                  >
                  <p class="font-mono text-sm font-medium">
                    {{ skill.packageName }}
                  </p>
                  <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                </div>
                <a
                  v-if="skillMeta.get(skill.packageName)"
                  :href="githubUrl(skillMeta.get(skill.packageName)!.owner, skillMeta.get(skill.packageName)!.repo)"
                  target="_blank"
                  class="mt-0.5 block text-xs text-muted font-mono hover:text-default"
                >{{ skillMeta.get(skill.packageName)!.owner }}/{{ skillMeta.get(skill.packageName)!.repo }}</a>

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
          <UiTooltip
            label="Stored on your PDS"
            title="Personal Data Server"
            description="Your data is stored on the AT Protocol, not on skilld.dev. You own and control it."
            size="md"
          />
        </div>

        <!-- Install command preview (only after published) -->
        <div
          v-if="personalCollection"
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
