<script setup lang="ts">
const authModalOpen = inject<Ref<boolean>>('authModalOpen', ref(false))
const { copy: copyCli, copied: copiedCli } = useClipboard({ source: 'npx skilld' })

const copiedCollectionSlug = ref<string | null>(null)
function copyCollectionCmd(collection: typeof collections[number]) {
  const cmd = `skilld add @${collection.curator.handle}/${collection.slug}`
  navigator.clipboard.writeText(cmd)
  copiedCollectionSlug.value = collection.slug
  setTimeout(() => {
    if (copiedCollectionSlug.value === collection.slug)
      copiedCollectionSlug.value = null
  }, 2000)
}

const stats = {
  packages: 142,
  curators: 23,
  agents: 11,
  skills: 890,
}

const curators = [
  {
    name: 'Harlan Wilton',
    handle: 'harlanzw',
    avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:hvv3hamgocficqdvp5llrkha/bafkreiavmyyhzu7btkmfjzdffyjysxsvwxbiybi3f2yzawygwfdqs5wjc4',
    bio: 'Nuxt core team. Building skilld, nuxt-seo, unhead.',
    stacks: ['Nuxt', 'Vue', 'TypeScript', 'Tailwind CSS'],
    collections: 3,
    skillCount: 18,
    topSkills: ['vue', 'nuxt', '@nuxt/ui', 'motion-v', 'nuxt-og-image', 'tailwindcss'],
    updated: '2d ago',
  },
  {
    name: 'Daniel Roe',
    handle: 'danielroe',
    avatar: 'https://ui-avatars.com/api/?name=Daniel+Roe&background=292524&color=a8a29e&format=svg',
    bio: 'Nuxt lead. TypeScript, Nitro, UnJS ecosystem.',
    stacks: ['Nuxt', 'Nitro', 'UnJS', 'TypeScript'],
    collections: 2,
    skillCount: 14,
    topSkills: ['nuxt', 'nitro', 'h3', 'ofetch', 'unimport', 'typescript'],
    updated: '5d ago',
  },
  {
    name: 'Anthony Fu',
    handle: 'antfu',
    avatar: 'https://ui-avatars.com/api/?name=Anthony+Fu&background=292524&color=a8a29e&format=svg',
    bio: 'Vue, Vite, Nuxt core team. UnoCSS, Slidev, VueUse.',
    stacks: ['Vue', 'Vite', 'UnoCSS', 'TypeScript'],
    collections: 4,
    skillCount: 22,
    topSkills: ['vue', 'vite', 'unocss', 'vitest', '@vueuse/core', 'unplugin'],
    updated: '1d ago',
  },
  {
    name: 'Evan You',
    handle: 'yyx990803',
    avatar: 'https://ui-avatars.com/api/?name=Evan+You&background=292524&color=a8a29e&format=svg',
    bio: 'Creator of Vue.js and Vite.',
    stacks: ['Vue', 'Vite', 'Rolldown', 'TypeScript'],
    collections: 2,
    skillCount: 8,
    topSkills: ['vue', 'vite', 'rolldown', 'typescript'],
    updated: '1w ago',
  },
  {
    name: 'Pooya Parsa',
    handle: 'pi0',
    avatar: 'https://ui-avatars.com/api/?name=Pooya+Parsa&background=292524&color=a8a29e&format=svg',
    bio: 'UnJS, Nitro, H3. Infrastructure for the JS ecosystem.',
    stacks: ['UnJS', 'Nitro', 'H3', 'TypeScript'],
    collections: 2,
    skillCount: 16,
    topSkills: ['nitro', 'h3', 'ofetch', 'unstorage', 'unenv', 'citty'],
    updated: '3d ago',
  },
  {
    name: 'Kevin Deng',
    handle: 'sxzz',
    avatar: 'https://ui-avatars.com/api/?name=Kevin+Deng&background=292524&color=a8a29e&format=svg',
    bio: 'Vue core team. Compiler work, unplugin, ast-grep.',
    stacks: ['Vue', 'TypeScript', 'Compiler', 'Tooling'],
    collections: 1,
    skillCount: 10,
    topSkills: ['vue', 'unplugin', 'ast-grep', 'typescript'],
    updated: '4d ago',
  },
]

