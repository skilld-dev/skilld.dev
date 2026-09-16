# Brand Guidelines — skilld.dev

> The source of truth for skilld's identity, positioning, voice, and copy conventions. Primarily for AI agents writing copy, naming features, and making editorial decisions. Visual system lives in `design-guidelines.md`.

## What skilld Is

skilld is a curated registry of AI agent skills written by real people in their own GitHub repos. Every skill is a SKILL.md a maintainer wrote and still owns, surfaced with a link back to the source. One install command works with every agent. When a watched repo changes, skilld emails a digest so users learn what changed and why.

### Core Thesis

Skills are knowledge, not packages, and knowledge has an author. A skill is worth installing because a person who knows the tool wrote it, so provenance is the quality signal: whose repo it lives in, and whether you can read it before you run it. A curated registry of human-written skills plus a watch-for-changes loop turns discovery into a habit, not a one-off lookup.

### One-liner

**Curated agent skills by humans.**

### Two loops

- **Loop 1 — Activation:** anonymous discovery → run. Land, copy, run. No friction. Install is the opt-in second step.
- **Loop 2 — Retention:** sign in with GitHub, watch your stack, get a weekly digest of what changed.

## Positioning

### What we are
- A curated registry of AI agent skills written by real people in their own GitHub repos
- A provenance layer: every skill links back to the repo and the maintainer who wrote it
- Organization-owned skills stay in the registry and stay searchable. The homepage leads with skills by identifiable people because provenance is the point, but org skills are ranked lower, not excluded
- One command, every agent: `npx skilld run skilld:owner/repo/skill` to use a skill now, `npx skilld install skilld:owner/repo/skill` to keep it
- A watch-for-changes layer: sign in with GitHub, get a digest when watched repos change

### What we are not
- An AI product (we serve developers who use AI agents, but we are not "AI-powered")
- A generator of skills. We surface what people wrote; we do not write skills for them. Search metadata such as summaries, tags, and FAQs is machine-generated, and we never imply that of the skills themselves
- Anti-organization. Never write copy suggesting org-owned skills are unwelcome or absent. "By humans" is a claim about who wrote the skill, not a filter on who owns the repo

### Differentiation

| | Context7 | skills.sh | skilld |
|---|---|---|---|
| Model | Cloud API, raw doc chunks | Flat list, ranked by installs | Curated registry + local files |
| Organizing unit | Libraries | Skills (leaderboard) | Repos and curated collections |
| Discovery | Search by library name | Search + install count | Recently updated skills, featured collections, watch CTA |
| Quality signal | None (raw docs) | Popularity | Human authorship, editorial curation, official-repo signal |
| Change tracking | None | None | Watch for changes → weekly digest |
| Offline | No | Yes | Yes, skills are local files |

The pitch: Context7 gives you docs. skills.sh gives you a leaderboard. Skilld gives you skills real maintainers wrote in their own repos, curated and watched, so your agent stays current as the underlying packages evolve.

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
| **package skill** | A skill tied to a specific npm package, drafted with the skilld-maintained `generate-package-skill` Skill and owned, edited, and published by its maintainer in their own repo | Never platform-authored; the platform publishes no skills (VISION anti-scope 1) |
| **guide skill** | A curation tag on skilld.dev for skills not tied to a package | Distributed as git skills, tagged for filtering in browse views |
| **collection** | A curated bundle of skills assembled by a collection author | Not "preset", "pack", "bundle", or "kit" in UI (fine in marketing prose) |
| **author** / **curator** | A developer who maintains one or more collections on skilld. Identity is their GitHub login. | Either word is fine; "curator" reads warmer in editorial copy, "author" in product UI |
| **registry** | skilld.dev, the central hub for curated agent skills | Also hosts the MCP server |
| **run** | Handing the agent a skill for the current session. `skilld run` prints the skill and writes no file | The default verb. Every skill surface leads with the run command. Not "try", "preview", "use once", or "ephemeral" |
| **install** | Adding a skill or collection to your agent's configuration as local files | Not "download", not "add". `skilld install` is the opt-in second step, for a skill worth keeping in every session |
| **agent** | The coding tool that reads skills: Claude Code, Codex, Cursor, Gemini CLI, and the rest of the CLI's targets | Not "client", "tool", "editor", or "IDE". Say "your agent" in UI; name a specific agent only inside the setup picker |
| **project install** | Installing into the current repository, the default | UI label: "Project". Not "local" |
| **global install** | Installing into the agent's home directory, so every project sees the skill | UI label: "Global". Not "system-wide" |
| **watch** | Subscribing to a repo or collection so you receive digest emails when it changes | The Loop 2 verb. Not "follow", not "star", not "subscribe" |
| **digest** | Periodic email summarizing changes to your watched repos | Weekly default; daily and off are options |
| **weekly** | The one email everyone gets: skills you liked that changed, plus what trended | Lowercase, "the weekly". Not "newsletter", "roundup", or "trending digest". Opt-out, on by default. Sits beside **digest**, which is the separate watched-repo email |

