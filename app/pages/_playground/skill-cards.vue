<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { SkillCardSkill } from '~/types/skill-card'
import { boardPost } from '#shared/trending-range'

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

// Three rows from the production trending feed on 2026-10-06, with their posts.
const BOARD_FEED = [
  {
    owner: 'lemomo-ai',
    repo: 'lemo-opuscar',
    name: 'lemo-opuscar',
    registryPath: '/gh/lemomo-ai/lemo-opuscar',
    description: 'Direct and produce a short film made entirely in code, in one of the styles of the Lemo-Opuscar library (e.g. Impasto Oil Painting 油画厚涂, Watercolor Brush 水彩笔刷, Chinese Ink Wash 中国水墨, Ukiyo-e 浮世绘, Whiteboard Explainer 白板讲解). Use when the user asks for a video, film, short, promo, explainer or animation (视频、短片、动画、宣传片) in a named style; when they want a film made about their own topic and haven\'t chosen a style (help them choose); or when they ask which film styles there are. Not for editing or converting existing video files.',
    stars: 1188,
    mentionsByDay: [
      0,
      1,
      1,
      1,
      1,
      2,
      0,
    ],
    posts: [
      {
        url: 'https://x.com/ScaleWthAI/status/2106386087463772495',
        authorHandle: 'ScaleWthAI',
        authorName: 'Saman Ahmed',
        authorAvatar: 'https://pbs.twimg.com/profile_images/2074400881127415808/k8socXL7_normal.jpg',
        text: 'Claude Opus 5.5 is turning GitHub into a playground for creators.\n\nIn just one week, people shipped everything from coded music videos to full 3D games.\n\n1. PDoomVideo: the Opus 5.5 P(doom) music video, every frame in code (1.5k stars)\nhttps://t.co/D3jokz8BXG\n\n2. awesome-opus5-5-videos: 475 viral Opus 5.5 videos with their prompts (1k stars)\nhttps://t.co/TN6YIciyfj\n\n3. tidewater: a WebGPU fishing game built with Opus 5.5 (988 stars)\nhttps://t.co/z2XcLNsrRU\n\n4. claude-opus-5-…',
        postedAt: 1791036552,
        platform: 'x',
        favouriteCount: 191,
      },
      {
        url: 'https://bsky.app/profile/did:plc:rrpul7rxm2s4opncn6pwr475/post/3mx2apobtg72w',
        authorHandle: 'todaystopainews.bsky.social',
        authorName: 'Today\'s Top AI News',
        authorAvatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:rrpul7rxm2s4opncn6pwr475/bafkreibhx5ue3qth44hxivzlcdqvqbnfmfeyq5ez35mvm2yuggsgvkkwbi',
        text: 'Claude Code skill for short films (no video model): 43 film styles, each with a style prompt and demo film generated entirely in code by Claude Opus 5.5 (including OPUSCAR 98). Developed by Lemomo.\n\n#technology #anthropic #ai #artificialintelligence #opensource #news #claude\nGitHub - lemomo-ai/lemo-opuscar: Claude Code skill for short films with no video model: 43 film styl\nClaude Code skill for short films with no video model: 43 film styles, each a style prompt plus a demo…',
        postedAt: 1791111607,
        platform: 'bsky',
        favouriteCount: 2,
      },
      {
        url: 'https://bsky.app/profile/did:plc:apt3rm34z7q7azvcyrydbkaf/post/3mx26mwmxag24',
        authorHandle: 'vulcanfeynman.bsky.social',
        authorName: 'Vulcan Feynman',
        authorAvatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:apt3rm34z7q7azvcyrydbkaf/bafkreif3rnhsni24xhopdljbp4hcza23zk2s2fdcs4x6rsfoqulvbmbld4',
        text: '42/68\ngit clone github.com/lemomo-ai/le... clawd-case\ncd clawd-case\nexport LEMO_OPUSCAR_HOME="$PWD"\nsh plugin/skills/lemo-opuscar/scripts/setup.sh deps voice\nfor BANK in salamander freepats karoryfer vcsl vsco2ce; do\n  sh tools/fetch.sh instruments "$BANK"\ndone\nGitHub - lemomo-ai/lemo-opuscar: Claude Code skill for short films with no video model: 43 film styles, each a style prompt plus a demo film made entirely in code by Claude Opus 5.5 (incl. OPUSCAR 98)...\nClaude Code s…',
        postedAt: 1791109364,
        platform: 'bsky',
        favouriteCount: 1,
      },
    ],
  },
  {
    owner: 'nanaism',
    repo: 'yomiyasu',
    name: 'yomiyasu',
    registryPath: '/gh/nanaism/yomiyasu',
    description: 'AIが生成した不自然な日本語を、人間が読みやすく情報密度の高い自然な文章へ書き直すAgent Skill。「この文章を読みやすくして」「aiっぽさをなくして」「AI臭さを消して」「自然な日本語にして」「文章を脱臭して」という依頼や、技術記事、業務仕様書・PR説明文、エッセイ・noteの推敲時に使用する。非生物主語の解体、比喩的動詞の具体化、絵文字や文末コロンの完全排除、不要な補足カッコの削除、英単語前後の不自然な半角空白の排除、過剰な太字・箇条書き・否定対比の平文化を行い、文単体で誰が何をどうしたかが伝わる文章へ再構築する。',
    stars: 1369,
    mentionsByDay: [
      0,
      1,
      1,
      1,
      2,
      1,
      0,
    ],
    posts: [
      {
        url: 'https://x.com/Marco_Ramilli/status/2106717225407172828',
        authorHandle: 'Marco_Ramilli',
        authorName: 'Marco Ramilli',
        authorAvatar: 'https://pbs.twimg.com/profile_images/1975172551979536384/uGtyi7pM_normal.jpg',
        text: '🤖 yomiyasu\n⭐ 1,355 stars\n\nTired of robotic AI-generated Japanese? Polish your LLM outputs into natural, human-grade prose with this seamless agent skill.\n\n🔗 https://t.co/RCSINWNrI7\n\n#AI #MachineLearning https://t.co/51ifeCwaiz',
        postedAt: 1791115502,
        platform: 'x',
        favouriteCount: 5,
      },
      {
        url: 'https://bsky.app/profile/did:plc:iy3szmwg4hajieka5kbhmcy5/post/3mwxbee7wbs25',
        authorHandle: 'yug1224.com',
        authorName: 'ぷーじ',
        authorAvatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:iy3szmwg4hajieka5kbhmcy5/bafkreifxzudsbphb5qmp7g5x3jgg3r4chrbp7725qkymameyw53g23a7tu',
        text: 'AI生成の日本語を自然な文章に整えてくれるAgent Skillらしい\n文章の硬さが気になる時に使えそうかな\n\nyug1224 starred nanaism/yomiyasu\nhttps://github.com/nanaism/yomiyasu\nGitHub - nanaism/yomiyasu: AI生成の日本語を自然な日本語へ推敲するAgent Skill / Agent Skill for Refining AI-Generated Japanese into Natural Japanese',
        postedAt: 1791009224,
        platform: 'bsky',
        favouriteCount: 2,
      },
      {
        url: 'https://bsky.app/profile/did:plc:3odpz5wxuofzbd7dat3chhzx/post/3mwwto32zyd2u',
        authorHandle: 'sarubot.bsky.social',
        authorName: 'さるぼっと@IT最新動向を配信',
        authorAvatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:3odpz5wxuofzbd7dat3chhzx/bafkreicwxwa74xc2x3bymxnqjenavsi44idsfhh52pk3ejiaiz76wum4pe',
        text: 'yomiyasu — AIの不自然な日本語を劇的に改善、今週スター急上昇中のAgent Skill！\n\n・単なる禁止語置換ではなく、文構造の修正や非生物主語の解体など7つの原則で推敲\n・Claude CodeやCursor等に組み込んで直接実行できるPython製ツール\n・技術記事や仕様書作成時の「AI臭さ」を排除し、推敲コストを大幅削減\n\n#LLM #GitHub\nyomiyasu\nAI生成の日本語を自然な日本語へ推敲するAgent Skill / Agent Skill for Refining AI-Generated Japanese into Natural Japanese',
        postedAt: 1790994518,
        platform: 'bsky',
        favouriteCount: 1,
      },
    ],
  },
  {
    owner: 'virgiliojr94',
    repo: 'book-to-skill',
    name: 'book-to-skill',
    registryPath: '/gh/virgiliojr94/book-to-skill',
    description: 'Converts books and documents (PDF, EPUB, DOCX, HTML, Markdown, plain text, RTF, MOBI/AZW with Calibre) into structured agent skills, extracting frameworks, mental models, principles, techniques, and anti-patterns. Use when the user wants to study a document through GitHub Copilot CLI, Amp, Claude Code, Hermes Agent, OpenCode, or OpenClaw, apply an author\'s frameworks while working, or build a reusable knowledge base from a file.',
    stars: 33687,
    mentionsByDay: [
      0,
      0,
      0,
      0,
      2,
      1,
      0,
    ],
    posts: [
      {
        url: 'https://x.com/tom_doerr/status/2106234841888899211',
        authorHandle: 'tom_doerr',
        authorName: 'Tom Dörr',
        authorAvatar: 'https://pbs.twimg.com/profile_images/1905090420142379008/Ydq5So7B_normal.jpg',
        text: 'book-to-skill converts technical books into agent skills for tools like Claude Code to reference directly\n\nhttps://t.co/GFnX15PgCP https://t.co/ipieS50aYd',
        postedAt: 1791000492,
        platform: 'x',
        favouriteCount: 705,
      },
      {
        url: 'https://x.com/krip_tom/status/2106335895364497584',
        authorHandle: 'krip_tom',
        authorName: 'Tom ⟦■■■■□⟧ loading agents',
        authorAvatar: 'https://pbs.twimg.com/profile_images/1999869092963012611/6z55afgE_normal.jpg',
        text: 'Stop pasting the PDF into chat — turn the book into a skill the agent loads.\n\nbook-to-skill: open-source tool that turns a technical book PDF into a Claude Code skill, so the agent can study, reference, and apply it while coding.\n\nhttps://t.co/JgvV4hfw6b',
        postedAt: 1791024585,
        platform: 'x',
        favouriteCount: 4,
      },
      {
        url: 'https://x.com/som_dutt_/status/2106624262098542615',
        authorHandle: 'som_dutt_',
        authorName: 'Som Dutt | AI/ML Analyst',
        authorAvatar: 'https://pbs.twimg.com/profile_images/1826872762545135616/4Ky0Gxte_normal.jpg',
        text: 'Claude Code + book-to-skill: Convert Any Technical Book Into an Agent Skill Claude Can Reference Directly\n\nAnswers cost 24x–51x fewer tokens than pasting the whole book into context.\nYour agent opens only the chapter a question needs.\nThe structuring work happens once, at conversion.\n\n📊 What one conversion builds:\n→ SKILL.md: key mental models and a chapter map, ~4,000 tokens\n→ Chapter files: ~1,000 tokens each, pulled only when asked\n→ glossary.md: key terms with chapter r…',
        postedAt: 1791093337,
        platform: 'x',
        favouriteCount: 1,
      },
    ],
  },
] as const

// The day the fixture was read, so the post ages stay fixed and hydrate cleanly.
const clock = 1_791_250_000
const boardRows: TrendingBoardRow[] = BOARD_FEED.map(item => ({
  key: item.registryPath,
  owner: item.owner,
  repo: item.repo,
  name: item.name,
  title: item.name,
  to: item.registryPath,
  subtitle: `${item.owner}/${item.repo}`,
  description: item.description,
  stars: item.stars,
  starSeries: [],
  names: [item.name],
  skill: { owner: item.owner, repo: item.repo, name: item.name },
  reason: { _tag: 'posts', posts: item.posts.map(post => boardPost(post, clock)), mentionsByDay: [...item.mentionsByDay] },
}))

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
          /skills/trending, tracks · TrendingBoardItem · layout row · rank · meta slot: why it ranked · aside slot: posts · run
        </p>
        <BoardRankedList :rows="boardRows" surface="lab-board" />
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
