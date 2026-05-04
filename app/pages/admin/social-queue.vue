<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { user, isAuthenticated, isLoading } = useAuth()
const isAdmin = computed(() =>
  user.value?.email?.toLowerCase() === 'harlan@harlanzw.com'
  || (user.value?.did === 'did:plc:hvv3hamgocficqdvp5llrkha' && user.value?.handle === 'harlanzw.com'),
)

useSeoMeta({
  title: 'Social queue (admin)',
  robots: 'noindex,nofollow',
})

interface QueuePost {
  id: number
  skill_slug: string
  platform: 'twitter' | 'bsky' | 'reddit'
  post_url: string
  author_handle: string
  author_display_name: string | null
  role: 'author' | 'community'
  status: 'pending' | 'approved' | 'rejected'
  text_extract: string
  posted_at: number | null
  fetched_at: number
}

const statusFilter = ref<'pending' | 'approved' | 'rejected'>('pending')
const { data, refresh, status } = await useFetch<{ posts: QueuePost[] }>(
  () => `/api/admin/social/queue?status=${statusFilter.value}`,
  { watch: [statusFilter], immediate: false },
)

watchEffect(() => {
  if (isAdmin.value)
    refresh()
})

// Add form state
const skillSlug = ref('')
const url = ref('')
const role = ref<'auto' | 'author' | 'community'>('auto')
const autoApprove = ref(true)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const submitResult = ref<string | null>(null)

async function submit() {
  submitError.value = null
  submitResult.value = null
  submitting.value = true
  try {
    const result = await $fetch<{ ok: boolean, role: string, status: string }>(
      '/api/admin/social/add',
      {
        method: 'POST',
        body: {
          url: url.value.trim(),
          skillSlug: skillSlug.value.trim(),
          role: role.value === 'auto' ? undefined : role.value,
          autoApprove: autoApprove.value,
        },
      },
    )
    submitResult.value = `Added as ${result.role} (${result.status})`
    url.value = ''
    refresh()
  }
  catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : 'Failed to add post'
  }
  finally {
    submitting.value = false
  }
}

async function setStatus(id: number, newStatus: 'approved' | 'rejected') {
  await $fetch(`/api/admin/social/${id}`, {
    method: 'PATCH',
    body: { status: newStatus },
  })
  refresh()
}

async function setRole(id: number, newRole: 'author' | 'community') {
  await $fetch(`/api/admin/social/${id}`, {
    method: 'PATCH',
    body: { role: newRole },
  })
  refresh()
}

const pendingDelete = ref<number | null>(null)
async function remove(id: number) {
  if (pendingDelete.value !== id) {
    pendingDelete.value = id
    setTimeout(() => {
      if (pendingDelete.value === id)
        pendingDelete.value = null
    }, 3000)
    return
  }
  pendingDelete.value = null
  await $fetch(`/api/admin/social/${id}`, { method: 'DELETE' })
  refresh()
}

