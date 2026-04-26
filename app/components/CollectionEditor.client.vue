<script setup lang="ts">
import type { CollectionInput, CollectionRecord, CollectionSkill } from '../../server/utils/atproto/lexicons/collection'

const { existing, initialSkills, initial } = defineProps<{
  existing?: { rkey: string, record: CollectionRecord }
  initialSkills?: string[]
  initial?: Partial<CollectionInput>
}>()

const emit = defineEmits<{
  published: [{ uri: string, rkey: string, postUri?: string }]
}>()

const { user } = useAuth()
const { publish, publishing, error: mutationError } = useCollectionMutations()

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const NON_ALNUM_RE = /[^a-z0-9]+/g
const LEADING_TRAILING_DASH_RE = /^-|-$/g

const seedSkills: CollectionSkill[] = existing?.record.skills
  ?? initial?.skills
  ?? (initialSkills?.map(packageName => ({ packageName })) ?? [])

const skillMeta = reactive<Record<string, { reason?: string, owner?: string, repo?: string }>>(
  Object.fromEntries(seedSkills.map(s => [s.packageName, { reason: s.reason, owner: s.owner, repo: s.repo }])),
)

const state = reactive({
  name: existing?.record.name ?? initial?.name ?? '',
  slug: existing?.rkey ?? initial?.slug ?? '',
  description: existing?.record.description ?? initial?.description ?? '',
  preamble: existing?.record.preamble ?? initial?.preamble ?? '',
  skillInput: '',
  skills: seedSkills.map(s => s.packageName),
  stackInput: '',
  stacks: existing?.record.stacks ?? initial?.stacks ?? [] as string[],
  shareOnBluesky: !existing,
})

const isEdit = computed(() => !!existing)
const autoSlug = ref(!existing)

watch(() => state.name, (name) => {
  if (!autoSlug.value)
    return
  state.slug = name
    .toLowerCase()
    .replace(NON_ALNUM_RE, '-')
    .replace(LEADING_TRAILING_DASH_RE, '')
    .slice(0, 64)
})

const editingReason = ref<string | null>(null)
const reasonInput = ref('')
const firstAddPrompted = ref(state.skills.length > 0)

function startEditReason(packageName: string) {
  editingReason.value = packageName
  reasonInput.value = skillMeta[packageName]?.reason ?? ''
  nextTick(() => {
    document.getElementById(`reason-input-${packageName}`)?.focus()
  })
}

function commitReason(packageName: string) {
  const trimmed = reasonInput.value.trim()
  const meta = skillMeta[packageName] ?? {}
  meta.reason = trimmed || undefined
  skillMeta[packageName] = meta
  editingReason.value = null
}

function addSkill() {
  const val = state.skillInput.trim()
  if (!val || state.skills.includes(val)) {
    state.skillInput = ''
    return
  }
  state.skills.push(val)
  state.skillInput = ''
  if (!firstAddPrompted.value) {
    firstAddPrompted.value = true
    startEditReason(val)
  }
}

function removeSkill(index: number) {
  const removed = state.skills[index]
  state.skills.splice(index, 1)
  if (removed && editingReason.value === removed)
    editingReason.value = null
}

function addStack() {
  const val = state.stackInput.trim()
  if (val && !state.stacks.includes(val)) {
    state.stacks.push(val)
  }
  state.stackInput = ''
}

function removeStack(index: number) {
  state.stacks.splice(index, 1)
}

const fieldErrors = reactive<Record<string, string>>({})

function validate() {
  fieldErrors.name = ''
  fieldErrors.slug = ''
  fieldErrors.skills = ''
  if (!state.name)
    fieldErrors.name = 'Name is required'
  if (!state.slug || !SLUG_RE.test(state.slug))
    fieldErrors.slug = 'Slug must be lowercase alphanumeric with hyphens'
  if (state.skills.length === 0)
    fieldErrors.skills = 'Add at least one skill'
  return Object.values(fieldErrors).some(Boolean)
}

async function handleSubmit() {
  if (validate())
    return

  let result
  try {
    result = await publish({
      name: state.name,
      slug: state.slug,
      description: state.description,
      ...(state.preamble.trim() ? { preamble: state.preamble.trim() } : {}),
      skills: state.skills.map((packageName) => {
        const meta = skillMeta[packageName]
        return {
          packageName,
          ...(meta?.reason ? { reason: meta.reason } : {}),
          ...(meta?.owner ? { owner: meta.owner } : {}),
          ...(meta?.repo ? { repo: meta.repo } : {}),
        }
      }),
      stacks: state.stacks,
    }, { shareOnBluesky: state.shareOnBluesky })
  }
  catch {
    // error.value is already set by useCollectionMutations
    return
  }

  emit('published', { uri: result.uri, rkey: state.slug, postUri: result.postUri })
}
</script>

