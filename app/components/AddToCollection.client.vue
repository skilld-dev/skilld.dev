<script setup lang="ts">
const props = defineProps<{
  owner: string
  repo: string
  name: string
}>()

const route = useRoute()
const { isAuthenticated, user, loginUrl } = useAuth()

const open = ref(false)

interface MyCollection {
  slug: string
  name: string
  preamble: string | null
  skillCount: number
  updatedAt: number
  hasSkill: boolean | null
}

const query = computed(() => ({ owner: props.owner, repo: props.repo, name: props.name }))
const { data, status, refresh, error } = useFetch<{ login: string, collections: MyCollection[] }>(
  '/api/me/collections',
  {
    query,
    immediate: false,
    lazy: true,
    default: () => ({ login: '', collections: [] }),
    watch: false,
  },
)

watch(open, (value) => {
  if (value && isAuthenticated.value)
    refresh()
})

const collections = computed(() => data.value?.collections ?? [])
const updating = ref<string | null>(null)
const mutateError = ref<string | null>(null)

async function toggle(collection: MyCollection) {
  if (!user.value?.login)
    return
  updating.value = collection.slug
  mutateError.value = null
  const method = collection.hasSkill ? 'DELETE' : 'POST'
  await $fetch(
    `/api/collections/by-author/${user.value.login}/${collection.slug}/skills`,
    {
      method,
      body: { owner: props.owner, repo: props.repo, name: props.name },
    },
  )
    .then(() => {
      collection.hasSkill = !collection.hasSkill
      collection.skillCount += collection.hasSkill ? 1 : -1
    })
    .catch((e: { data?: { message?: string } }) => {
      mutateError.value = e?.data?.message ?? 'Could not update collection'
    })
  updating.value = null
}

const newCollectionHref = computed(() => {
  const params = new URLSearchParams()
  params.set('skills', `${props.owner}/${props.repo}`)
  return `/collections/new?${params.toString()}`
})
const signInHref = computed(() => loginUrl({ returnTo: route.fullPath, action: 'add-to-collection' }))
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'w-72 p-0' }">
    <UButton
      icon="i-lucide-bookmark-plus"
      label="Save"
      size="xs"
      color="neutral"
      variant="ghost"
      :aria-expanded="open"
      aria-haspopup="dialog"
    />
    <template #content>
      <div class="rounded-lg overflow-hidden">
        <header class="px-3 py-2 border-b border-default">
          <p class="section-label">
            Save to collection
          </p>
        </header>

        <div v-if="!isAuthenticated" class="p-3 text-sm">
          <p class="text-muted leading-relaxed">
            Sign in with GitHub to save skills to your collections.
          </p>
          <UButton
            :to="signInHref"
            external
            label="Sign in"
            icon="i-lucide-github"
            size="sm"
            color="neutral"
            variant="solid"
            block
            class="mt-3"
          />
        </div>

        <div v-else-if="status === 'pending'" class="p-3 space-y-2">
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="h-4 w-2/3" />
        </div>

        <div v-else-if="error" class="p-3 text-sm" role="alert">
          <p>Couldn't load your collections.</p>
          <UButton
            label="Retry"
            size="xs"
            color="neutral"
            variant="outline"
            class="mt-2"
            @click="refresh()"
          />
        </div>

        <template v-else>
          <ul v-if="collections.length" class="max-h-72 overflow-y-auto divide-y divide-default">
            <li v-for="c in collections" :key="c.slug">
              <button
                type="button"
                class="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors disabled:opacity-60"
                :disabled="updating === c.slug"
                :aria-pressed="!!c.hasSkill"
                @click="toggle(c)"
              >
                <UIcon
                  :name="c.hasSkill ? 'i-lucide-check-square' : 'i-lucide-square'"
                  class="size-4 shrink-0 mt-0.5"
                  :class="c.hasSkill ? 'text-primary' : 'text-muted'"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block font-mono text-sm truncate">{{ c.name }}</span>
                  <span class="data-label">{{ c.skillCount }} skill{{ c.skillCount === 1 ? '' : 's' }}</span>
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="px-3 py-3 text-sm text-muted">
            You don't have any collections yet.
          </p>

          <div v-if="mutateError" class="px-3 pb-2 text-xs text-error" role="alert">
            {{ mutateError }}
          </div>

          <div class="border-t border-default p-2">
            <UButton
              :to="newCollectionHref"
              label="New collection"
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="ghost"
              block
              @click="open = false"
            />
          </div>
        </template>
      </div>
    </template>
  </UPopover>
</template>