const statusTabs = [
  { label: 'Pending', value: 'pending' as const },
  { label: 'Approved', value: 'approved' as const },
  { label: 'Rejected', value: 'rejected' as const },
]
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 sm:px-6 py-12">
    <h1 class="text-2xl font-medium mb-2">
      Social queue
    </h1>
    <p class="text-sm text-muted mb-8">
      Paste a post URL (X, Bluesky, or Reddit), assign it to a skill, approve. Approved posts render on the skill page with SSR text fallback for SEO.
    </p>

    <div
      v-if="isLoading"
      class="text-sm text-muted"
    >
      Loading…
    </div>

    <div
      v-else-if="!isAuthenticated || !isAdmin"
      class="rounded-lg border border-default p-6 text-sm"
    >
      Sign in as <code class="font-mono">harlan@harlanzw.com</code> to access this page.
    </div>

    <template v-else>
      <!-- Add form -->
      <form
        class="rounded-lg border border-default bg-elevated p-5 mb-8 space-y-4"
        @submit.prevent="submit"
      >
        <h2 class="font-medium">
          Add post
        </h2>

        <UFormField
          label="Skill slug"
          help="e.g. anthropics/skill-creator"
        >
          <UInput
            v-model="skillSlug"
            placeholder="owner/repo-or-name"
            required
          />
        </UFormField>

        <UFormField
          label="Post URL"
          help="X, Bluesky, or Reddit (post or comment permalink)"
        >
          <UInput
            v-model="url"
            type="url"
            placeholder="https://x.com/... or https://bsky.app/... or https://reddit.com/..."
            required
          />
        </UFormField>

        <div class="flex flex-wrap items-center gap-4">
          <UFormField label="Role">
            <USelect
              v-model="role"
              :items="[
                { label: 'Auto-detect', value: 'auto' },
                { label: 'Author', value: 'author' },
                { label: 'Community', value: 'community' },
              ]"
            />
          </UFormField>

          <label class="flex items-center gap-2 text-sm">
            <UCheckbox v-model="autoApprove" />
            Auto-approve
          </label>
        </div>

        <div class="flex items-center gap-3">
          <UButton
            type="submit"
            :loading="submitting"
            label="Fetch and store"
          />
          <p
            v-if="submitResult"
            class="text-sm text-primary"
          >
            {{ submitResult }}
          </p>
          <p
            v-if="submitError"
            class="text-sm text-error"
          >
            {{ submitError }}
          </p>
        </div>
      </form>

      <!-- Queue list -->
      <div class="flex items-center gap-3 mb-4">
        <UButton
          v-for="tab in statusTabs"
          :key="tab.value"
          :label="tab.label"
          :variant="statusFilter === tab.value ? 'solid' : 'ghost'"
          :color="statusFilter === tab.value ? 'primary' : 'neutral'"
          size="sm"
          @click="statusFilter = tab.value"
        />
      </div>

      <div
        v-if="status === 'pending'"
        class="text-sm text-muted"
      >
        Loading…
      </div>

      <div
        v-else-if="!data?.posts.length"
        class="rounded-lg border border-default p-6 text-center text-sm text-muted"
      >
        No {{ statusFilter }} posts.
      </div>

      <ul
        v-else
        class="space-y-3"
      >
        <li
          v-for="post in data.posts"
          :key="post.id"
          class="rounded-lg border border-default bg-elevated p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 text-xs text-muted font-mono mb-1">
                <UBadge
                  :label="post.platform"
                  size="xs"
                  variant="subtle"
                />
                <UBadge
                  :label="post.role"
                  size="xs"
                  variant="subtle"
                  :color="post.role === 'author' ? 'primary' : 'neutral'"
                />
                <NuxtLink
                  :to="`/skills/${post.skill_slug}`"
                  class="hover:text-default"
                >
                  /skills/{{ post.skill_slug }}
                </NuxtLink>
                <span>·</span>
                <a
                  :href="post.post_url"
                  target="_blank"
                  rel="noopener"
                  class="hover:text-default truncate"
                >
                  @{{ post.author_handle }}
                </a>
              </div>
              <p class="text-sm leading-relaxed line-clamp-3">
                {{ post.text_extract }}
              </p>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <UButton
                v-if="post.status !== 'approved'"
                label="Approve"
                size="xs"
                color="primary"
                variant="outline"
                @click="setStatus(post.id, 'approved')"
              />
              <UButton
                v-if="post.status !== 'rejected'"
                label="Reject"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="setStatus(post.id, 'rejected')"
              />
              <UButton
                v-if="post.role === 'community'"
                label="→ author"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="setRole(post.id, 'author')"
              />
              <UButton
                v-else
                label="→ community"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="setRole(post.id, 'community')"
              />
              <UButton
                :label="pendingDelete === post.id ? 'Confirm?' : 'Delete'"
                size="xs"
                color="error"
                variant="ghost"
                @click="remove(post.id)"
              />
            </div>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
