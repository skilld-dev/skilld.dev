# skilld.dev

Curated registry and discovery platform for AI agent skills.

## Two Loops

Every change must serve one of two loops. If a feature doesn't, cut it.

- **Loop 1 — Activation (anonymous discovery → install).** Land on skilld.dev → see curated/official skills + recent updates → open skill detail → copy `npx skilld add gh:owner/repo` → run it. No auth, no email, no friction. SEO-bearing surface. Top of funnel.
- **Loop 2 — Retention (authenticated watching → digest).** Returning user signs in with GitHub → bulk-imports starred repos that have skills → optionally watches collections → receives weekly digest email when watched repos change. Lifecycle hook + moat.

Loops live on the same site but are sold separately. Loop 1 is the headline; Loop 2 is a small CTA strip on the homepage and a "Watch for changes" affordance on skill/collection pages.

## Core Thesis

Skills are knowledge, not packages. The right skill for your context matters more than the most popular one. The best signal for "right" is a developer you already trust choosing it for their own workflow. skilld.dev organizes discovery around **people whose taste you trust**, not download counts.

## Positioning

skilld is a curated registry of agent skills. The platform authors and maintains one canonical package skill per npm package. Curators assemble these into collections, and developers install through trust.

### What skilld is
- A curated registry and discovery layer for AI agent skills
- People first: every surface answers "who" before "what"
- An editorial platform where developer taste is the quality signal
- Two skill types: **package skills** (tied to npm packages, authored by skilld) and **guide skills** (general knowledge, authored by people)

### What skilld is not
- A leaderboard or popularity contest (never sort by downloads as primary view)
- An AI product (we serve developers who use AI agents, but we are not "AI-powered")

## Skill Types

### Package skills
Tied to a specific npm package and version. Authored and maintained by skilld (the platform). One canonical skill per package. Installed via `skilld add npm:<package>`.

### Guide skills (future)
Not tied to any package. Distributed as git skills (`github:owner/repo`). Authored by people, not the platform. Tagged as "guide" on skilld.dev for filtering.

## Information Architecture

```
skilld.dev/
  /                          → Hero install command, recently updated skills, featured collections
  /@<gh-login>               → Collection author profile
  /@<gh-login>/<slug>        → Collection with editorial context + one-click install
  /gh/[owner]/[repo]/[name]  → Skill detail: preview, sources, agents, watch CTA
  /skills/[pkg]              → Marketing/SEO landing for a package skill
```

## Install Commands

```bash
skilld add npm:vue npm:nuxt       # package skills from registry
skilld add @danielroe              # all skills from a curator
skilld add @danielroe/nuxt-stack   # specific collection
```

Each person becomes a living skill preset. When they update their list, followers can re-sync. This is the viral loop: curators share their link, others install and become curators themselves.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  skilld.dev MCP Server (access layer)                   │
│  Hosted at skilld.dev/api/mcp                           │
│  Agents connect via one config line, zero local setup   │
├─────────────────────────────────────────────────────────┤
│  skilld.dev Registry (distribution layer)               │
│  Curated package skills, collections, curator profiles  │
│  Instant installs, version tracking, search API         │
├─────────────────────────────────────────────────────────┤
│  skilld CLI (install + authoring layer)                  │
│  `skilld add` fetches from registry or git              │
│  `skilld author` generates skills from docs via LLM     │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### Curated registry
- Homepage leads with the install command and recently updated official skills
- Featured collections are hand-picked bundles, one install command per collection
- Author profiles live under `/@<github-login>`, backed by GitHub OAuth (Phase 2)

### Curated Collections
- Human curated bundles: "The Nuxt Starter Kit", "AI App Builder", "Design Engineer Essentials"
- Each collection has a curator, editorial rationale, and a single install command
- Collections are the atomic unit of sharing, not individual skills

### Quality Gate
- Package skills: authored and maintained by skilld, LLM curated, version tracked
- Guide skills: community authored, editorially reviewed on skilld.dev
- "If it's on skilld.dev, it actually works"

### Skill Transparency
- Collapsible SKILL.md preview in browser
- Compatible agents shown as filterable badges
- Doc sources used to generate the skill (full transparency)
- Freshness indicator: last regenerated vs package's latest release

## Tech Stack

- Nuxt 4 + Nuxt UI v4 + Tailwind v4
- motion-v for animations
- @nuxt/fonts (Plus Jakarta Sans + IBM Plex Mono)
- @nuxtjs/seo + nuxt-og-image
- GitHub OAuth via `nuxt-auth-utils` (Phase 2)
- Resend + vue-email for digests (Phase 3)
- Cloudflare Workers + D1 for deployment

## Brand Identity

- **Accent**: rose/coral (warm, human, editorial)
- **Neutrals**: stone (warm grays, OKLCH tinted)
- **Fonts**: Plus Jakarta Sans (body) + IBM Plex Mono (headings, labels)
- **Mode**: dark first, light supported
- **Design principle**: "We prioritize human warmth over technical precision"
- **Tone**: confident, warm, editorial. Independent magazine, not startup landing page.
- Full design system documented in `.claude/context/design-guidelines.md`

## Build Phases

- [x] Phase 1 — Loop 1 cleanup: rip atproto, new homepage, `/@<login>/*` collection routes, 410/redirect for `/people/*`
- [ ] Phase 2 — Auth + watching: GitHub OAuth, users + subscriptions tables, onboarding, `/me` dashboard
- [ ] Phase 3 — Email + AI summary: Resend, vue-email digest, Anthropic Haiku summaries, asset SHA tracking
- [ ] Phase 4 — Cleanup: drop legacy atproto tables once v2 is verified