const collections = [
  {
    name: 'Nuxt Production Stack',
    slug: 'nuxt-production',
    icon: 'i-simple-icons-nuxtdotjs',
    description: 'Full Nuxt setup for production apps. Vue 3, Nuxt modules, Tailwind, and TypeScript conventions.',
    curator: curators[0]!,
    skillCount: 6,
    skills: ['vue', 'nuxt', 'typescript', 'tailwindcss', '@nuxt/ui', 'nuxt-og-image'],
    installs: 340,
    updated: '2d ago',
  },
  {
    name: 'UnJS Core',
    slug: 'unjs-core',
    icon: 'i-simple-icons-javascript',
    description: 'The foundational UnJS packages. Server framework, HTTP, fetch, storage, and environment.',
    curator: curators[4]!,
    skillCount: 6,
    skills: ['nitro', 'h3', 'ofetch', 'unstorage', 'unenv', 'citty'],
    installs: 210,
    updated: '3d ago',
  },
  {
    name: 'Vue Design Engineer',
    slug: 'vue-design-engineer',
    icon: 'i-simple-icons-vuedotjs',
    description: 'Skills for building polished Vue interfaces. Motion, components, images, and design tools.',
    curator: curators[0]!,
    skillCount: 5,
    skills: ['vue', 'motion-v', '@nuxt/ui', 'tailwindcss', 'nuxt-og-image'],
    installs: 185,
    updated: '4d ago',
  },
  {
    name: 'Vite Ecosystem',
    slug: 'vite-ecosystem',
    icon: 'i-simple-icons-vite',
    description: 'Vite and its surrounding tooling. Build, test, lint, and develop with the modern stack.',
    curator: curators[2]!,
    skillCount: 5,
    skills: ['vite', 'vitest', 'unocss', 'unplugin', '@vueuse/core'],
    installs: 290,
    updated: '1d ago',
  },
]

const expandedCollection = ref<string | null>(null)

function toggleCollection(slug: string) {
  expandedCollection.value = expandedCollection.value === slug ? null : slug
}
</script>