### Feature naming
- Name features descriptively, not cleverly. "Stack selector" not "StackMatch"
- No trademark-style capitalization for features (not "Smart Collections")
- CLI commands use lowercase: `skilld run`, `skilld install`, `skilld update`

## Voice & Tone

### Personality
Confident, warm, editorial. Think independent technical magazine, not startup landing page. We sound like a developer sharing their honest opinion over coffee, not a company selling a product.

### Register by context

| Context | Register | Example |
|---------|----------|---------|
| Marketing (hero, landing) | Editorial, declarative | "Curated agent skills by humans." |
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

**"Naming" as a verb:** Banned in user-facing copy. `named`, `naming`, and `named by` are our internal words for the social-attribution route, and they read as jargon to a reader. Say "talked about" or "mentioned". "3 devs talked about it", never "3 people named it". The technical sense survives in code identifiers, ADRs, and code comments, where the precision is the point.

**"People" for our audience:** Prefer "dev" and "devs". They are developers, and "people" is a vaguer word doing a smaller job. "3 devs talked about it", not "3 people named it". "Developers" in full is fine in longer prose where the shorter form reads clipped.

**Exception, the humans-versus-generated claim:** when the contrast is authorship by a human against machine generation, "human" and "person" are the right words and "dev" weakens the point. "Curated agent skills by humans" and "person-authored skills" stay as they are. The rule is about naming our audience, not about the provenance claim.

**First person in CTAs:** Do not put skilld in the sentence. "We send this every Monday" spends the words on us. State the content, then the destination: "Trending skills to your inbox every Monday". The reader and what they get are the only two things in the line.

**Contrast pattern:** Never use the "it's not X, it's Y" rhetorical structure.

**Punctuation:** No em dashes or hyphens used as dashes. Use commas, semicolons, colons, or separate sentences.

### Tone modulation
- **Celebratory moments** (new curator, collection published): understated acknowledgment, never confetti energy. "Your collection is live. Share your install link."
- **Error states**: empathetic but brief. State what happened, what the user can do. No apologetic theater ("We're so sorry!").
- **Onboarding**: informative, not hand-holdy. Developers don't need to be walked through basic concepts.

## Messaging Framework

### Tagline
**Curated agent skills by humans.**

### Elevator pitch (2 sentences)
Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes.

### Value propositions

| For... | Value |
|--------|-------|
| Developers picking skills | Skills written by people who know the tool, with the source one click away, and one install command across every agent |
| Developers staying current | Watch the repos you depend on, get a weekly digest when their skills change |
| Teams standardizing | Hand-picked collections install a stack in one command |

### How we talk about the product in different lengths

**5 words:** Curated agent skills by humans.

**1 sentence:** Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on.

**2 sentences:** Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes.

**1 paragraph:** Skilld is a curated registry of agent skills written by real people in the GitHub repos developers already depend on. Every skill stays in its author's repo with a link back to the source, so you can see who wrote it and read it before you run it. The platform tracks those skill files, surfaces what changed, and ships them through one install command that works across every agent. Sign in with GitHub to watch the repos you depend on; we send a weekly digest when their skills change so your agent stays current as the underlying packages evolve.

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