<template>
  <form
    class="space-y-5"
    @submit.prevent="handleSubmit"
  >
    <UFormField
      label="Name"
      name="name"
      required
      :error="fieldErrors.name"
    >
      <UInput
        v-model="state.name"
        placeholder="Nuxt Production Stack"
        class="font-mono"
      />
    </UFormField>

    <UFormField
      label="Slug"
      name="slug"
      hint="Used in install command"
      required
      :error="fieldErrors.slug"
    >
      <UInput
        v-model="state.slug"
        placeholder="nuxt-production"
        class="font-mono"
        :disabled="isEdit"
        @focus="autoSlug = false"
      />
      <template #description>
        <span
          v-if="user && state.slug"
          class="font-mono text-xs text-muted"
        >
          {{ collectionInstallCmd(user.handle, state.slug) }}
        </span>
      </template>
    </UFormField>

    <UFormField
      label="Description"
      name="description"
      hint="Shown under the name. 1-2 sentences, under 500 chars."
    >
      <UTextarea
        v-model="state.description"
        placeholder="What this collection is for and who it's built for."
        :rows="3"
      />
    </UFormField>

    <UFormField
      label="Preamble"
      name="preamble"
      hint="Optional. Long-form intro rendered at the top of the collection page. Plain text or markdown, up to ~5000 chars."
    >
      <UTextarea
        v-model="state.preamble"
        placeholder="Why this stack exists. The constraints it solves. Who it's for. Anything a reader (or search engine) would want to know before scanning the skills list."
        :rows="6"
        class="font-mono text-sm"
      />
      <template #description>
        <span class="font-mono text-xs text-muted">
          {{ state.preamble.length }} / 5000
        </span>
      </template>
    </UFormField>

    <UFormField
      label="Skills"
      name="skills"
      required
      :error="fieldErrors.skills"
    >
      <div class="space-y-2">
        <div class="flex gap-2">
          <UInput
            v-model="state.skillInput"
            placeholder="vue, nuxt, tailwindcss..."
            class="flex-1 font-mono"
            @keydown.enter.prevent="addSkill"
          />
          <UButton
            label="Add"
            color="neutral"
            variant="outline"
            size="sm"
            type="button"
            @click="addSkill"
          />
        </div>
        <ul
          v-if="state.skills.length"
          class="space-y-2"
        >
          <li
            v-for="(skill, i) in state.skills"
            :key="skill"
            class="group flex items-start gap-3 rounded-lg border border-default p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm">
                {{ skill }}
              </p>
              <div
                v-if="editingReason === skill"
                class="mt-1.5"
              >
                <label
                  :for="`reason-input-${skill}`"
                  class="sr-only"
                >
                  Why this skill?
                </label>
                <input
                  :id="`reason-input-${skill}`"
                  v-model="reasonInput"
                  class="w-full rounded border border-default bg-transparent px-2 py-1 text-xs text-muted outline-none focus:border-[var(--ui-text-muted)]"
                  placeholder="Why this skill? (one line is plenty, like &quot;use this for v3 SSR with Pinia&quot;)"
                  @blur="commitReason(skill)"
                  @keydown.enter.prevent="commitReason(skill)"
                  @keydown.escape="editingReason = null"
                >
              </div>
              <button
                v-else-if="skillMeta[skill]?.reason"
                type="button"
                class="mt-1 text-left text-xs text-muted leading-relaxed hover:text-default transition-colors"
                @click="startEditReason(skill)"
              >
                {{ skillMeta[skill]!.reason }}
              </button>
              <button
                v-else
                type="button"
                class="mt-1 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-default focus:opacity-100"
                @click="startEditReason(skill)"
              >
                + add reason
              </button>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-sm p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-default focus:opacity-100"
              :aria-label="`Remove ${skill}`"
              @click="removeSkill(i)"
            >
              <UIcon
                name="i-lucide-x"
                class="size-4"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
        <p
          v-else
          class="text-xs text-muted"
        >
          No skills added yet. Type a package name and press Enter.
        </p>
      </div>
    </UFormField>

    <UFormField
      label="Stacks"
      name="stacks"
      hint="Optional"
    >
      <div class="space-y-2">
        <div class="flex gap-2">
          <UInput
            v-model="state.stackInput"
            placeholder="Nuxt, Vue, TypeScript..."
            class="flex-1 font-mono"
            @keydown.enter.prevent="addStack"
          />
          <UButton
            label="Add"
            color="neutral"
            variant="outline"
            size="sm"
            type="button"
            @click="addStack"
          />
        </div>
        <div
          v-if="state.stacks.length"
          class="flex flex-wrap gap-1.5"
        >
          <UBadge
            v-for="(stack, i) in state.stacks"
            :key="stack"
            :label="stack"
            variant="subtle"
            color="primary"
            size="xs"
            class="pr-1"
          >
            <template #trailing>
              <button
                type="button"
                class="ml-1 rounded-sm p-0.5 text-muted hover:text-default"
                :aria-label="`Remove ${stack}`"
                @click="removeStack(i)"
              >
                <UIcon
                  name="i-lucide-x"
                  class="size-3"
                  aria-hidden="true"
                />
              </button>
            </template>
          </UBadge>
        </div>
      </div>
    </UFormField>

    <!-- Share on Bluesky -->
    <UCheckbox
      v-if="!isEdit"
      v-model="state.shareOnBluesky"
      label="Post to Bluesky when published"
      description="Share your collection with a link card on your Bluesky feed."
    />

    <!-- Error display -->
    <div
      v-if="mutationError"
      role="alert"
      class="rounded-lg border border-default bg-muted p-3"
    >
      <p class="text-sm text-default">
        {{ mutationError }}
      </p>
    </div>

    <div class="flex items-center gap-3 pt-2">
      <UButton
        type="submit"
        :label="isEdit ? 'Update collection' : 'Publish collection'"
        icon="i-lucide-upload"
        :loading="publishing"
      />
      <UiTooltip
        label="Stored on your PDS"
        title="Personal Data Server"
        description="Your data is stored on the AT Protocol, not on skilld.dev. You own and control it."
        size="md"
      />
    </div>
  </form>
</template>
