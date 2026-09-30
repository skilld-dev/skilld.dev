<script setup lang="ts">
/**
 * One `/agents/<id>` page: how Skills work in one Agent, plus a short curated
 * list from the registry. Search surface only (VISION principle 6 carve-out):
 * the copy names cross-agent compatibility, and product UI stays agent-neutral.
 *
 * Cull path (VISION principle 2). Remove a page, its Markdown, and its row in
 * `agent-pages.ts` when either holds:
 * - the CLI drops the Agent target from `crates/skilld-core/src/target.rs`;
 * - Google Search Console shows zero impressions for the page over the 90 days
 *   after it was first indexed.
 * The `/agents` index lists whatever remains, so a removal needs no other edit.
 */
import { agentPageById, selectAgentSkills } from '../utils/agent-pages'

interface ClusterSkill {
  owner: string
  name: string
  repo: string
  displayName: string
  description: string | null
  stars: number
  modifiedAt: number | null
  slug: string
  registryPath: string
}

interface ClusterDetailResponse {
  cluster: { slug: string, label: string }
  items: ClusterSkill[]
  total: number
}

const { agent } = defineProps<{ agent: string }>()

const page = agentPageById(agent)
// Also 404 while the page waits on a CLI release; see PUBLISHED_CLI_VERSION.
if (!page)
  throw createError({ statusCode: 404, statusMessage: 'Unknown Agent', fatal: true })

const { data } = await useMarketingArticle({
  collection: 'agents',
  path: `/agents/${page.id}`,
  canonicalPath: `/agents/${page.id}`,
})

// Blocking so the server response carries the list; see skills/[cluster].vue.
const { data: cluster, error } = await useFetch<ClusterDetailResponse>(
  `/api/clusters/${page.cluster}`,
  { query: { limit: 24 }, key: `agent-skills-${page.id}` },
)

const SHORTLIST = { max: 8, perOwner: 2 }
const skills = computed(() =>
  selectAgentSkills(cluster.value?.items ?? [], SHORTLIST),
)

const siteOrigin = 'https://skilld.dev'
useSchemaOrg(computed(() => skills.value.length
  ? [{
      '@type': 'ItemList' as const,
      '@id': `${siteOrigin}/agents/${page.id}#skills`,
      'name': `Curated Skills for ${page.label}`,
      'itemListElement': skills.value.map((skill, index) => ({
        '@type': 'ListItem' as const,
        'position': index + 1,
        'url': `${siteOrigin}${skill.registryPath}`,
        'name': skill.displayName || skill.name,
      })),
    }]
  : [],
))
</script>

<template>
  <MarketingArticle v-if="data" :page="data">
    <section
      class="not-prose mt-12 border-t border-default pt-8"
      aria-labelledby="agent-skills-heading"
    >
      <h2 id="agent-skills-heading" class="text-2xl font-semibold tracking-tight">
        Curated Skills for {{ page.label }}
      </h2>
      <p class="mt-2 text-base leading-relaxed text-muted">
        {{ page.clusterReason }}
        Skills here come from the curated registry; a person admitted each one.
      </p>

      <p v-if="error" class="editorial-state mt-6" role="alert">
        Could not load the Skill list. Browse the
        <NuxtLink :to="`/skills/${page.cluster}`" class="underline">
          {{ cluster?.cluster.label ?? 'track' }} track
        </NuxtLink>
        instead.
      </p>

      <ul v-else class="mt-6 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        <li v-for="skill in skills" :key="skill.slug">
          <SkillCard :skill show-owner-path />
        </li>
      </ul>

      <p v-if="cluster" class="mt-4 text-sm text-muted">
        <NuxtLink :to="`/skills/${page.cluster}`" class="underline">
          All {{ cluster.total }} Skills in {{ cluster.cluster.label }}
        </NuxtLink>
      </p>

      <p class="mt-6 text-base leading-relaxed text-muted">
        {{ page.label }} can also search the registry itself. Install the skilld Skill or add the skilld MCP server.
        <NuxtLink to="/developers" class="text-default underline">
          Set up {{ page.label }}
        </NuxtLink>
      </p>
    </section>

    <p class="not-prose mt-10 border-t border-default pt-6 text-base leading-relaxed">
      <strong>Read before you run.</strong>
      A Skill is instructions for your Agent. Open the source file first.
      <NuxtLink to="/verify" class="underline">
        What skilld verifies, and what it never claims
      </NuxtLink>.
    </p>
  </MarketingArticle>
</template>
