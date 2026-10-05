<script setup lang="ts">
import type { TrendingFeedResponse } from '~~/server/api/feed/trending.get'
import type { SkillChange } from '#shared/change-grid'
import { brailleSpark } from '#shared/braille-spark'

interface SkillRef {
  owner: string
  repo: string
  name: string
}

useSeoMeta({
  title: 'Brand kit',
  description: 'The skilld brand motifs in each of their states: the braille spark, the run chip, the change grid, and three dot textures.',
  robots: 'noindex, follow',
})

const DAY = 86_400
// One clock for the server render and the browser, so relative dates hydrate unchanged.
const now = useState('brand-kit-now', () => Math.floor(Date.now() / 1000))

// This week's trending Skills, so the run chips and the braille names show real registry entries.
const { data: trending } = await useFetch('/api/feed/trending', {
  key: 'brand-kit-trending',
  query: { limit: 12 },
  transform: (feed: TrendingFeedResponse): SkillRef[] => {
    const named = feed.namedSkills.map(skill => ({ owner: skill.owner, repo: skill.repo, name: skill.name }))
    const fromRepos = feed.items.flatMap(item => item.skills.map(skill => ({ owner: item.owner, repo: item.repo, name: skill.slug })))
    const seen = new Set<string>()
    return [...named, ...fromRepos].filter((skill) => {
      const key = `${skill.owner}/${skill.repo}/${skill.name}`
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    })
  },
})

/** Real registry Skills, for when the trending board is empty. */
const REGISTRY_SKILLS: SkillRef[] = [
  { owner: 'mattpocock', repo: 'skills', name: 'tdd' },
  { owner: 'pbakaus', repo: 'impeccable', name: 'impeccable' },
  { owner: 'addyosmani', repo: 'web-quality-skills', name: 'performance' },
  { owner: 'anthropics', repo: 'skills', name: 'frontend-design' },
]

const isTrending = computed(() => (trending.value?.length ?? 0) >= 4)
const skills = computed(() => isTrending.value ? trending.value! : REGISTRY_SKILLS)
const lead = computed(() => skills.value[0]!)
const listRows = computed(() => skills.value.slice(1, 4))
const skillNames = computed(() => isTrending.value
  ? skills.value.map(skill => `${skill.owner}/${skill.repo}/${skill.name}`)
  : [])
const source = computed(() => isTrending.value ? 'this week\'s trending board' : 'the registry')

// Real SKILL.md files for the minimap. Loaded in the browser, after the page, because the texture is decoration.
const { data: minimapSources } = useAsyncData('brand-kit-minimap', async () => {
  const refs = skills.value.slice(0, 3)
  const files = await Promise.all(refs.map(skill =>
    $fetch<string>(`/api/skills-raw/${skill.owner}/${skill.repo}/${skill.name}`, { responseType: 'text' })
      .catch((error: unknown) => {
        // A missing file leaves that column generated, which the caption already allows for.
        console.warn('[brand-kit] Could not load SKILL.md for the minimap:', error)
        return null
      }),
  ))
  return files.filter((file): file is string => typeof file === 'string' && file.length > 0)
}, { server: false, default: () => [] as string[] })

