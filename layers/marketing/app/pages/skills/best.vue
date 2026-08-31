<script setup lang="ts">
interface EssentialSkill {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
  stars: number
  trustTier: string
  registryPath: string
}

interface EssentialResponse {
  items: EssentialSkill[]
  total: number
}

// `await`, for the reason documented at length in [cluster].vue: without it the
// server renders before the request settles and ships an empty shell.
const { data } = await useFetch<EssentialResponse>('/api/skills/essential')

const skills = computed(() => data.value?.items ?? [])
const total = computed(() => skills.value.length)
const ownerCount = computed(() => new Set(skills.value.map(s => s.owner)).size)

// "Best" is a superlative, which brand-guidelines.md bans *without evidence*
// and permits with it: "If something is genuinely the best at something
// specific, say why with evidence." The evidence is the admission bar, stated
// on the page and reconstructible from the data: every skill here passed human
// admission, resolves to a readable SKILL.md in its author's repo, and holds
// official or trusted-curator standing. The page leads with those criteria
// rather than asserting a ranking and hoping.
const title = 'Best Agent Skills, Reviewed and Ranked'
const description = computed(() =>
  `${total.value} agent skills that passed review, one per author, each from a maintainer you can name. Works with Claude Code, Cursor, and Codex. Read the SKILL.md in the author's own repo before you install.`,
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  // Same guard as the category pages: a list this thin is not worth indexing,
  // and an empty one is the scaled-content shape that suppressed the site.
  robots: () => (total.value >= 10 ? 'index,follow' : 'noindex,follow'),
})

useHead({
  link: [{ rel: 'canonical', href: 'https://skilld.dev/skills/best' }],
})

defineOgImage('Page.takumi', {
  title: 'Skills worth installing',
  description: 'Reviewed agent skills, one per author, with the source one click away.',
}, { alt: 'Reviewed agent skills on skilld' })

function trustLabel(tier: string): string {
  if (tier === 'official')
    return 'Official source'
  if (tier === 'trusted-curator')
    return 'Trusted curator'
  return 'Trusted author'
}
</script>

<template>
  <div>
    <CompactPageHeader
      title="Skills worth installing"
      description="Every skill here passed review, comes from a maintainer you can name, and links to the SKILL.md you can read before you run it. One per author, so no single repository takes the list."
      heading-id="best-heading"
    >
      <template #aside>
        <dl class="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
          <div>
            <dt class="data-label">
              Skills
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ total }}
            </dd>
          </div>
          <div>
            <dt class="data-label">
              Authors
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ ownerCount }}
            </dd>
          </div>
        </dl>
      </template>

      <div class="flex flex-wrap gap-3">
        <UButton
          to="/skills"
          label="Browse the directory"
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-left"
          class="min-h-11"
        />
      </div>
    </CompactPageHeader>

    <section
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="best-list-heading"
    >
      <h2 id="best-list-heading" class="sr-only">
        Reviewed skills
      </h2>

      <ol class="editorial-ledger list-none p-0">
        <li v-for="(skill, index) in skills" :key="`${skill.owner}/${skill.repo}/${skill.name}`">
          <NuxtLink
            :to="skill.registryPath"
            class="best-row group"
          >
            <span class="best-rank">{{ String(index + 1).padStart(2, '0') }}</span>
            <img
              :src="`https://github.com/${skill.owner}.png?size=80`"
              alt=""
              width="40"
              height="40"
              class="size-10 rounded-full border border-default bg-muted"
              loading="lazy"
              decoding="async"
            >
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-medium text-default">{{ skill.displayName || skill.name }}</span>
                <span class="font-mono text-xs text-muted">{{ skill.owner }}/{{ skill.repo }}</span>
              </span>
              <span v-if="skill.description" class="mt-1 block text-sm leading-relaxed text-muted">
                {{ skill.description }}
              </span>
              <span class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{{ trustLabel(skill.trustTier) }}</span>
                <span class="font-mono tabular-nums">{{ skill.stars.toLocaleString() }} stars</span>
              </span>
            </span>
          </NuxtLink>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.best-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--ui-border);
  transition: opacity 200ms ease;
}

.best-row:hover {
  opacity: 0.7;
}

.best-rank {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
  padding-top: 0.75rem;
}
</style>
