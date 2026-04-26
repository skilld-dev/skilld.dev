<script setup lang="ts">
import type { IndexedCurator } from '../../server/utils/atproto/curator-index'
import { refreshFollows, useNetworkFeed } from '../composables/useNetworkFeed'

interface DiscoverResponse {
  curators: IndexedCurator[]
}

const { data: feed, refresh: refreshFeed, status } = useNetworkFeed()
const { data: discoverData } = useFetch<DiscoverResponse>('/api/feed/discover-curators', {
  default: () => ({ curators: [] }),
})

const isRefreshing = ref(false)
const refreshError = ref<string | null>(null)

async function onRefresh() {
  isRefreshing.value = true
  refreshError.value = null
  try {
    await refreshFollows()
    await refreshFeed()
  }
  catch (err) {
    refreshError.value = (err as { data?: { message?: string }, message?: string }).data?.message
      ?? (err as Error).message
      ?? 'Refresh failed.'
  }
  finally {
    isRefreshing.value = false
  }
}

const skills = computed(() => feed.value?.skills ?? [])
const followCount = computed(() => feed.value?.followCount ?? 0)
const generatedAt = computed(() => feed.value?.generatedAt)

const now = useNow({ interval: 30_000 })
const lastSyncedLabel = computed(() => {
  if (!import.meta.client)
    return null
  const iso = generatedAt.value
  if (!iso)
    return null
  const ms = now.value.getTime() - Date.parse(iso)
  if (ms < 60_000)
    return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60)
    return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)
    return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
})

function skillSlug(s: { packageName: string, owner: string | null, repo: string | null }) {
  if (!s.owner)
    return s.packageName
  if (s.repo && s.repo !== 'skills')
    return `${s.owner}/${s.repo}/${s.packageName}`
  return `${s.owner}/${s.packageName}`
}
function skillPath(s: { packageName: string, owner: string | null, repo: string | null }) {
  return `/skills/${skillSlug(s)}`
}
function curatorPath(handle: string) {
  return `/people/${handle}`
}

const isEmpty = computed(() => status.value !== 'pending' && skills.value.length === 0)
</script>

<template>
  <section
    class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
    aria-labelledby="network-feed-heading"
  >
    <div class="flex items-end justify-between mb-2 gap-4">
      <h2
        id="network-feed-heading"
        class="section-label"
      >
        Picked by your network
      </h2>
      <div class="flex items-center gap-3 text-xs text-muted font-mono">
        <span v-if="lastSyncedLabel">Last synced {{ lastSyncedLabel }}</span>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-cw"
          :loading="isRefreshing"
          aria-label="Refresh follow list"
          @click="onRefresh"
        />
      </div>
    </div>

    <p class="mb-6 text-sm text-muted max-w-lg leading-relaxed">
      <template v-if="followCount">
        Skills picked by the {{ followCount }} {{ followCount === 1 ? 'account' : 'accounts' }} you follow on Bluesky.
      </template>
      <template v-else>
        Skills picked by the people you follow on Bluesky.
      </template>
    </p>

    <p v-if="refreshError" class="mb-4 text-xs text-rose-500 font-mono">
      {{ refreshError }}
    </p>

    <!-- Populated state -->
    <ul
      v-if="skills.length"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
    >
      <li v-for="skill in skills" :key="skillSlug(skill)">
        <div class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]">
          <NuxtLink
            :to="skillPath(skill)"
            :aria-label="`${skill.packageName}${skill.owner ? ` by ${skill.owner}` : ''}`"
            class="block min-w-0"
          >
            <div class="flex items-center gap-1.5">
              <img
                v-if="skill.owner"
                :src="`https://github.com/${skill.owner}.png?size=32`"
                :alt="skill.owner"
                class="size-4 shrink-0 rounded-full"
                loading="lazy"
              >
              <p class="font-mono text-sm font-medium truncate">
                {{ skill.packageName }}
              </p>
            </div>
            <p v-if="skill.owner" class="mt-0.5 text-xs text-muted truncate">
              {{ skill.owner }}{{ skill.repo && skill.repo !== 'skills' ? `/${skill.repo}` : '' }}
            </p>
          </NuxtLink>
          <div class="mt-3 flex items-center gap-2">
            <div class="flex -space-x-1.5">
              <NuxtLink
                v-for="curator in skill.curators"
                :key="curator.did"
                :to="curatorPath(curator.handle)"
                :aria-label="`@${curator.handle}`"
                class="block"
              >
                <img
                  v-if="curator.avatar"
                  :src="curator.avatar"
                  :alt="`@${curator.handle}`"
                  class="size-5 rounded-full ring-1 ring-default bg-muted"
                  loading="lazy"
                >
                <span
                  v-else
                  class="flex size-5 items-center justify-center rounded-full ring-1 ring-default bg-muted"
                >
                  <UIcon name="i-lucide-user" class="size-3 text-muted" />
                </span>
              </NuxtLink>
            </div>
            <p class="font-mono text-xs text-muted truncate">
              <NuxtLink
                :to="curatorPath(skill.curators[0]!.handle)"
                class="hover:text-default"
              >
                @{{ skill.curators[0]!.handle }}
              </NuxtLink>
              <template v-if="skill.curators.length > 1">
                +{{ skill.curators.length - 1 }}
              </template>
            </p>
          </div>
          <p
            v-if="skill.curators[0]!.reason"
            class="mt-2 text-xs text-muted leading-snug line-clamp-2"
          >
            "{{ skill.curators[0]!.reason }}"
          </p>
        </div>
      </li>
    </ul>

    <!-- Empty state -->
    <div
      v-else-if="isEmpty"
      class="rounded-lg border border-dashed border-default p-6"
    >
      <p class="text-sm text-muted leading-relaxed mb-4 max-w-md">
        Your network hasn't picked anything yet on skilld. Follow these curators on Bluesky to start seeing their picks here.
      </p>
      <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 list-none p-0">
        <li v-for="curator in (discoverData?.curators ?? [])" :key="curator.did">
          <a
            :href="`https://bsky.app/profile/${curator.handle}`"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Follow @${curator.handle} on Bluesky`"
            class="group flex items-center gap-3 rounded-lg border border-default p-3 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <img
              v-if="curator.avatar"
              :src="curator.avatar"
              :alt="`@${curator.handle}`"
              class="size-8 rounded-full bg-muted"
              loading="lazy"
            >
            <span
              v-else
              class="flex size-8 items-center justify-center rounded-full bg-muted"
            >
              <UIcon name="i-lucide-user" class="size-4 text-muted" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ curator.displayName || curator.handle }}
              </p>
              <p class="font-mono text-xs text-muted truncate">
                @{{ curator.handle }}
              </p>
            </div>
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5 shrink-0 text-muted"
            />
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>
