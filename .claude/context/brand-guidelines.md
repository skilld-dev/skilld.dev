# Brand Guidelines — skilld.dev

> The source of truth for skilld's identity, positioning, voice, and copy conventions. Primarily for AI agents writing copy, naming features, and making editorial decisions. Visual system lives in `design-guidelines.md`.

## What skilld Is

skilld is a curated registry of AI agent skills. It organizes discovery around people whose taste you trust, not download counts or algorithms. The platform authors and maintains one canonical package skill per npm package. Curators assemble these into collections. The human layer (curators, collections, editorial context, social proof via the AT Protocol) is what makes skilld more than a registry.

### Core Thesis

Skills are knowledge, not packages. The right skill for your context matters more than the most popular one. The best signal for "right" is a developer you already trust choosing it for their own workflow.

### One-liner

**Curated agent skills from trusted open-source developers.**

## Positioning

### What we are
- A curated registry and discovery layer for AI agent skills
- People first: every surface answers "who" before "what"
- An editorial platform where developer taste is the quality signal
- Two skill types: **package skills** (npm, authored by skilld) and **guide skills** (general knowledge, authored by people)

### What we are not
- An AI product (we serve developers who use AI agents, but we are not "AI-powered")

### Differentiation

| | Context7 | skills.sh | skilld |
|---|---|---|---|
| Model | Cloud API, raw doc chunks | Flat list, ranked by installs | Curated registry + local files |
| Organizing unit | Libraries | Skills (leaderboard) | People (curators) |
| Discovery | Search by library name | Search + install count | Curators, collections, stacks |
| Quality signal | None (raw docs) | Popularity | Editorial curation, curator reputation |
| Social proof | None | Download numbers | Real people via AT Protocol |
| Offline | No | Yes | Yes, skills are local files |

The pitch: Context7 gives you docs. skills.sh gives you a leaderboard. Skilld gives you knowledge, organized around the people you trust.

## Naming

### Product name
- Default: **skilld** (lowercase)
- Sentence start: **Skilld** (capitalize only the S)
- Domain references: **skilld.dev**
- Never: SKILLD, Skill'd, Skill-d, SkillD

### Terminology glossary

| Term | Definition | Usage notes |
|------|-----------|-------------|
| **skill** | A SKILL.md file that gives an AI agent domain knowledge | Lowercase always. Not "plugin", "extension", or "module" |
| **package skill** | A skill tied to a specific npm package and version, authored by skilld | Canonical, one per package, installed via `npm:` prefix |
| **guide skill** | A curation tag on skilld.dev for skills not tied to a package | Distributed as git skills, tagged for filtering in browse views |
| **collection** | A curated bundle of skills assembled by a curator | Not "preset", "pack", "bundle", or "kit" in UI (fine in marketing prose) |
| **curator** | A developer who maintains one or more collections on skilld | Not "author", "creator", or "maintainer" (those imply they wrote the skills) |
| **registry** | skilld.dev, the central hub for curated package skills | Also hosts the MCP server |
| **install** | Adding a skill or collection to your agent's configuration | Not "download", "add" is acceptable in CLI context (`skilld add npm:vue`) |
| **follow** | Subscribing to a curator's updates | Keep social language grounded; no "subscribe", "watch", or "star" |
| **stack** | A developer's framework and tooling combination (e.g. Nuxt + Tailwind + Vitest) | Used for personalization and filtering |

### Feature naming
- Name features descriptively, not cleverly. "Stack selector" not "StackMatch"
- No trademark-style capitalization for features (not "Smart Collections")
- CLI commands use lowercase: `skilld add`, `skilld update`, `skilld author`

## Voice & Tone

### Personality
Confident, warm, editorial. Think independent technical magazine, not startup landing page. We sound like a developer sharing their honest opinion over coffee, not a company selling a product.

### Register by context

| Context | Register | Example |
|---------|----------|---------|
| Marketing (hero, landing) | Editorial, declarative | "Curated agent skills from trusted open-source developers." |
| UI chrome (buttons, labels) | Short verb phrases, mono font | "Browse", "Install", "View skills" |
| Descriptions (cards, meta) | Informative, concise | "Full Nuxt setup for production apps. Vue 3, Nuxt modules, Tailwind, and TypeScript conventions." |
| Errors | Direct, helpful, no fluff | "Couldn't load curators. Check your connection and try again." |
| Empty states | Acknowledge, explain value, provide action | "No collections yet. Curators bundle their favorite skills into collections you can install with one command." |
| Data labels | Always labeled with context | "12 skills" not "12". "Updated 3d ago" not "Mar 25" |

### Copy principles

1. **Human first.** Write for developers, about developers. The technology (AI, agents, protocols) is infrastructure; the people and their expertise are the story.

2. **Grounded.** Every claim should be concrete and verifiable. "12 skills from 3 curators" not "a growing ecosystem of community contributions."

3. **Editorial, not promotional.** Describe what things are and why they matter. Never sell. If a skill is good, say what it does well. If a collection is useful, say who it's for and why.

4. **Concise.** Say it once, clearly. No filler, no redundancy. One strong sentence beats three weak ones.

5. **Warm undertone.** The voice is warm the way a well-designed tool is warm: approachable, considered, never saccharine. Warmth comes from specificity and care, not from exclamation marks or casual slang.

### Banned language

**Startup/hype words:** revolutionary, game-changing, supercharge, unlock, 10x, delightful, seamless, cutting-edge, next-generation, disrupt, empower, leverage (as verb)

**AI buzzwords:** AI-powered, intelligent, smart, magic, automate, autonomous, copilot (as marketing term).

