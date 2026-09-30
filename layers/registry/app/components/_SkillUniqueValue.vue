<script setup lang="ts">
// SEO experiment C, treatment pages only. See skill-unique-value-experiment.ts.
// Every block is built from data skilld already holds. Delete with the gate.
import type { RepoHistoryResponse } from '../../server/api/repos/[owner]/[repo]/history.get'
import type { SkillFileEntry } from '../utils/skill-unique-value'
import { useTimeAgo } from '@vueuse/core'
import RepoSparkline from '../pages/gh/[owner]/[repo]/_RepoSparkline.vue'
import { excerptSkillHtml, resolveSkillCommand, resolveSkillFileFacts } from '../utils/skill-unique-value'

interface RelatedItem {
  name: string
  owner: string
  repo: string
  displayName: string
  description: string | null
  registryPath: string
}

interface RelatedResponse {
  relatedRepoSkills: RelatedItem[]
  relatedOwnerSkills: RelatedItem[]
  coOccurrenceSkills: RelatedItem[]
  semanticSiblings: RelatedItem[]
}

const props = defineProps<{
  owner: string
  repo: string
  name: string
  description: string | null
  stars: number
  pushedAt: string | null
  maturity: { sinceUpdateDays: number, cadence: 'active' | 'steady' | 'dormant' } | null
  assets: SkillFileEntry[]
  assetCount: number
  contentHtml: string | null
  compatibility: string | null
  curators: { handle: string, collectionName: string, collectionSlug: string, reason?: string }[]
  skillFileUrl: string
  githubUrl: string
  registryPath: string
}>()

// Both requests run on the server, so the blocks sit in the HTML a crawler
// reads. Only the ten treatment pages pay for them. Related Skills come from
// the edge-cached endpoint that the browser already uses.
const { data: related } = await useFetch<RelatedResponse>(
  () => `/api/skill-related/${props.owner}/${props.repo}/${props.name}`,
  { key: () => `uv-related:${props.owner}/${props.repo}/${props.name}` },
)
const { data: history } = await useFetch<RepoHistoryResponse>(
  () => `/api/repos/${props.owner}/${props.repo}/history`,
  { key: () => `uv-history:${props.owner}/${props.repo}` },
)

const files = computed(() => resolveSkillFileFacts({ assets: props.assets, total: props.assetCount }))
const command = computed(() => resolveSkillCommand(props, files.value))
const excerpt = computed(() => excerptSkillHtml(props.contentHtml))
const markdownUrl = computed(() => `${props.registryPath}.md`)

const pushedAtAgo = useTimeAgo(() => new Date(props.pushedAt ?? 0))

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const starTrend = computed(() => {
  const h = history.value?.starHistory
  if (h?._tag === 'ready')
    return { _tag: 'ready' as const, points: h.points }
  if (h?._tag === 'collecting')
    return { _tag: 'tracking' as const, label: `Tracking since ${MONTH_FORMAT.format(h.trackedSince * 1000)}` }
  return null
})

const relatedGroups = computed(() => {
  const r = related.value
  if (!r)
    return []
  return [
    { label: 'Similar', items: r.semanticSiblings },
    { label: 'Paired with', items: r.coOccurrenceSkills },
    { label: `From ${props.owner}/${props.repo}`, items: r.relatedRepoSkills },
    { label: `Other by ${props.owner}`, items: r.relatedOwnerSkills },
  ]
    .map(g => ({ ...g, items: g.items.slice(0, 6) }))
    .filter(g => g.items.length > 0)
})

const CADENCE_LABEL = { active: 'active', steady: 'steady', dormant: 'dormant' } as const
</script>