// Example data: mention counts and Skill changes. The Skill names are real registry entries.
const sparkRows = [
  { name: 'tdd', repo: 'mattpocock/skills', state: 'Rising', counts: [3, 5, 4, 8, 12, 19, 31] },
  { name: 'impeccable', repo: 'pbakaus/impeccable', state: 'Steady', counts: [9, 8, 11, 10, 12, 14, 13] },
  { name: 'performance', repo: 'addyosmani/web-quality-skills', state: 'A day with no posts', counts: [1, 0, 2, 2, 6, 9, 7] },
  { name: 'frontend-design', repo: 'anthropics/skills', state: 'No posts today', counts: [6, 4, 3, 1, 0, 0, 0] },
]
const sum = (counts: readonly number[]) => counts.reduce((total, count) => total + count, 0)
const plainDate = computed(() => new Date(now.value * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
const plainText = computed(() => {
  const width = Math.max(...sparkRows.map(row => row.name.length))
  return [
    'Trending skills this week',
    '',
    ...sparkRows.map((row, index) => `${index + 1}  ${row.name.padEnd(width)}  ${String(sum(row.counts)).padStart(3)}  ${brailleSpark(row.counts)}`),
    '',
    `7-day social mentions · ${plainDate.value}`,
  ].join('\n')
})

const ago = (days: number) => now.value - days * DAY
const changeRows = computed<{ name: string, repo: string, state: string, fromFirst: boolean, changes: SkillChange[] }[]>(() => [
  {
    name: 'tdd',
    repo: 'mattpocock/skills',
    state: 'Minor, major, and first version',
    fromFirst: true,
    changes: [
      { at: ago(2), version: '2.1.0', note: 'Added a refactor checklist' },
      { at: ago(33), version: '2.0.0', note: 'Split the red and green steps' },
      { at: ago(61), version: '1.0.0', note: 'First version' },
    ],
  },
  {
    name: 'impeccable',
    repo: 'pbakaus/impeccable',
    state: 'Major, patch, and first version',
    fromFirst: true,
    changes: [
      { at: ago(12), version: '2.0.0', note: 'New motion section' },
      { at: ago(40), version: '1.0.1', note: 'Tightened the colour rules' },
      { at: ago(80), version: '1.0.0', note: 'First version' },
    ],
  },
  {
    name: 'performance',
    repo: 'addyosmani/web-quality-skills',
    state: 'No declared version, so plain dots',
    fromFirst: false,
    changes: [
      { at: ago(5), note: 'Updated the INP thresholds' },
      { at: ago(9), note: 'Added image checks' },
      { at: ago(70), note: 'Reworded the audit steps' },
    ],
  },
  {
    name: 'frontend-design',
    repo: 'anthropics/skills',
    state: 'No changes',
    fromFirst: false,
    changes: [],
  },
])

const legend = [
  { label: 'patch or no known bump', dot: 2.3, rings: [] as number[], newest: false },
  { label: 'minor', dot: 1.8, rings: [3.7], newest: false },
  { label: 'major', dot: 1.8, rings: [3.7, 5.9], newest: false },
  { label: 'first version', dot: 0, rings: [3.7], newest: false },
  { label: 'newest change', dot: 2.3, rings: [] as number[], newest: true },
]
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 md:py-16">
    <header class="max-w-2xl">
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
        Brand kit
      </h1>
      <p class="data-label mt-3">
        4 motifs · 3 textures
      </p>
      <p class="mt-4 text-base leading-relaxed text-muted">
        The dot is the atom. Stone dots are the noise. One rose dot is the Skill you picked, and each motif spends it once.
      </p>
      <NuxtLink
        to="/brand-kit/github-badge"
        class="mt-4 inline-flex min-h-11 items-center font-mono text-sm text-muted underline decoration-default underline-offset-4 hover:text-default"
      >
        GitHub badge
      </NuxtLink>
    </header>

    <!-- Braille spark -->
    <section class="mt-12 border-t border-default pt-10" aria-labelledby="spark-heading">
      <h2 id="spark-heading" class="text-xl font-semibold text-highlighted">
        Braille spark
      </h2>
      <p class="data-label mt-2">
        Seven days as seven braille bars. Today is rose.
      </p>
      <div class="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <!-- `.editorial-ledger` resets its own margin, so the heading carries the gap. -->
          <h3 class="section-label mb-3">
            On the site
          </h3>
          <ol class="editorial-ledger">
            <li
              v-for="(row, index) in sparkRows"
              :key="row.name"
              class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3"
            >
              <span class="data-label">{{ index + 1 }}</span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-highlighted">{{ row.name }}</span>
                <span class="data-label block truncate">{{ row.state }}</span>
              </span>
              <BrailleSpark :counts="row.counts" />
            </li>
          </ol>
        </div>
        <div>
          <h3 class="section-label">
            As plain text
          </h3>
          <pre class="mt-3 overflow-x-auto rounded-lg border border-default bg-muted px-4 py-3 font-mono text-xs leading-relaxed text-default">{{ plainText }}</pre>
          <p class="data-label mt-2">
            The same string works in the weekly email, in Discord, and in a terminal.
          </p>
        </div>
      </div>
      <p class="data-label mt-4">
        Example counts.
      </p>
    </section>

    <!-- Run chip -->
    <section class="mt-12 border-t border-default pt-10" aria-labelledby="run-heading">
      <h2 id="run-heading" class="text-xl font-semibold text-highlighted">
        Run chip
      </h2>
      <p class="data-label mt-2">
        Run is the default and writes nothing. Install is the opt-in and adds files.
      </p>
      <div class="mt-6 grid gap-8 md:grid-cols-2">
        <div class="min-w-0">
          <h3 class="section-label">
            Switch
          </h3>
          <div class="mt-3 max-w-md">
            <RunChip
              :owner="lead.owner"
              :repo="lead.repo"
              :skill="lead.name"
              surface="brand-kit-run-chip"
            />
          </div>
        </div>
        <div class="min-w-0">
          <h3 class="section-label mb-3">
            List row
          </h3>
          <ul class="editorial-ledger">
            <li
              v-for="skill in listRows"
              :key="`${skill.owner}/${skill.repo}/${skill.name}`"
              class="grid gap-2 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-center sm:gap-4"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-highlighted">{{ skill.name }}</span>
                <span class="data-label block truncate">{{ skill.owner }}/{{ skill.repo }}</span>
              </span>
              <RunChip
                :owner="skill.owner"
                :repo="skill.repo"
                :skill="skill.name"
                surface="brand-kit-run-chip-compact"
                variant="compact"
              />
            </li>
          </ul>
        </div>
      </div>
      <div class="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-default py-4">
        <h3 class="font-mono text-xs text-muted">
          Teach your agent skilld
        </h3>
        <SkilldInstallChip surface="brand-kit-skilld-install" />
      </div>
      <p class="data-label mt-4">
        Skills from {{ source }}.
      </p>
    </section>

    <!-- Change grid -->
    <section class="mt-12 border-t border-default pt-10" aria-labelledby="change-heading">
      <h2 id="change-heading" class="text-xl font-semibold text-highlighted">
        Change grid
      </h2>
      <p class="data-label mb-6 mt-2">
        13 weeks of changes. Today is bottom right. The newest change is rose.
      </p>
      <ul class="editorial-ledger">
        <li
          v-for="row in changeRows"
          :key="row.name"
          class="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-highlighted">{{ row.name }}</span>
            <span class="data-label block truncate">{{ row.repo }}</span>
            <span class="data-label mt-1 block">{{ row.state }}</span>
          </span>
          <ChangeGrid
            :name="row.name"
            :changes="row.changes"
            :from-first="row.fromFirst"
            :now="now"
            class="sm:w-60"
          />
        </li>
      </ul>
      <ul class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Change grid key">
        <li
          v-for="item in legend"
          :key="item.label"
          class="data-label inline-flex items-center gap-1.5"
        >
          <svg
            viewBox="-7 -7 14 14"
            class="size-3.5 overflow-visible"
            :class="item.newest ? 'text-[var(--brand-dot)]' : 'text-default opacity-70'"
            aria-hidden="true"
          >
            <circle v-if="item.dot" :r="item.dot" fill="currentColor" />
            <circle
              v-for="ring in item.rings"
              :key="ring"
              :r="ring"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
            />
          </svg>
          {{ item.label }}
        </li>
      </ul>
      <p class="data-label mt-4">
        Example versions and notes. Hover, tap, or press a grid to read each change.
      </p>
    </section>

    <!-- Textures -->
    <section class="mt-12 border-t border-default pt-10" aria-labelledby="texture-heading">
      <h2 id="texture-heading" class="text-xl font-semibold text-highlighted">
        Textures
      </h2>
      <p class="data-label mt-2">
        Three dot fields, one job each. Each one stills under reduced motion.
      </p>
      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <figure class="m-0 min-w-0">
          <div class="relative h-56 overflow-hidden rounded-lg border border-default bg-muted">
            <TextureBrailleNames :names="skillNames" />
          </div>
          <figcaption class="mt-3">
            <span class="block font-mono text-sm text-default">Braille names</span>
            <span class="mt-1 block text-sm leading-relaxed text-muted">Skill names read as braille far from the rose dot and as letters near it. Use it behind a masthead.</span>
            <span class="data-label mt-1 block">Names from {{ source }}.</span>
          </figcaption>
        </figure>
        <figure class="m-0 min-w-0">
          <div class="relative h-56 overflow-hidden rounded-lg border border-default bg-muted">
            <TextureConverge variant="stage" />
          </div>
          <figcaption class="mt-3">
            <span class="block font-mono text-sm text-default">Converge</span>
            <span class="mt-1 block text-sm leading-relaxed text-muted">Scattered dots fall into one line that ends on the rose dot. Use it as a divider or a loading band.</span>
          </figcaption>
        </figure>
        <figure class="m-0 min-w-0">
          <div class="relative h-56 overflow-hidden rounded-lg border border-default bg-muted">
            <TextureFileMinimap :sources="minimapSources ?? []" />
          </div>
          <figcaption class="mt-3">
            <span class="block font-mono text-sm text-default">File minimap</span>
            <span class="mt-1 block text-sm leading-relaxed text-muted">SKILL.md files as rows of dots. The rose cursor types the changed line again.</span>
            <span class="data-label mt-1 block">{{ minimapSources?.length ? `${minimapSources.length} real SKILL.md files, the rest generated.` : 'Generated files.' }}</span>
          </figcaption>
        </figure>
      </div>

      <div class="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h3 class="section-label">
            Converge as a divider
          </h3>
          <div class="relative mt-3 h-10">
            <TextureConverge />
          </div>
        </div>
        <div>
          <h3 class="section-label">
            Converge while loading
          </h3>
          <div class="relative mt-3 h-10">
            <TextureConverge loading label="Loading more Skills" />
          </div>
        </div>
      </div>
    </section>

    <p class="data-label mt-12 border-t border-default pt-6">
      Real data: Skill names from {{ source }}, and SKILL.md files from the registry. Example data: mention counts, versions, and change notes.
    </p>
  </div>
</template>