**AI/agent usage guidance:** "Agent" and "skill" are fine as product category nouns ("agent skills", "install a skill"). Ban "AI" as an adjective modifying skilld itself ("AI-powered platform", "AI curation tool"). The product serves developers who use AI agents; it is not itself an AI product. When in doubt, foreground the developer, not the technology.

**Superlatives without evidence:** best, fastest, most powerful, ultimate, definitive. If something is genuinely the best at something specific, say why with evidence.

**Vague community language:** vibrant community, ecosystem, passionate developers, beloved by thousands. Be specific: "6 curators" not "a growing community."

**Contrast pattern:** Never use the "it's not X, it's Y" rhetorical structure.

**Punctuation:** No em dashes or hyphens used as dashes. Use commas, semicolons, colons, or separate sentences.

### Tone modulation
- **Celebratory moments** (new curator, collection published): understated acknowledgment, never confetti energy. "Your collection is live. Share your install link."
- **Error states**: empathetic but brief. State what happened, what the user can do. No apologetic theater ("We're so sorry!").
- **Onboarding**: informative, not hand-holdy. Developers don't need to be walked through basic concepts.

## Messaging Framework

### Tagline
**Curated agent skills from trusted open-source developers.**

### Elevator pitch (2 sentences)
Skilld organizes AI agent skills around developers you trust, not download counts. Follow curators, install their collections, keep your agent current.

### Value propositions

| For... | Value |
|--------|-------|
| Developers choosing skills | Find skills through developers whose judgment you trust, not leaderboard rankings |
| Developers sharing skills | Curate your skills, publish a collection, share one install command |
| Teams standardizing | Install a curator's full stack in one command; re-sync when they update |

### How we talk about the product in different lengths

**5 words:** Agent skills from trusted developers.

**1 sentence:** Skilld organizes AI agent skills around developers you trust, not download counts.

**2 sentences:** Skilld organizes AI agent skills around developers you trust, not download counts. Follow curators, install their collections, keep your agent current.

**1 paragraph:** Skilld organizes AI agent skills around developers you trust. Developers curate collections of skills they actually use, publish them with one command, and share an install link. You follow the developers whose taste matches yours. When they update, you re-sync. The right skill for your context matters more than the most downloaded one.

## Brand Animation — Noise Field

The animated noise field from the CLI (`skilld/src/ui.ts`) is a core brand element, not a decorative flourish. It represents the brand's visual signature: structured noise resolving into signal, which mirrors the product thesis (curation brings order to a noisy skill landscape).

### What the animation communicates

The ripple pattern expanding outward from a focal point, then settling into ambient shimmer, tells the brand story in motion: a deliberate act of selection radiating through noise until everything resolves. The fill outro (noise converging to solid) represents the moment a curator's collection crystallizes into something installable.

### Core visual DNA (platform-agnostic)

These properties define the animation across CLI, web, and any future surface:

| Property | Value | Why |
|----------|-------|-----|
| **Pattern** | Dot grid with varying density | Braille dots in CLI, circle grid on web; the density gradient IS the animation |
| **Ripple model** | Expanding concentric rings from a focal point | 3 rings, staggered 0.5s apart, Gaussian falloff from ring front, exponential time decay |
| **Hue seeding** | Deterministic per-context hue via djb2 hash | CLI: seeded from cwd. Web: seeded from route path. Same color every visit, different per page |
| **Color behavior** | Saturation and lightness scale with brightness | Dim dots are muted warm stone; bright dots are vivid and tinted. The field never reads as flat |
| **Brand mark** | Rose chevron (⏶) at #fb7185 | Sits at the ripple origin as the focal anchor |
| **Phases** | Ripple → ambient shimmer → fill outro → solid | Each phase has a distinct feel: energy, calm, resolution, permanence |
| **Ambient shimmer** | Low random jitter after ripples pass (~1.5s) | The field stays alive at rest, never static, never distracting |

### Web-specific adaptations

The CLI uses Unicode Braille characters; the web version uses a WebGL dot grid. The math model is identical; the rendering layer changes.

- **Dot grid**: 2px circles on an 8px grid, opacity and scale mapped to `brightness(x, y)`
- **Glow**: soft additive bloom on bright dots only, 4px radius max. This is the one place glow is permitted in the visual system
- **Hue seeding**: `djb2(route.path)` produces a stable hue per page. Home page gets a fixed hue (rose-adjacent)
- **Interactivity**: mouse proximity spawns a local ripple (cursor position as ring origin). Touch devices use tap position
- **Reduced motion**: `prefers-reduced-motion` shows a single static frame at ambient shimmer state, no expanding rings

### Usage boundaries

The noise field appears in exactly three contexts on the web:

1. **Hero background** (landing page): full-width behind content, base opacity 0.15, mouse-interactive
2. **Page transitions**: brief ripple burst during route changes, 300ms max duration, contained to viewport
3. **Loading / empty states**: small contained field (matching CLI proportions) while async data resolves

It does not appear in: navigation, cards, buttons, tooltips, footers, or any UI chrome. Scarcity makes it premium.

## Relationship to Design Guidelines

Brand guidelines own: identity, positioning, voice, tone, copy rules, terminology, messaging.

Design guidelines own: visual system (color, type, spacing, components, motion, responsive), UI-specific implementation of voice (button label patterns, error formatting, data label conventions).

Design guidelines should reference brand guidelines for voice decisions. Brand guidelines should reference design guidelines for visual identity details (rose accent, warm stone neutrals, mono typography).
