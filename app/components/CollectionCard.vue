<script setup lang="ts">
const { collection } = defineProps<{
  collection: {
    uri: string
    cid: string
    name: string
    slug: string
    description: string
    curator: { name: string, handle: string, avatar: string }
    skillCount: number
    skills: string[]
    installs?: number
    updated?: string
  }
}>()

const expanded = ref(false)
const installCmd = computed(() => collectionInstallCmd(collection.curator.handle, collection.slug))
const { copy, copied } = useClipboard({ source: installCmd })

const { isAuthenticated } = useAuth()
const { isSaved, save, unsave } = useSavedCollections()
const saved = computed(() => isSaved(collection.uri))
const toggling = ref(false)

async function toggleSave() {
  if (toggling.value)
    return
  toggling.value = true
  if (saved.value) {
    await unsave(collection.uri)
  }
  else {
    await save({ uri: collection.uri, cid: collection.cid })
  }
  toggling.value = false
}
</script>

<template>
  <div class="rounded-lg border border-default transition-colors duration-200 hover:border-[var(--ui-text-muted)]">
    <div class="p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-mono text-sm font-medium">
            {{ collection.name }}
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
            {{ collection.description }}
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            v-if="isAuthenticated"
            class="mt-0.5 rounded p-1 transition-colors duration-200"
            :class="saved ? 'text-primary' : 'text-muted hover:text-default'"
            :aria-label="saved ? `Unsave ${collection.name}` : `Save ${collection.name}`"
            :aria-pressed="saved"
            :disabled="toggling"
            @click="toggleSave"
          >
            <UIcon
              :name="saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
              class="size-4"
              aria-hidden="true"
            />
          </button>
          <button
            class="mt-0.5 rounded p-1 text-muted transition-colors hover:text-default"
            :aria-label="expanded ? 'Collapse' : 'Expand'"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            <UIcon
              :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="size-4"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div class="mt-3 flex items-center gap-3">
        <img
          :src="collection.curator.avatar"
          :alt="`Avatar for ${collection.curator.name}`"
          width="20"
          height="20"
          loading="lazy"
          decoding="async"
          class="size-5 rounded-full"
        >
        <span class="text-xs">{{ collection.curator.name }}</span>
        <span class="data-label ml-auto">{{ collection.skillCount }} skills</span>
        <span
          v-if="collection.installs"
          class="data-label"
        >{{ collection.installs }} installs</span>
        <span
          v-if="collection.updated"
          class="data-label"
        >{{ collection.updated }}</span>
      </div>

      <div
        v-if="expanded"
        class="border-t border-default px-4 py-3"
      >
        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="skill in collection.skills"
            :key="skill"
            :label="skill"
            variant="subtle"
            color="neutral"
            size="xs"
          />
        </div>

        <div class="mt-3 flex items-center gap-2">
          <code class="flex-1 truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
            {{ installCmd }}
          </code>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="copied ? 'Copied' : `Copy install command for ${collection.name}`"
            @click="copy(installCmd)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
