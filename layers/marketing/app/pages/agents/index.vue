<script setup lang="ts">
import { publishedAgentPages } from '../../utils/agent-pages'
import { pageRobots } from '../../utils/page-admissions'

const agents = publishedAgentPages()

const title = 'Agent Skills for Claude Code, Codex, Cursor, and more'
const description = 'How Skills work in each Agent skilld targets, with a curated list for each. The same Skill runs in every one of them.'
const canonicalUrl = 'https://skilld.dev/agents'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
  robots: pageRobots('/agents'),
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })
defineOgImage('Page.takumi', { title: 'Skills by Agent', description }, { alt: title })
</script>

<template>
  <div>
    <CompactPageHeader
      title="Skills by Agent"
      description="One page per Agent: where it reads Skills, how skilld lands them there, and a short curated list. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
      heading-id="agents-heading"
    />

    <section class="mx-auto max-w-5xl px-4 py-12 sm:px-6" aria-labelledby="agents-list-heading">
      <h2 id="agents-list-heading" class="sr-only">
        Agents
      </h2>
      <ul class="editorial-ledger list-none p-0">
        <li v-for="agent in agents" :key="agent.id">
          <NuxtLink
            :to="`/agents/${agent.id}`"
            class="flex min-h-11 flex-wrap items-baseline gap-x-4 gap-y-1 py-4 transition-opacity hover:opacity-70"
          >
            <span class="w-40 shrink-0 font-medium">{{ agent.label }} skills</span>
            <span class="min-w-0 flex-1 text-sm text-muted">{{ agent.summary }}</span>
            <code class="data-label">{{ agent.projectSkillsDir }}</code>
          </NuxtLink>
        </li>
      </ul>
      <p class="mt-8 text-sm text-muted">
        The skilld CLI targets more Agents than this list. Run <code class="font-mono">npx skilld install --help</code> for every value.
      </p>
    </section>
  </div>
</template>
