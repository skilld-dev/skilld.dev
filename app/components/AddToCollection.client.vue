<script setup lang="ts">
import type { CollectionRecord } from '../../server/utils/atproto/lexicons/collection'
import type { CollectionItem } from '../composables/useCollections'

const { packageName } = defineProps<{
  packageName: string
}>()

const { user, isAuthenticated } = useAuth()

const open = ref(false)

const { data: collectionsData, status } = useCollections(
  computed(() => user.value?.did),
  { lazy: true },
)

const collections = computed(() => collectionsData.value?.collections ?? [])

function hasSkill(record: CollectionRecord): boolean {
  return record.skills.some(s => s.packageName === packageName)
}

const updating = ref<string | null>(null)
const error = ref<string | null>(null)

async function toggle(collection: CollectionItem) {
  const has = hasSkill(collection.record)
  if (has && collection.record.skills.length <= 1)
    return

  updating.value = collection.rkey
  error.value = null

  const updatedSkills = has
    ? collection.record.skills.filter(s => s.packageName !== packageName)
    : [...collection.record.skills, { packageName }]

  await $fetch('/api/collections', {
    method: 'PUT',
    body: {
      name: collection.record.name,
      slug: collection.record.slug,
      description: collection.record.description,
      skills: updatedSkills,
      stacks: collection.record.stacks,
    },
  })
    .then(() => {
      collection.record.skills = updatedSkills
    })
    .catch(() => {
      error.value = 'Update failed. Try again.'
    })
    .finally(() => {
      updating.value = null
    })
}
</script>

<template>
  <UPopover
    v-if="isAuthenticated"
    v-model:open="open"
  >
    <UButton
      icon="i-lucide-folder-plus"
      label="Add to collection"
      color="neutral"
      variant="ghost"
      size="xs"
    />
    <template #content>
      <div class="w-60 p-1.5">
        <!-- Loading -->
        <div
          v-if="status === 'pending' && !collections.length"
          class="flex items-center justify-center py-4"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="size-4 animate-spin text-muted"
            aria-label="Loading collections"
          />
        </div>

        <!-- Empty -->
        <div
          v-else-if="!collections.length"
          class="px-2 py-3 text-center"
        >
          <p class="text-xs text-muted">
            No collections yet.
          </p>
        </div>

        <!-- Collection list -->
        <template v-else>
          <button
            v-for="c in collections"
            :key="c.rkey"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-muted disabled:opacity-50"
            :disabled="updating === c.rkey || (hasSkill(c.record) && c.record.skills.length <= 1)"
            @click="toggle(c)"
          >
            <UIcon
              :name="hasSkill(c.record) ? 'i-lucide-check' : 'i-lucide-plus'"
              class="size-3.5 shrink-0"
              :class="hasSkill(c.record) ? 'text-primary' : 'text-muted'"
              aria-hidden="true"
            />
            <span class="flex-1 truncate font-mono text-xs">{{ c.record.name }}</span>
            <UIcon
              v-if="updating === c.rkey"
              name="i-lucide-loader-2"
              class="size-3 shrink-0 animate-spin text-muted"
              aria-hidden="true"
            />
            <span
              v-else
              class="data-label shrink-0"
            >{{ c.record.skills.length }}</span>
          </button>
        </template>

        <!-- Error -->
        <p
          v-if="error"
          class="px-2 py-1 font-mono text-xs text-red-500"
          role="alert"
        >
          {{ error }}
        </p>

        <USeparator class="my-1" />

        <!-- New collection -->
        <NuxtLink
          :to="`/people/${user?.handle}/collections/new?skill=${encodeURIComponent(packageName)}`"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-200 hover:bg-muted"
          @click="open = false"
        >
          <UIcon
            name="i-lucide-plus"
            class="size-3.5 text-muted"
            aria-hidden="true"
          />
          <span class="font-mono text-xs">New collection</span>
        </NuxtLink>
      </div>
    </template>
  </UPopover>
</template>