<template>
  <div>
    <!-- Hero: compact, search-forward -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-10 md:pt-24 md:pb-14"
      aria-labelledby="hero-heading"
    >
      <div class="max-w-2xl">
        <h1
          id="hero-heading"
          class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
        >
          Curated agent skills from trusted open-source developers
        </h1>
        <p class="mt-3 text-sm text-[var(--ui-text-muted)] max-w-lg leading-relaxed">
          Developers curate the skills that power their workflow.
          Follow curators, install collections, keep your agent current.
        </p>

        <!-- Hero CTAs -->
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <UButton
            to="#curators"
            label="Browse curators"
            icon="i-lucide-users"
            size="sm"
          />
          <UButton
            :icon="copiedCli ? 'i-lucide-check' : 'i-lucide-terminal'"
            :label="copiedCli ? 'Copied' : 'npx skilld'"
            size="sm"
            color="neutral"
            variant="outline"
            :aria-label="copiedCli ? 'Copied to clipboard' : 'Copy npx skilld command'"
            @click="copyCli('npx skilld')"
          />
          <!-- Screen reader announcement for copy -->
          <span
            aria-live="polite"
            class="sr-only"
          >{{ copiedCli ? 'Command copied to clipboard' : '' }}</span>
        </div>
      </div>

      <!-- Stats bar: quiet data strip -->
      <dl class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div class="data-label">
          <dt class="sr-only">
            Packages
          </dt>
          <dd>{{ stats.packages }} packages</dd>
        </div>
        <div class="data-label">
          <dt class="sr-only">
            Curators
          </dt>
          <dd>{{ stats.curators }} curators</dd>
        </div>
        <div class="data-label">
          <dt class="sr-only">
            Agents
          </dt>
          <dd>{{ stats.agents }} agents</dd>
        </div>
        <div class="data-label">
          <dt class="sr-only">
            Skills generated
          </dt>
          <dd>{{ stats.skills }} skills generated</dd>
        </div>
      </dl>
    </section>

    <UDivider />

    <!-- Curators -->
    <section
      id="curators"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="curators-heading"
    >
      <h2
        id="curators-heading"
        class="section-label mb-6"
      >
        Curators
      </h2>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="curator in curators"
          :key="curator.handle"
          :to="`/people/${curator.handle}`"
          :aria-label="`${curator.name}, ${curator.skillCount} skills, ${curator.collections} collections`"
          class="group block rounded-lg border border-[var(--ui-border)] p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
        >
          <div class="flex items-start gap-3">
            <img
              :src="curator.avatar"
              :alt="`Avatar for ${curator.name}`"
              width="36"
              height="36"
              class="size-9 rounded-full"
            >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ curator.name }}
              </p>
              <p class="font-mono text-xs text-[var(--ui-text-muted)]">
                @{{ curator.handle }}
              </p>
            </div>
          </div>

          <p class="mt-3 text-xs text-[var(--ui-text-muted)] leading-relaxed line-clamp-2">
            {{ curator.bio }}
          </p>

          <!-- Top-level: simplified metrics -->
          <div
            class="mt-3 flex items-center gap-3"
            aria-hidden="true"
          >
            <span class="data-label">{{ curator.skillCount }} skills</span>
            <span class="data-label">{{ curator.collections }} {{ curator.collections === 1 ? 'collection' : 'collections' }}</span>
            <span class="data-label ml-auto">{{ curator.updated }}</span>
          </div>

          <!-- Progressive: stack badges -->
          <div class="mt-3 flex flex-wrap gap-1">
            <UBadge
              v-for="stack in curator.stacks.slice(0, 3)"
              :key="stack"
              :label="stack"
              variant="subtle"
              color="neutral"
              size="xs"
            />
            <UBadge
              v-if="curator.stacks.length > 3"
              :label="`+${curator.stacks.length - 3}`"
              variant="subtle"
              color="neutral"
              size="xs"
            />
          </div>
        </NuxtLink>
      </div>
    </section>

    <UDivider />

    <!-- Collections -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="collections-heading"
    >
      <h2
        id="collections-heading"
        class="section-label mb-6"
      >
        Collections
      </h2>

      <!-- Screen reader announcement for copy -->
      <span
        aria-live="polite"
        class="sr-only"
      >{{ copiedCollectionSlug ? 'Install command copied to clipboard' : '' }}</span>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <article
          v-for="collection in collections"
          :key="collection.slug"
          class="rounded-lg border border-[var(--ui-border)] transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
        >
          <!-- Top-level: name, curator, one metric -->
          <div class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0">
                <UIcon
                  :name="collection.icon"
                  class="size-5 shrink-0 mt-0.5 text-[var(--ui-text-muted)]"
                  aria-hidden="true"
                />
                <div class="min-w-0">
                  <h3 class="font-mono text-sm font-medium">
                    <NuxtLink
                      :to="`/people/${collection.curator.handle}/${collection.slug}`"
                      class="hover:text-[var(--ui-text-muted)] transition-colors"
                    >
                      {{ collection.name }}
                    </NuxtLink>
                  </h3>
                  <p class="mt-1 text-xs text-[var(--ui-text-muted)] leading-relaxed line-clamp-2">
                    {{ collection.description }}
                  </p>
                </div>
              </div>
              <button
                class="mt-0.5 shrink-0 rounded p-1 text-[var(--ui-text-muted)] transition-colors hover:text-[var(--ui-text)]"
                :aria-label="`${expandedCollection === collection.slug ? 'Collapse' : 'Expand'} ${collection.name}`"
                :aria-expanded="expandedCollection === collection.slug"
                @click="toggleCollection(collection.slug)"
              >
                <UIcon
                  :name="expandedCollection === collection.slug ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div class="mt-3 flex items-center gap-3">
              <img
                :src="collection.curator.avatar"
                :alt="`Avatar for ${collection.curator.name}`"
                width="20"
                height="20"
                class="size-5 rounded-full"
              >
              <span class="text-xs">{{ collection.curator.name }}</span>
              <span class="data-label ml-auto">{{ collection.skillCount }} skills</span>
              <span class="data-label">{{ collection.installs }} installs</span>
              <span class="data-label">{{ collection.updated }}</span>
            </div>
          </div>

          <!-- Progressive: expanded detail -->
          <div
            v-if="expandedCollection === collection.slug"
            class="border-t border-[var(--ui-border)] px-4 py-3"
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
              <code class="flex-1 truncate rounded bg-[var(--ui-bg-muted)] px-2.5 py-1.5 font-mono text-xs text-[var(--ui-text-muted)]">
                skilld add @{{ collection.curator.handle }}/{{ collection.slug }}
              </code>
              <UButton
                :icon="copiedCollectionSlug === collection.slug ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="copiedCollectionSlug === collection.slug ? 'Copied' : `Copy install command for ${collection.name}`"
                @click="copyCollectionCmd(collection)"
              />
            </div>
          </div>
        </article>
      </div>
    </section>

    <UDivider />

    <!-- How it works: compact steps -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="how-heading"
    >
      <h2
        id="how-heading"
        class="section-label mb-6"
      >
        How it works
      </h2>

      <ol class="grid grid-cols-1 gap-3 sm:grid-cols-3 list-none p-0">
        <li class="rounded-lg border border-[var(--ui-border)] p-4">
          <span
            class="data-label"
            aria-hidden="true"
          >01</span>
          <p class="mt-2 text-sm font-medium">
            Add packages
          </p>
          <p class="mt-1 text-xs text-[var(--ui-text-muted)] leading-relaxed">
            Run <code class="rounded bg-[var(--ui-bg-muted)] px-1 py-0.5 font-mono text-xs">skilld add vue nuxt</code> to generate skills from any npm package docs.
          </p>
        </li>
        <li class="rounded-lg border border-[var(--ui-border)] p-4">
          <span
            class="data-label"
            aria-hidden="true"
          >02</span>
          <p class="mt-2 text-sm font-medium">
            Follow curators
          </p>
          <p class="mt-1 text-xs text-[var(--ui-text-muted)] leading-relaxed">
            Install a curator's collection with one command. Their skill set becomes your agent's context.
          </p>
        </li>
        <li class="rounded-lg border border-[var(--ui-border)] p-4">
          <span
            class="data-label"
            aria-hidden="true"
          >03</span>
          <p class="mt-2 text-sm font-medium">
            Stay current
          </p>
          <p class="mt-1 text-xs text-[var(--ui-text-muted)] leading-relaxed">
            Skills update when packages release. Run <code class="rounded bg-[var(--ui-bg-muted)] px-1 py-0.5 font-mono text-xs">skilld update</code> to regenerate from latest docs.
          </p>
        </li>
      </ol>
    </section>

    <UDivider />

    <!-- CTA: publish your collection -->
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
      aria-labelledby="cta-heading"
    >
      <div class="rounded-lg border border-[var(--ui-border)] p-6 sm:p-8 text-center">
        <h2
          id="cta-heading"
          class="font-mono text-lg font-medium"
        >
          Publish your collection
        </h2>
        <p class="mt-2 text-sm text-[var(--ui-text-muted)] max-w-md mx-auto">
          Curate your skills, publish a collection, share your install link.
          Anyone can run <code class="rounded bg-[var(--ui-bg-muted)] px-1 py-0.5 font-mono text-xs">skilld add @you</code> to get your setup.
        </p>
        <div class="mt-5 flex items-center justify-center gap-3">
          <UButton
            label="Connect with Bluesky"
            icon="i-lucide-cloud"
            trailing-icon="i-lucide-arrow-right"
            size="sm"
            @click="authModalOpen = true"
          />
          <UButton
            to="/skills"
            label="Browse skills"
            icon="i-lucide-search"
            size="sm"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>
    </section>
  </div>
</template>
