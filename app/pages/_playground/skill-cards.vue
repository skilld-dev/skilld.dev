<script setup lang="ts">
import type { SkillCardSkill } from '~/types/skill-card'

// Dev-only lab for SkillCard. 404s in production.
// Every context below is a real embed on the site, with its real props.
definePageMeta({
  layout: false,
  validate: () => import.meta.dev,
})
useHead({ title: 'Skill card lab' })
useSeoMeta({ robots: 'noindex, nofollow' })

// Production rows from /api/tags/frontend and /api/tags/planning on 2026-10-06.
const SKILLS: SkillCardSkill[] = [
  { owner: 'pbakaus', repo: 'impeccable', name: 'impeccable', registryPath: '/gh/pbakaus/impeccable', description: 'Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks.', stars: 77050, likeCount: 0, modifiedAt: 1791152542, pushedAt: 1791239874, authorName: 'Paul Bakaus', skillFileUrl: 'https://github.com/pbakaus/impeccable/blob/main/cursor-plugin/skills/impeccable/SKILL.md' },
  { owner: 'anthropics', repo: 'skills', name: 'frontend-design', registryPath: '/gh/anthropics/skills/frontend-design', description: 'Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don\'t read as templated defaults.', stars: 179792, likeCount: 0, modifiedAt: 1788453433, pushedAt: 1791208005, authorName: 'Anthropic', skillFileUrl: 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md' },
  { owner: 'addyosmani', repo: 'agent-skills', name: 'performance-optimization', registryPath: '/gh/addyosmani/agent-skills/performance-optimization', description: 'Optimizes application performance across frontend, backend, queries, and databases. Use when performance requirements exist, when you suspect performance regressions, when Core Web Vitals or load times need improvement, when N+1 query patterns need fixing, or when profiling reveals bottlenecks.', stars: 101545, likeCount: 0, modifiedAt: 1791009463, pushedAt: 1791051671, authorName: 'Addy Osmani', skillFileUrl: 'https://github.com/addyosmani/agent-skills/blob/main/skills/performance-optimization/SKILL.md' },
  { owner: 'mattpocock', repo: 'skills', name: 'grill-me', registryPath: '/gh/mattpocock/skills/grill-me', description: 'A relentless interview to sharpen a plan or design.', stars: 277082, likeCount: 0, modifiedAt: 1786826798, pushedAt: 1791201872, authorName: 'Matt Pocock', skillFileUrl: 'https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md' },
  { owner: 'obra', repo: 'superpowers', name: 'brainstorming', registryPath: '/gh/obra/superpowers/brainstorming', description: 'You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.', stars: 295431, likeCount: 0, modifiedAt: 1789777895, pushedAt: 1790476667, authorName: 'Jesse Vincent', skillFileUrl: 'https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md' },
  { owner: 'google', repo: 'skills', name: 'google-cloud-global-frontend-configuration', registryPath: '/gh/google/skills/google-cloud-global-frontend-configuration', description: 'Guides agents through a 6-step discovery process to design and deploy Google Cloud global external Application Load Balancers with Cloud CDN, Cloud Armor, and Service Extensions, mapping workload requirements to best-practice configurations.\nUse when:\n- Designing, configuring, or deploying a Google Cloud global external Application Load Balancer, Cloud CDN, Cloud Armor WAF, or Service Extensions.\n- Discovering existing Google Cloud resources (Cloud Storage, MIGs, GKE, Cloud Run) to use as backends.\n- Generating production-grade Terraform HCL or gcloud CLI scripts for global external Application Load Balancers.\n- Actuating deployments via Infrastructure Manager or bash scripts, including IAM pre-checks.\n- Detecting, analyzing, or reconciling configuration drift on deployed global external Application Load Balancers.\nDon\'t use for:\n- Non-Google Cloud load balancing or security configurations.\n- Purely regional or internal load balancing setups (unless part of a hybrid/failover global design).', stars: 20937, likeCount: 0, modifiedAt: 1789985180, pushedAt: 1790960021, authorName: 'Google', skillFileUrl: 'https://github.com/google/skills/blob/main/skills/cloud/google-cloud-global-frontend-configuration/SKILL.md' },
  { owner: 'hkuds', repo: 'deepcode', name: 'frontend-design', registryPath: '/gh/hkuds/deepcode/frontend-design', description: 'Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don\'t read as templated defaults.', stars: 16669, likeCount: 0, modifiedAt: 1786525210, pushedAt: 1790582765, authorName: '✨Data Intelligence Lab@HKU✨', skillFileUrl: 'https://github.com/HKUDS/DeepCode/blob/main/core/skills/builtin/frontend-design/SKILL.md' },
  { owner: 'langflow-ai', repo: 'langflow', name: 'frontend-testing', registryPath: '/gh/langflow-ai/langflow/frontend-testing', description: 'Langflow is a powerful tool for building and deploying AI-powered agents and workflows.', stars: 155513, likeCount: 0, modifiedAt: 1783987538, pushedAt: 1791237561, authorName: 'Langflow', skillFileUrl: 'https://github.com/langflow-ai/langflow/blob/main/.agents/skills/frontend-testing/SKILL.md' },
  { owner: 'garrytan', repo: 'gstack', name: 'design-html', registryPath: '/gh/garrytan/gstack/design-html', description: 'Design finalization: generates production-quality Pretext-native HTML/CSS. (gstack)', stars: 135354, likeCount: 0, modifiedAt: 1791125921, pushedAt: 1791233723, authorName: 'Garry Tan', skillFileUrl: 'https://github.com/garrytan/gstack/blob/main/design-html/SKILL.md' },
  { owner: 'leonxlnx', repo: 'taste-skill', name: 'taste-skill', registryPath: '/gh/leonxlnx/taste-skill/taste-skill', description: 'Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces that do not look templated. Real design systems when applicable, audit-first on redesigns, strict pre-flight check.', stars: 92584, likeCount: 0, modifiedAt: 1779823896, pushedAt: 1790413310, authorName: 'Leon Lin', skillFileUrl: 'https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md' },
  { owner: 'cloudflare', repo: 'cloudflare-os', name: 'frontend-conventions', registryPath: '/gh/cloudflare/cloudflare-os/frontend-conventions', description: 'Use for creating, modifying, moving, or reviewing React frontend code anywhere in packages/*, including Workshop pages, gatekeeper management apps, shared UI, components, hooks, forms, interactions, styling, accessibility, and frontend tests.', stars: 10798, likeCount: 0, modifiedAt: 1790010005, pushedAt: 1791165505, authorName: 'Cloudflare', skillFileUrl: 'https://github.com/cloudflare/cloudflare-os/blob/main/.agents/skills/frontend-conventions/SKILL.md' },
  { owner: 'zarazhangrui', repo: 'frontend-slides', name: 'frontend-slides', registryPath: '/gh/zarazhangrui/frontend-slides', description: 'Create stunning, animation-rich HTML presentations from scratch or by converting PowerPoint files. Use when the user wants to build a presentation, convert a PPT/PPTX to web, or create slides for a talk/pitch. Helps non-designers discover their aesthetic through visual exploration rather than abstract choices.', stars: 30131, likeCount: 0, modifiedAt: 1779812977, pushedAt: 1782245299, authorName: 'Zara Zhang', skillFileUrl: 'https://github.com/zarazhangrui/frontend-slides/blob/main/SKILL.md' },

]

function pick(key: string): SkillCardSkill {
  const skill = SKILLS.find(s => `${s.owner}/${s.repo}/${s.name}` === key)
  if (!skill)
    throw new Error(`Lab fixture has no ${key}`)
  return skill
}

const impeccable = pick('pbakaus/impeccable/impeccable')
const frontendDesign = pick('anthropics/skills/frontend-design')
const perf = pick('addyosmani/agent-skills/performance-optimization')
const grillMe = pick('mattpocock/skills/grill-me')
const brainstorming = pick('obra/superpowers/brainstorming')
const googleCloud = pick('google/skills/google-cloud-global-frontend-configuration')
const hkuds = pick('hkuds/deepcode/frontend-design')
const langflowTesting = pick('langflow-ai/langflow/frontend-testing')
const designHtml = pick('garrytan/gstack/design-html')
const taste = pick('leonxlnx/taste-skill/taste-skill')
const cloudflare = pick('cloudflare/cloudflare-os/frontend-conventions')
const slides = pick('zarazhangrui/frontend-slides/frontend-slides')

const directory = [frontendDesign, impeccable, perf, designHtml, taste, googleCloud]
const ownerHub = SKILLS.filter(s => s.owner === 'anthropics' || s.owner === 'garrytan').slice(0, 3)
const browse = [frontendDesign, impeccable, grillMe, brainstorming, perf, langflowTesting, hkuds, cloudflare]
const trendingKeys = new Set([impeccable.name, grillMe.name])
const collection = [
  { skill: impeccable, note: 'The one to start with. It audits a page the way a design lead would, then fixes it.' },
  { skill: perf, note: 'Pairs with impeccable: it catches what a polish pass makes slower.' },
  { skill: designHtml, note: 'For the moment a mock has to become real markup.' },
  { skill: slides, note: null },
]
const board = [grillMe, impeccable, brainstorming, frontendDesign]
const compact = [frontendDesign, impeccable, perf, designHtml, taste, cloudflare, slides, brainstorming]
const dependencies = ['frontend-design', 'web-artifacts-builder', 'canvas-design', 'theme-factory']
</script>

<template>
  <div class="min-h-dvh bg-default text-default">
    <header class="sticky top-0 z-30 border-b border-default bg-default/95">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <h1 class="font-mono text-sm font-semibold">
          Skill card lab
        </h1>
        <UColorModeButton class="ml-auto" />
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:px-6">
      <!-- 1. Directory grid: /skills/tag/*, /frameworks/*, /agents/* -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Directory grid
        </h2>
        <p class="lab-context__props">
          /skills/tag, /frameworks, /agents · layout card · byline full · metric stars · run
        </p>
        <div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SkillCard v-for="skill in directory" :key="skill.registryPath" :skill />
          </div>
        </div>
      </section>

      <!-- 2. Owner hub: /gh/[owner] -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Owner hub
        </h2>
        <p class="lab-context__props">
          /gh/[owner] · layout card · byline none · metric none (the repository header carries both)
        </p>
        <div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SkillCard v-for="skill in ownerHub" :key="skill.registryPath" :skill byline="none" metric="none" />
          </div>
        </div>
      </section>

      <!-- 3. Repository page: /gh/[owner]/[repo] -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Repository page
        </h2>
        <p class="lab-context__props">
          /gh/[owner]/[repo] · layout card · byline none · metric updated · footer slot: dependencies
        </p>
        <div>
          <div class="grid gap-3 lg:grid-cols-2">
            <SkillCard :skill="frontendDesign" byline="none" metric="updated">
              <template #footer>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="data-label">Requires</span>
                  <NuxtLink
                    v-for="dep in dependencies.slice(1, 3)"
                    :key="dep"
                    to="/"
                    class="inline-flex min-h-8 items-center rounded-md border border-default px-2 font-mono text-xs text-muted"
                  >
                    /{{ dep }}
                  </NuxtLink>
                </div>
              </template>
            </SkillCard>
            <SkillCard :skill="slides" byline="none" metric="updated" />
          </div>
        </div>
      </section>

      <!-- 4. Article embed: /compare/* -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Article embed
        </h2>
        <p class="lab-context__props">
          /compare · layout card · byline full · metric none · source only · note
        </p>
        <div>
          <div class="max-w-prose">
            <p class="mb-4 text-sm leading-relaxed text-muted">
              Paul Bakaus wrote the broadest of the three. It reads a page the way a design lead would and names each fix.
            </p>
            <SkillCard
              :skill="impeccable"
              metric="none"
              :actions="['source']"
              note="Use it when the page already works and needs taste, not a rebuild."
            />
          </div>
        </div>
      </section>

      <!-- 5. Browse list: /skills -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Browse list
        </h2>
        <p class="lab-context__props">
          /skills (was SkillTable), /me, home feeds · layout row · byline full · metric stars · trending on two rows
        </p>
        <div>
          <ul class="editorial-ledger list-none p-0">
            <li v-for="skill in browse" :key="skill.registryPath">
              <SkillCard :skill layout="row" :trending="trendingKeys.has(skill.name)" />
            </li>
          </ul>
        </div>
      </section>

      <!-- 6. Collection ledger: /@login/slug, /skills/best -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Collection ledger
        </h2>
        <p class="lab-context__props">
          /@[login]/[slug], the reviewed list · layout row · rank · note · metric none
        </p>
        <div>
          <ol class="editorial-ledger list-none p-0">
            <li v-for="(entry, index) in collection" :key="entry.skill.registryPath">
              <SkillCard :skill="entry.skill" layout="row" :rank="index + 1" :note="entry.note" metric="none" />
            </li>
          </ol>
        </div>
      </section>

      <!-- 7. Curator profile and /me: rows with context slots -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Profile rows
        </h2>
        <p class="lab-context__props">
          /@[login], /me · layout row · byline none · metric updated · meta slot · actions slot (badge)
        </p>
        <div>
          <ul class="editorial-ledger list-none p-0">
            <li v-for="skill in [grillMe, brainstorming]" :key="skill.registryPath">
              <SkillCard :skill layout="row" byline="none" metric="updated">
                <template #meta>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-eye" class="size-3" aria-hidden="true" />
                    Watching for changes
                  </span>
                </template>
                <template #actions>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-code" aria-label="README badge" />
                </template>
              </SkillCard>
            </li>
          </ul>
        </div>
      </section>

      <!-- 8. Trending board: /skills/trending, /skills/[track] -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Trending board
        </h2>
        <p class="lab-context__props">
          /skills/trending, tracks · layout row · rank · trending · meta slot: why it ranked · run
        </p>
        <div>
          <ol class="editorial-ledger list-none p-0">
            <li v-for="(skill, index) in board" :key="skill.registryPath">
              <SkillCard :skill layout="row" :rank="index + 1" :trending="index < 2" :actions="['run']">
                <template v-if="index < 2" #meta>
                  <BrailleSpark :counts="[0, 1, 3, 2, 5, 8, 13]" period="in 7 days" />
                </template>
                <template v-else #meta>
                  <span>Ranked by GitHub stars</span>
                </template>
              </SkillCard>
            </li>
          </ol>
        </div>
      </section>

      <!-- 9. Compact index: trending "Earlier on this board", community, related -->
      <section class="lab-context">
        <h2 class="lab-context__title">
          Compact index
        </h2>
        <p class="lab-context__props">
          trending archive, community top Skill, sidebars · layout compact · byline full · metric stars
        </p>
        <div>
          <div class="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            <SkillCard v-for="skill in compact" :key="skill.registryPath" :skill layout="compact" />
          </div>
          <div class="mt-6 grid max-w-sm gap-2">
            <p class="section-label">
              Narrow sidebar, description on
            </p>
            <SkillCard v-for="skill in compact.slice(0, 3)" :key="skill.registryPath" :skill layout="compact" description />
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.lab-context__title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.015em;
}

.lab-context__props {
  margin-top: 0.25rem;
  margin-bottom: 1.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}
</style>
