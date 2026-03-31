# skilld.dev

Curated registry and discovery platform for AI agent skills. People first, skills second.

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
  /                        → People feed: curators, latest picks, featured collections
  /people/[handle]         → Curator profile: bio, stack, collections, activity
  /people/[handle]/[slug]  → Collection with editorial context + one-click install
  /skills/[pkg]            → Skill detail: preview, sources, agents, "recommended by" people
  /@[handle]               → Short URL, resolves to /people/[handle]
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

### People First
- Homepage is a people feed, not a leaderboard
- Every surface answers "who" before "what"
- Curator profiles linked to AT Protocol handles (no proprietary auth)
- Comments and social proof via Bluesky threads

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
- AT Protocol for auth and social layer
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

- [x] Design system setup (colors, fonts, tokens, component theming, guidelines)
- [x] Homepage: people feed + featured collections
- [x] Curator profile page
- [x] Collection detail page
- [ ] Skill detail page
- [x] AT Protocol auth integration
- [ ] Registry API: skill metadata, search, collection endpoints
- [ ] MCP server: hosted at skilld.dev/api/mcp
- [ ] CLI integration: `skilld add npm:` resolution from registry
- [x] OG image generation for curators, collections, skills
