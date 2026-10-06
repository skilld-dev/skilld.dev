---
scope: every user-facing string: marketing pages, meta tags, registry blurbs, docs, learn content, UI copy, emails, social cards
owns: the words. DESIGN.md owns the visual system and defers voice to this file; VISION.md owns what may be claimed at all; GLOSSARY.md owns what a concept is called
---

# Copy

The canonical source for skilld's verbal identity. Pages, meta tags and registry blurbs pull
from here; when a canonical string changes, change it here first, then propagate. A string that
contradicts this file is a bug.

## Canonical assets

Comparison navigation uses “Compare Humanizer, Stop Slop, and No AI Slop” on the homepage, writing track, and featured Skill pages.
The writing comparison credits “Harlan Wilton” as its author, with an agent research and drafting disclosure.

These exact strings. Do not paraphrase them per page.

| Asset | String | Where it goes |
| --- | --- | --- |
| Name | `skilld` lowercase by default, `Skilld` only at a sentence start, `skilld.dev` for the domain. Never SKILLD, Skill'd, Skill-d, SkillD. | guidance only (applies everywhere, not one placement) |
| Tagline | Curated agent skills by humans. | index OG image alt |
| Site description | Curated agent skills by humans, written by real maintainers in their own GitHub repos | `nuxt.config.ts` site description (feeds every page's meta description) |
| Elevator pitch | Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes. | guidance only: no page ships it yet (use it where two sentences fit) |
| Home H1 | Agent skills for you and your agent | guidance only: the homepage H1. The page draws the rose brand dot as its full stop, so never type a period |
| Home verb line | search · run · install · keep current | guidance only: the homepage line under the H1. Each verb links to its `/cli` section: `#search`, `#run`, `#install`, `#update` |
| Home CLI link | The skilld CLI → | guidance only: the homepage link to `/cli` at the end of the verb line. The arrow is an icon |
| Home caption | Try any skill before you install it. Your agent can search for its own. | guidance only: the homepage caption under the verb line. It assumes the reader knows what a Skill is, so it names only what sets skilld apart. "Search for its own" is the skilld Skill behind the promo label |
| Home claims line | Open-source CLI, no telemetry · Analytics without cookies or IPs · A skills.sh alternative | guidance only: the homepage claims line under the search. The third item links to `/vs/skills-sh`, and the promo label closes the line |
| Promo label | Teach your agent skilld | guidance only: the last item of the homepage claims line. It opens a popover with `npx skilld install skilld --global` |
| Step 01: find | Find · Stay hyped. A curated registry, plus what devs talk about on X and Bluesky. | guidance only: the first step of the homepage lifecycle band. The step name comes first, then the pitch line, then the description. Links `/skills/trending`. The braille spark motif pairs with the pitch line |
| Step 02: run | Run · No more skill bloat. Your Agent reads the Skill now. Nothing lands on disk. | guidance only: a homepage lifecycle step. Links `/cli#run`. It carries the band's one rose dot, because run is the default. The run chip motif pairs with the pitch line |
| Step 03: install | Install or fork · One install writes to 19 Agents, pinned to a commit and checked before files land. Fork for an editable copy. | guidance only: a homepage lifecycle step. Links `/cli#install`. 19 is `AGENT_TARGETS` in the CLI's `crates/skilld-core/src/target.rs`. If that count changes, change this string |
| Step 04: update | Keep current · Keep updated. Watch repos and get a digest when their Skills change, or run `npx skilld outdated`. | guidance only: a homepage lifecycle step. Links `/cli#update`. The page prints the command through `skillOutdatedCmd`. The change grid motif pairs with the pitch line |
| Step 05: make | Make · Guides and three authoring Skills to write and review your own. | guidance only: a homepage lifecycle step. Links `/make-skill`. The three are `generate-package-skill`, `generate-project-skill` and `review-skill` |
| Step 06: build | Build on · Built to be built on. CLI, API, SDK, MCP and the Claude Code plugin. | guidance only: a homepage lifecycle step. Links `/developers` |
| Home section: trending | Trending skills this week. | guidance only: the homepage trending section heading |
| Home section: changes | Keep up with skill changes. | guidance only: the homepage section heading for watching and the digest |
| Home section: authoring | Write a skill for your project. | guidance only: the homepage section heading for making a Skill |
| Nav: CLI | CLI | guidance only: the header nav and the mobile menu item that link `/cli` |
| CLI H1 | The skilld CLI | guidance only: the `/cli` H1 and its OG title |
| CLI line | Search, run, install, and keep Skills current. | guidance only: the `/cli` line under the H1. It is the CLI's own `--help` line, so change it in the CLI first |
| CLI intro | Give your Agent Skills that real maintainers write. A run reads the current source every time, and one command updates the Skills you install. Install the skilld Skill once, and your Agent searches and loads Skills on its own. | guidance only: the `/cli` intro under the line |
| CLI claims line | Open-source CLI · No telemetry · 19 Agent targets | guidance only: the `/cli` claims line. The page counts the `--agent` values of `skilld install --help` |
| CLI install label | Install the CLI | guidance only: the label beside the CLI install chip on `/cli`. A switch above the chip picks `macOS / Linux`, `Windows`, or `npm`, and `macOS / Linux` is preselected |
| CLI install consequence | One native binary. It upgrades itself from signed releases. · Needs Node.js. npm handles upgrades. | guidance only: the line under the CLI install chip on `/cli`. The first is for `macOS / Linux` and `Windows`, the second for `npm`. `crates/skilld-command/src/upgrade.rs` in the CLI decides both. If it changes, change these strings |
| Claim: open source | open-source CLI | guidance only: the CLI. Never call skilld.dev or its site open source |
| Claim: telemetry | no telemetry | guidance only: the CLI. Its README states that it sends no telemetry or analytics. Never say it of the site, which keeps anonymous analytics |
| Claim: privacy | analytics without cookies or IPs | guidance only: analytics and privacy copy. Never the bare "privacy-friendly" |
| Claim: comparison | skills.sh alternative | guidance only: always a link to `/vs/skills-sh` |

The homepage deck has no collection section. Its old heading, "Install a collection in one command.", is retired.

### The product in four lengths

**5 words:** Curated agent skills by humans.

**1 sentence:** Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on.

**2 sentences:** Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes.

**1 paragraph:** Skilld is a curated registry of agent skills written by real people in the GitHub repos developers already depend on. Every skill stays in its author's repo with a link back to the source, so you can see who wrote it and read it before you run it. The platform tracks those skill files, surfaces what changed, and ships them through one install command that works across every agent. Sign in with GitHub to watch the repos you depend on; we send a monthly digest when their skills change so your agent stays current as the underlying packages evolve.

### Value propositions

| For... | Value |
|--------|-------|
| Developers picking skills | Skills written by people who know the tool, with the source one click away, and one install command across every agent |
| Developers staying current | Watch the repos you depend on, get a monthly digest when their skills change |
| Teams standardizing | Hand-picked collections install a stack in one command |

### Skill fork requests

The Agent request uses `Fork this Skill: <Skill page URL>`.
The Skill page's Markdown explains how to copy the source and install the local path.
Keep run as the default. Fork is the opt-in for an editable local copy.
The HTML page links to that Markdown with `Fork this Skill`.
Its description uses `A fork creates an editable local Skill with its original author and licence.`
The fork link adds `?action=fork` to request only the fork workflow.
That workflow uses a shallow fetch at one commit and plain installation output.
Check existing files before fetching. Keep licence and provenance checks.

### Watch and weekly promotions

The watch promotion says: `Watch a repo. Each month the digest lists what changed. If nothing changed, we send nothing.`
The link to `/weekly/preview` says: `Preview the weekly`.
The comparison table says: `Watch for changes, monthly digest`.

### Ranked boards

Every ranked section says what orders it. ADR-0004 and ADR-0010 set the rules.

| Surface | String |
| --- | --- |
| Trending header | `Ranked by how many separate devs talked about each one. Skills from the 20 most-starred repositories rank lower, so lesser-known skills lead.` |
| Trending header, with star rows | `Ranked by how many separate devs talked about each one. GitHub stars rank the rest of the board. Skills from the 20 most-starred repositories rank lower, so lesser-known skills lead.` |
| Trending star row label | `Ranked by GitHub stars` |
| Track talked heading | `{Noun} skills devs talked about this week`, or `this month` on the month board |
| Track talked line | `Ranked by how many separate devs talked about each one.` Track pages skip the demotion (ADR-0010), so the line never states it |
| Track pinned heading | `Hand-picked {noun} skills` |
| Track stars heading | `More {noun} skills, ranked by GitHub stars`, or `{Noun} skills, ranked by GitHub stars` when no section comes before it |
| Track quiet line | `Devs talked about {n} of these skills this week. A list ranked by devs starts at 5.` |

`{noun}` is the track's `noun` field in `clusters.ts`, such as `design` or `SEO`.
The 20 in the trending header is `DEMOTED_STARRED_REPOSITORIES` in `shared/trending-range.ts`. The page and the ranking read that one constant.
Never call a ranked section top, popular, hot, best, or a leaderboard.

## Discord digest

The weekly card uses `Trending skills this week` as its title and links to the trending page.
Each row links the Skill, the dev count, and `Source`. Keep the run command beside the source link.
Use `7-day social mentions · {date}` as the footer. Format the UTC date as `2 Oct 2026`.

## Register by context

| Context | Register | Example |
|---------|----------|---------|
| Marketing (hero, landing) | Editorial, declarative | "Curated agent skills by humans." |
| UI chrome (buttons, labels) | Short verb phrases, mono font | "Browse", "Install", "View skills" |
| Descriptions (cards, meta) | Informative, concise | "Full Nuxt setup for production apps. Vue 3, Nuxt modules, Tailwind, and TypeScript conventions." |
| Comparisons | Source-backed, conditional, candid | "Choose this Skill when you want small phrasing changes." |
| Errors | Direct, helpful, no fluff | "Couldn't load curators. Check your connection and try again." |
| Empty states | Acknowledge, explain value, provide action | "No collections yet. Curators bundle their favorite skills into collections you can install with one command." |
| Data labels | Always labeled with context | "12 skills" not "12". "Updated 3d ago" not "Mar 25" |

### Tone modulation

- **Celebratory moments** (new curator, collection published): understated acknowledgment, never confetti energy. "Your collection is live. Share your install link."
- **Error states**: empathetic but brief. State what happened, what the user can do. No apologetic theater ("We're so sorry!").
- **Onboarding**: informative, not hand-holdy. Developers don't need to be walked through basic concepts.

### UI copy patterns

These are the visual layer's half of the voice. `DESIGN.md` defers to them.

- **Button labels**: short verb phrases in mono. "Browse", "Install", "View skills". Action plus object, never the destination.
- **CTA pattern**: the first action is `Publish [noun]`, an update is `Update [noun]`.
- **Error style**: direct, helpful, no theatre. "Couldn't load curators. Check your connection and try again."
- **Empty states**: acknowledge, explain the value, provide the action. "No collections yet. Curators bundle their favorite skills into collections you can install with one command."
- **Data labels**: every metric is labeled and contextual. "12 skills", never "12". "Updated 3d ago", never "Mar 25".
- **Eyebrow text**: never stack a muted uppercase label directly above a heading. If it repeats the heading, delete it. If it carries real information, promote it into the heading or demote it to a data line below.

## Copy principles

### Authoring articles

Lead with one complete example and the common path.
Keep runtime requirements beside the affected step.
Explain Agent differences without promising identical behavior.
Link authoring Skills when they help the next task. Avoid repeated product pitches.
Attribute technical claims to current primary documentation.
Keep editorial evidence under `docs/editorial/`, outside published content.

**Personality.** Confident, warm, editorial. Think independent technical magazine, not startup landing page. We sound like a developer sharing their honest opinion over coffee, not a company selling a product.

1. **Human first.** Write for developers, about developers. The technology (AI, agents, protocols) is infrastructure; the people and their expertise are the story.

2. **Grounded.** Every claim should be concrete and verifiable. "12 skills from 3 curators" not "a growing ecosystem of community contributions."

3. **Editorial, not promotional.** Describe what things are and why they matter. Never sell. If a skill is good, say what it does well. If a collection is useful, say who it's for and why.

4. **Concise.** Say it once, clearly. No filler, no redundancy. One strong sentence beats three weak ones.

5. **Warm undertone.** The voice is warm the way a well-designed tool is warm: approachable, considered, never saccharine. Warmth comes from specificity and care, not from exclamation marks or casual slang.

## Banned language

Harlan's global writing rules apply here. No em dashes and no hyphens as dashes: use commas,
semicolons, colons, or new sentences. Never the "it's not X, it's Y" pattern. Simplified
Technical English: one idea per sentence, active voice, one word one meaning. Blog posts,
landing pages, and social copy keep their own voice.

Every row carries its reason, because a ban without one cannot tell the next writer whether a
near-miss is also banned.

| Never | Use instead | Why |
| --- | --- | --- |
| revolutionary, game-changing, supercharge, unlock, 10x, delightful, seamless, cutting-edge, next-generation, disrupt, empower, leverage (as a verb) | the mechanism, or the number | Startup register. The reader runs CI and can tell |
| AI-powered, intelligent, smart, magic, automate, autonomous, copilot (as a marketing term) | name what it does | skilld serves developers who use AI agents; it is not itself an AI product. "Agent" and "skill" stay fine as category nouns ("agent skills", "install a skill"); the ban is on "AI" modifying skilld itself |
| best, fastest, most powerful, ultimate, definitive | the specific claim, with evidence | A superlative without evidence is unfalsifiable. If something genuinely is the best at one thing, say why |
| vibrant community, ecosystem (community-size claims), passionate developers, beloved by thousands | the number | "6 curators", never "a growing community". Using "ecosystem" for a package category is not a size claim; see the exception below |
| named, naming, named by (in user-facing copy) | talked about, mentioned | Our internal words for the social-attribution route; they read as jargon. "3 devs talked about it", never "3 people named it". The technical sense survives in identifiers, ADRs and code comments, where the precision is the point |
| people (for our audience) | dev, devs | They are developers, and "people" is a vaguer word doing a smaller job. "Developers" in full is fine where the short form reads clipped |
| first person in a CTA | the content, then the destination | "We send this every Monday" spends the words on us. "Trending skills to your inbox every Monday" gives the reader both things that matter |
| privacy-friendly (bare) | analytics without cookies or IPs | A bare privacy claim cannot be checked. The mechanism can |
| open source (for the site or skilld.dev) | open-source CLI | A reader must be able to clone what the claim names, and the claim names the CLI |

**Exception, the humans-versus-generated claim.** When the contrast is authorship by a human
against machine generation, "human" and "person" are the right words and "dev" weakens the
point. "Curated agent skills by humans" and "person-authored skills" stay as they are. The rule
above is about naming our audience, not about the provenance claim.

**Exception, "ecosystem" as a category.** Package and learn pages use "ecosystem" in its
technical sense: npm, PyPI, crates, RubyGems. That names a category, not a community size, so
the scoped ban above does not cover it.

**Exception, "hyped".** Harlan approved "Stay hyped" for the find step of the homepage
lifecycle band. It names what devs talk about on X and Bluesky, which we measure and show. Use "hyped" only for social trending. "Hot", "popular" and "top" stay banned.

## Open questions

Wording calls this file does not settle. Add one here, resolve it, fold the answer into the
section above, then delete it from this list.

1. **Two one-sentence descriptions ship.** The site description is "Curated agent skills by
   humans, written by real maintainers in their own GitHub repos"; the recorded 1-sentence form
   is "Skilld is a curated registry of agent skills written by real people in the GitHub repos
   you already depend on." Both are true and they are not the same sentence. Decide which is
   canonical for a one-sentence slot, or record what each is for.