<template>
  <div class="space-y-10 md:space-y-12" data-testid="skill-unique-value">
    <section aria-labelledby="uv-facts-heading">
      <h2 id="uv-facts-heading" class="section-label mb-3">
        Facts from the repository
      </h2>
      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default bg-muted/30 p-3 sm:col-span-2">
          <dt class="data-label">
            {{ command._tag === 'run' ? 'Run command' : 'Install command' }}
          </dt>
          <dd class="mt-2">
            <code class="install-command install-command--wrap block">{{ command.command }}</code>
            <p v-if="command._tag === 'install'" class="mt-2 text-sm text-muted">
              {{ command.reason }}
            </p>
            <p v-else class="mt-2 text-sm text-muted">
              Your Agent reads the Skill now. Nothing lands in your repository.
            </p>
          </dd>
        </div>

        <div class="rounded-lg border border-default bg-muted/30 p-3">
          <dt class="data-label">
            Files beside SKILL.md
          </dt>
          <dd class="mt-2 text-sm">
            <template v-if="files._tag === 'only-skill-md'">
              None. This Skill is one file.
            </template>
            <template v-else>
              <p class="font-mono tabular-nums">
                {{ files.total.toLocaleString() }} files
              </p>
              <p class="mt-1 text-muted">
                {{ files.markdown.toLocaleString() }} markdown, {{ files.code.toLocaleString() }} code
              </p>
              <p v-if="files.codePaths.length" class="mt-1 break-words font-mono text-xs text-muted">
                {{ files.codePaths.slice(0, 3).join(', ') }}<template v-if="files.codePaths.length > 3">
                  and {{ (files.codePaths.length - 3).toLocaleString() }} more
                </template>
              </p>
            </template>
          </dd>
        </div>

        <div class="rounded-lg border border-default bg-muted/30 p-3">
          <dt class="data-label">
            GitHub stars
          </dt>
          <dd class="mt-2 flex min-h-8 items-end justify-between gap-3">
            <span class="font-mono text-xl font-medium tabular-nums">{{ stars.toLocaleString() }}</span>
            <span class="h-7 w-20 shrink-0 sm:w-24">
              <RepoSparkline
                v-if="starTrend?._tag === 'ready'"
                :points="starTrend.points"
                label="GitHub stars"
                approximate
              />
              <span v-else-if="starTrend" class="block text-right text-[10px] leading-tight text-muted">
                {{ starTrend.label }}
              </span>
            </span>
          </dd>
        </div>

        <div v-if="pushedAt" class="rounded-lg border border-default bg-muted/30 p-3">
          <dt class="data-label">
            Repository updated
          </dt>
          <dd class="mt-2 text-sm">
            <p class="font-mono">
              {{ pushedAtAgo }}
            </p>
            <p v-if="maturity" class="mt-1 text-muted">
              Update pace: {{ CADENCE_LABEL[maturity.cadence] }}
            </p>
          </dd>
        </div>

        <div v-if="compatibility" class="rounded-lg border border-default bg-muted/30 p-3">
          <dt class="data-label">
            Agent compatibility
          </dt>
          <dd class="mt-2 text-sm">
            {{ compatibility }}
          </dd>
        </div>

        <div
          v-if="curators.length"
          class="rounded-lg border border-default bg-muted/30 p-3 sm:col-span-2"
        >
          <dt class="data-label">
            In collections
          </dt>
          <dd class="mt-2 space-y-2 text-sm">
            <p v-for="curator in curators" :key="`${curator.handle}/${curator.collectionSlug}`">
              <NuxtLink
                :to="`/@${curator.handle}/${curator.collectionSlug}`"
                class="font-mono hover:text-highlighted"
              >
                {{ curator.collectionName }}
              </NuxtLink>
              by @{{ curator.handle }}<template v-if="curator.reason">
                : {{ curator.reason }}
              </template>
            </p>
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="uv-excerpt-heading">
      <h2 id="uv-excerpt-heading" class="section-label mb-3">
        Excerpt from SKILL.md
      </h2>
      <div class="rounded-lg border border-default p-4 sm:p-6">
        <p v-if="description" class="mb-4 text-base leading-relaxed">
          {{ description }}
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -- HTML from the same sanitising renderer as the full body -->
        <div v-if="excerpt" class="skill-prose" v-html="excerpt" />
      </div>
      <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <a
          :href="skillFileUrl || githubUrl"
          target="_blank"
          rel="noopener"
          class="font-mono hover:text-default transition-colors"
        >
          Read the full SKILL.md on GitHub
        </a>
        <a :href="markdownUrl" class="font-mono hover:text-default transition-colors">
          Full SKILL.md as markdown
        </a>
      </p>
    </section>

    <section v-if="relatedGroups.length" aria-labelledby="uv-related-heading">
      <h2 id="uv-related-heading" class="section-label mb-3">
        Related skills
      </h2>
      <div class="space-y-6">
        <div v-for="group in relatedGroups" :key="group.label">
          <h3 class="mb-2 font-mono text-xs text-muted">
            {{ group.label }}
          </h3>
          <SkillSourceList :items="group.items" variant="grid" :aria-label="`${group.label} skills`" />
        </div>
      </div>
    </section>
  </div>
</template>
