# skilld.dev

Curated skill discovery platform for AI coding agents. People first, skills second.

## Core Thesis

skills.sh treats skills like npm packages: ranked by install count on a leaderboard. This is the wrong metaphor. Skills are knowledge; the right one for your context matters more than the most downloaded one. skilld.dev organizes discovery around **people whose taste you trust**, not metrics.

## Competitive Positioning

| | skills.sh | skilld.dev |
|---|---|---|
| Organizing unit | Skills (leaderboard) | People (curators) |
| Discovery | Search + install count | Curated collections |
| Social proof | Download numbers | Real people via AT Protocol/Bluesky |
| Quality signal | None | Editorial curation, curator reputation |
| Detail pages | 404 (broken) | Skill preview, source transparency, agent compatibility |
| Personalization | None | Curator-driven recommendations |

## Information Architecture

```
skilld.dev/
  /                        → People feed: curators, latest picks, featured collections
  /people/[handle]         → Curator profile: bio, stack, collections, activity
  /people/[handle]/[slug]  → Collection with editorial context + one-click install
  /skills/[pkg]            → Skill detail: preview, sources, agents, "recommended by" people
  /@[handle]               → Short URL, resolves to /people/[handle]
```

## User Plugin URL Feature

Users sign up (via Bluesky/AT Protocol), curate their skill list, and get a unique install command:

```bash
skilld add @danielroe        # Installs all skills this curator recommends
skilld add @danielroe/nuxt   # Installs a specific collection
```

Each person becomes a living skill preset. When they update their list, followers can re-sync. This is the viral loop: curators share their link, others install and become curators themselves.

## Key Features

### People First
- Homepage is a people feed, not a leaderboard
- Every surface answers "who" before "what"
- Curator profiles linked to Bluesky handles (AT Protocol, no proprietary auth)
- Comments and social proof via Bluesky threads

### Curated Collections
- Human-curated bundles: "The Nuxt Starter Kit", "AI App Builder", "Design Engineer Essentials"
- Each collection has a curator, editorial rationale, and a single install command
- Collections are the atomic unit of sharing, not individual skills

### Quality Gate
- Curated skills: tested, verified, editorially reviewed
- Community skills: available via search but not featured
- "If it's curated on skilld.dev, it actually works"

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
- AT Protocol / Bluesky for auth and social layer
- Cloudflare Workers + D1 for deployment

## Brand Identity

- **Accent**: rose/coral (warm, human, editorial)
- **Neutrals**: stone (warm grays, OKLCH tinted)
- **Fonts**: Plus Jakarta Sans (body) + IBM Plex Mono (headings, labels)
- **Mode**: dark-first, light supported
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
- [ ] API: curator profiles, collections, skill metadata
- [ ] CLI integration: `skilld add @handle` resolution
- [x] OG image generation for curators, collections, skills
