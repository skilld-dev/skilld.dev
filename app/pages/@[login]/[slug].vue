<script setup lang="ts">
const route = useRoute()
const login = computed(() => String(route.params.login))
const slug = computed(() => String(route.params.slug))

const { data: collection, error } = await useFetch(
  () => `/api/collections/by-author/${login.value}/${slug.value}`,
  { key: () => `collection-${login.value}-${slug.value}` },
)

if (error.value)
  throw createError({ statusCode: 404, message: 'Collection not found', fatal: true })

const installCmd = computed(() => collection.value ? collectionInstallCmd(login.value, slug.value) : '')
const manifestPath = computed(() => `/api/collections/by-author/${login.value}/${slug.value}/manifest`)
const skillCount = computed(() => collection.value?.skills.length ?? 0)
const repositoryCount = computed(() => new Set(
  collection.value?.skills.map(skill => `${skill.owner}/${skill.repo}`) ?? [],
).size)
const updatedAt = computed(() => collection.value?.updatedAt
  ? new Date(collection.value.updatedAt * 1000)
  : null)
const installTarget = computed(() => ({
  kind: 'collection' as const,
  handle: login.value,
  slug: slug.value,
}))
const { copy, copied } = useInstallCopy(installCmd, 'collection-page', 'install', installTarget)

useSeoMeta({
  // The global titleTemplate appends ` · skilld`; repeating it here produced
  // "Apple Apps · @harlan-zw · skilld · skilld".
  title: () => collection.value ? `${collection.value.name} · @${login.value}` : 'Collection',
  description: () => collection.value?.preamble ?? `Skill collection by @${login.value}`,
})

const canonicalUrl = computed(() => `https://skilld.dev/@${login.value}/${slug.value}`)
useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

const collectionOgProps = computed(() => collection.value
  ? resolveCollectionOgProps(collection.value)
  : null)

defineOgImage('Collection.takumi', {
  name: () => collectionOgProps.value?.name ?? '',
  description: () => collectionOgProps.value?.description ?? '',
  curatorHandle: () => collectionOgProps.value?.curatorHandle ?? login.value,
  curatorName: () => collectionOgProps.value?.curatorName ?? login.value,
  curatorAvatar: () => collectionOgProps.value?.curatorAvatar ?? '',
  skillCount: () => collectionOgProps.value?.skillCount ?? 0,
  skills: () => collectionOgProps.value?.skills ?? [],
  reason: () => collectionOgProps.value?.reason ?? '',
  reasonSkill: () => collectionOgProps.value?.reasonSkill ?? '',
}, {
  alt: () => `${collectionOgProps.value?.name ?? 'Collection'} by @${login.value} on skilld`,
})

function collectionSkillPath(skill: { registryPath: string }) {
  return skill.registryPath
}

function collectionSkillLabel(skill: { repo: string, name?: string | null }) {
  return skill.name ? `/${skill.name}` : skill.repo
}

function collectionSkillTitle(skill: { repo: string, name?: string | null, displayName?: string | null }) {
  return skill.displayName || collectionSkillLabel(skill)
}

function collectionSkillMeta(skill: { owner: string, repo: string, name?: string | null }) {
  const source = `${skill.owner}/${skill.repo}`
  return skill.name ? `${collectionSkillLabel(skill)} · ${source}` : source
}
</script>

