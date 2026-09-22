<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'
/**
 * A static route, so it wins over [slug].vue and no collection can ever be
 * reached at /@login/liked. The list is virtual: there is no collections_v2 row
 * behind it, because UNIQUE(author_login, slug) would collide with a real
 * collection and the two would need syncing forever.
 *
 * noindex is deliberate. This is a per-user list that changes on every click,
 * exactly the scaled content the 2026-06 suppression punished (VISION
 * principle 2). It is a shareable page, not an indexable one.
 */
interface LikedSkill {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  stars: number | null
  likeCount: number
  likedAt: number
  registryPath: string
}

interface LikedResponse {
  author: { login: string, name: string | null, avatar: string | null }
  items: LikedSkill[]
}

const route = useRoute()
const login = computed(() => String(route.params.login))

const { data, error } = await useFetch<LikedResponse>(
  () => `/api/likes/by-user/${login.value}`,
  { key: () => `liked-${login.value}` },
)

if (error.value)
  throw createError({ statusCode: 404, message: 'Not found', fatal: true })

const items = computed(() => data.value?.items ?? [])
const repositoryCount = computed(() => new Set(items.value.map(s => `${s.owner}/${s.repo}`)).size)

useSeoMeta({
  // The global titleTemplate appends ` · skilld`; see @[login]/[slug].vue.
  title: () => `Liked by @${login.value}`,
  description: () => `Skills @${login.value} likes on skilld.`,
  robots: 'noindex, follow',
})
</script>

<template>
  <article class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
    <header>
      <NuxtLink
        :to="`/@${login}`"
        class="group inline-flex min-h-11 items-center gap-3 text-muted transition-colors duration-200 hover:text-default"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4 transition-transform duration-200 group-hover:-translate-x-1"
          aria-hidden="true"
        />
        <img
          :src="githubAvatarProxyUrl(login, 64)"
          alt=""
          width="32"
          height="32"
          class="size-8 rounded-full border border-default bg-muted"
          fetchpriority="high"
        >
        <span>
          <span class="data-label block">Liked by</span>
          <span class="block font-mono text-sm text-default">@{{ login }}</span>
        </span>
      </NuxtLink>

      <h1 class="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Liked skills
      </h1>
      <p class="mt-4 max-w-3xl text-base leading-relaxed text-muted text-pretty">
        Every skill @{{ login }} liked. Liking one watches its repository, so these are the
        skills whose changes reach their digest.
      </p>

      <dl class="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-y border-default py-3">
        <div class="flex items-baseline gap-2">
          <dt class="data-label">
            Skills
          </dt>
          <dd class="font-mono text-sm tabular-nums">
            {{ items.length }}
          </dd>
        </div>
        <div class="flex items-baseline gap-2">
          <dt class="data-label">
            Repositories
          </dt>
          <dd class="font-mono text-sm tabular-nums">
            {{ repositoryCount }}
          </dd>
        </div>
      </dl>
    </header>

    <section
      v-if="items.length"
      class="mt-10 grid gap-3 sm:grid-cols-2"
      aria-label="Liked skills"
    >
      <SkillCard
        v-for="skill in items"
        :key="skill.slug"
        :skill="{
          owner: skill.owner,
          repo: skill.repo,
          name: skill.name,
          registryPath: skill.registryPath,
          slug: skill.slug,
          description: skill.description,
          stars: skill.stars ?? 0,
          likeCount: skill.likeCount,
        }"
      />
    </section>

    <p v-else class="mt-10 text-sm text-muted">
      @{{ login }} hasn't liked anything yet.
    </p>
  </article>
</template>