<template>
  <article v-if="collection" class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
    <header>
      <div class="flex flex-wrap items-center justify-between gap-3">
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
            :src="`https://github.com/${login}.png?size=64`"
            alt=""
            width="32"
            height="32"
            class="size-8 rounded-full border border-default bg-muted"
            fetchpriority="high"
          >
          <span>
            <span class="data-label block">Curated by</span>
            <span class="block font-mono text-sm text-default">@{{ login }}</span>
          </span>
        </NuxtLink>

        <UBadge
          v-if="collection.featured"
          label="Featured collection"
          icon="i-lucide-star"
          color="primary"
          variant="solid"
          class="min-h-7"
        />
      </div>

      <h1 class="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {{ collection.name }}
      </h1>
      <p
        v-if="collection.preamble"
        class="mt-4 max-w-3xl text-base leading-relaxed text-muted text-pretty"
      >
        {{ collection.preamble }}
      </p>

      <dl class="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-y border-default py-3">
        <div class="flex items-baseline gap-2">
          <dt class="data-label">
            Skills
          </dt>
          <dd class="font-mono text-sm tabular-nums">
            {{ skillCount }}
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
        <div v-if="updatedAt" class="flex items-baseline gap-2">
          <dt class="data-label">
            Updated
          </dt>
          <dd class="font-mono text-sm">
            <NuxtTime
              :datetime="updatedAt"
              locale="en"
              relative
              numeric="auto"
              relative-style="long"
              :title="true"
            />
          </dd>
        </div>
      </dl>
    </header>

    <div class="mt-10 grid min-w-0 grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start lg:gap-14">
      <aside class="min-w-0 md:sticky md:top-24 md:col-start-2 md:row-start-1" aria-labelledby="install-heading">
        <section class="rounded-lg border border-default bg-elevated p-4">
          <h2 id="install-heading" class="text-base font-semibold">
            Install collection
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            One command installs all {{ skillCount }} skills in this collection.
          </p>

          <figure class="mt-4">
            <figcaption class="sr-only">
              Collection install command
            </figcaption>
            <InstallCommand
              :command="installCmd"
              wrap
              tabindex="0"
              class="block rounded-lg bg-muted px-3 py-3 text-xs leading-relaxed"
            />
          </figure>

          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copied' : 'Copy command'"
            block
            size="md"
            class="mt-3 min-h-11"
            :aria-label="copied ? 'Install command copied' : 'Copy install command'"
            @click="copy()"
          />
          <span aria-live="polite" class="sr-only">{{ copied ? 'Install command copied to clipboard' : '' }}</span>

          <AgentTargets class="mt-3" />

          <div class="mt-3 flex flex-col items-stretch gap-2 border-t border-default pt-3 sm:flex-row md:flex-col">
            <WatchCollectionButton :login="login" :slug="slug" />
            <UButton
              :to="manifestPath"
              target="_blank"
              label="View manifest"
              icon="i-lucide-file-json"
              trailing-icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="ghost"
              size="sm"
              class="min-h-11 justify-start"
              aria-label="View collection manifest (opens in a new tab)"
            />
          </div>
        </section>
      </aside>

      <section class="min-w-0 md:col-start-1 md:row-start-1" aria-labelledby="skills-heading">
        <div class="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="skills-heading" class="text-xl font-semibold tracking-tight">
              Included skills
            </h2>
          </div>
          <span class="data-label shrink-0">{{ skillCount }} total</span>
        </div>

        <ol
          v-if="collection.skills.length"
          class="editorial-ledger list-none p-0"
        >
          <li
            v-for="(skill, index) in collection.skills"
            :key="`${skill.owner}/${skill.repo}/${skill.position}`"
            class="group -mx-3 flex gap-3 px-3 py-5 transition-colors duration-200 hover:bg-elevated focus-within:bg-elevated sm:gap-4"
          >
            <span class="data-label w-6 shrink-0 pt-3 text-right" aria-hidden="true">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
            <img
              :src="`https://github.com/${skill.owner}.png?size=64`"
              alt=""
              width="32"
              height="32"
              class="mt-1.5 size-8 shrink-0 rounded-md border border-default bg-muted"
              loading="lazy"
              decoding="async"
            >
            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="collectionSkillPath(skill)"
                class="inline-flex min-h-11 max-w-full items-center gap-2 font-mono text-sm font-medium transition-colors duration-200 hover:text-muted"
              >
                <span class="truncate">{{ collectionSkillTitle(skill) }}</span>
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1 group-focus-within:translate-x-1"
                  aria-hidden="true"
                />
              </NuxtLink>
              <p class="data-label -mt-1 truncate">
                {{ collectionSkillMeta(skill) }}
              </p>
              <p
                v-if="skill.reason"
                class="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base"
              >
                {{ skill.reason }}
              </p>
            </div>
          </li>
        </ol>
        <div v-else class="editorial-state flex items-center gap-4">
          <UIcon name="i-lucide-package-open" class="size-6 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <h3 class="font-mono text-sm font-medium">
              No skills included yet
            </h3>
            <p class="mt-1 text-sm text-muted">
              This collection is ready, but its curator has not added any skills.
            </p>
          </div>
        </div>
      </section>
    </div>
  </article>
</template>
