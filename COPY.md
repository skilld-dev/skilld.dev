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
| Tagline | Curated agent skills by humans. | guidance only: the five-word product summary. The homepage and its OG card use the Home H1 instead |
| Site description | Curated agent skills by humans, written by real maintainers in their own GitHub repos | `nuxt.config.ts` site description (feeds every page's meta description) |
| Elevator pitch | Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes. | guidance only: no page ships it yet (use it where two sentences fit) |
| Home H1 | Agent skills for you and your agent | index H1, index OG image alt |
| Home caption | Try any skill before you install it. Your agent can search for its own. | guidance only: the homepage caption under the H1. It assumes the reader knows what a Skill is, so it names only what sets skilld apart. "Search for its own" is the skilld Skill behind the promo label. The homepage OG card uses it as its description |
| Home claims line | Open-source CLI, no telemetry · A skills.sh alternative | guidance only: the homepage claims line under the search. The second item links to `/vs/skills-sh`, and the promo label closes the line |
| Promo label | Teach your agent skilld | guidance only: the last item of the homepage claims line. It opens a popover with `npx skilld install skilld --global` |
| Promo panel note | No terminal? Paste this into your agent. | guidance only: the promo popover, under the install command and over the setup prompt |
| Setup prompt | Read https://skilld.dev/agent.md and follow it to set up skilld for me. | guidance only: `agentSetupPrompt()` in `shared/agent-setup.ts` builds it for the promo popover and the homepage Agents section. `/agent.md` serves the steps it points at |
| Hero Agent logos | The seven `AGENT_LOGOS` icons, then `+66` | guidance only: the quiet row under the homepage claims line. Links `#agents`. Its label names each Agent. 66 is `AGENT_TARGETS` minus `AGENT_LOGOS` |
| Step 1: find | Find Skills · Curated, plus what devs talk about. | guidance only: the first step of the homepage lifecycle band. The step name comes first, then one line. Links `/skills` |
| Step 2: run | Run, Fork or Install · Run leaves nothing on disk. Fork or install to keep it. | guidance only: a homepage lifecycle step. Links `/cli#run`. It carries the band's one rose dot, because run is the default |
| Step 3: update | Keep up to date · Watch repos and get a digest when Skills change. | guidance only: a homepage lifecycle step. Links `/cli#update` |
| Pitch lines | Stay hyped. · No more skill bloat. · Keep updated. · Built to be built on. | guidance only: approved pitch lines for find, run, update and build on. The DESIGN.md motifs pair with them |
| Home section: trending | Trending skills this week. | guidance only: the homepage trending section heading |
| Home section: agents | Works with your agent. · The CLI installs into 73 Agents. ChatGPT, Claude, and other MCP apps search the registry from the chat. | guidance only: the homepage Agents section heading and line. 73 is `AGENT_TARGETS.length` |
| Agents way: prompt | Paste into any agent · Your agent reads the setup steps and picks the path that fits it. | guidance only: the first way in the homepage Agents section, over the setup prompt |
| Agents way: terminal | From a terminal · Teaches your agent to search and run Skills in every project. | guidance only: the second way, over `npx skilld install skilld --global` |
| Agents way: MCP | In ChatGPT, Claude, and other MCP apps · Add the server once. Then ask the chat to find a Skill. | guidance only: the third way, over the MCP server URL. Its link, "Setup steps for each app", opens `/developers?setup=mcp` |
| Home section: demos | See what skills make. · Each demo is one recorded run: the prompt, and what the Agent built with the Skill. | guidance only: the homepage demo section heading and line. The section hides below three demos |
| Nav: demos | Skill Demos | guidance only: the header link after Trending Skills, and the same item in the mobile menu. Links `/skills/demos` |
| Demos link | All {n} demos | guidance only: under the homepage demo section. Links `/skills/demos` |
| Demos page | See what skills make · Each demo is one recorded run: the prompt, and what the Agent built with the Skill. Pick a prompt to see the output, or open it live. | guidance only: the `/skills/demos` H1 and line. The meta title is "Claude skill examples: see what each one makes" for the admitted query |
| Demo page | What /{name} made · One recorded run: the prompt, and what the Agent built with the Skill. | guidance only: the H1 and line of a demo page, `/skills/demos/<owner>/<repo>/<name>`. The meta title is "{name} skill example: {noun}" for the query "<skill> skill example", with `noun` from `DEMO_GROUPS`. The meta description is "{agent} made this {noun} with the /{name} skill from one prompt: “{prompt}”", cut at a word to 160 characters |
| Demo groups | Films and launch videos · Landing pages · UI components · Diagrams and explainers | guidance only: `DEMO_GROUPS` in `shared/demo-groups.ts`: the `/skills/demos` group headings and their lines |
| Demo stage | Open the demo | guidance only: the demo stage link. On the homepage it opens the demo page; on a demo page it opens the Skill page Demo panel |
| Demo panel | Demo · Prompt · Open live demo · Open in a new tab · Run it yourself · All demos | guidance only: the Skill page Demo panel. "Show screenshots" replaces "Open live demo" while the live output shows. "All demos" opens the demo page. It hides for a Skill page only demo, and while the Skill holds a run check flag |
| Demo provenance | {Agent logo} {model}, {effort} effort | guidance only: the recording line on the Skill page panel and the homepage stage. Screen readers and the title get "Recorded with {agent}, {model}, {effort} effort". Omit effort when the recording has no evidence for it. No date and no GitHub link: the Skill page is where visitors inspect a Skill |
| Demo outdated | Recorded on an older version of this Skill. | guidance only: under the Demo panel when the Skill moved past the recorded commit |
| Home section: changes | Keep up with skill changes. | guidance only: the homepage section heading for watching and the digest |
| Home section: why | What skilld does differently. | guidance only: the homepage Why band heading, after trending. No line under it: the three columns from `HOME_WHY_REASONS` follow directly, each a title, `summary`, and picture. Their skills.sh lines stay on `/vs/skills-sh` |
| Why trust line | Built by Harlan Wilton · Compare with skills.sh | guidance only: the line that closes the homepage Why band. The avatar and name link Harlan's GitHub, and the button opens `/vs/skills-sh`. The columns carry every claim, so the line carries none |
| Why reasons | Human first · Preview the output · Independent and open source · Open trending weights · No more skill bloat · Know what it runs · Know what it costs · No telemetry | guidance only: the reason titles. Each has a one-line `summary` for the homepage and a full `line` for the comparison. The homepage shows the first three, which Harlan chose on 2026-10-07. `WHY_REASONS` in `app/utils/why-skilld.ts` holds each title, its line, and the sourced skills.sh line, and both surfaces read it. The Preview line opens with the Demos line above. Open trending weights links the ranking code, so its weights must match `shared/trending-skill-score.ts`. Know what it runs never claims a Skill is safe |
| Comparison H1 | skilld vs skills.sh | guidance only: the `/vs/skills-sh` H1. Its lead says what skills.sh is before what skilld is. Every skills.sh fact carries its source link and the date it was checked |
| Home section: authoring | Write a skill for your project. | guidance only: the homepage section heading for making a Skill |
| Nav: developers | Developers | guidance only: the header menu trigger, and the group label in the mobile menu. The menu holds the four items below |
| Nav: CLI | CLI · Search, run, install, and keep Skills current. | guidance only: the first compact row in the Developers menu: name, line. Links `/cli`. The mobile menu shows the name only. The line is the CLI line, so change that first |
| Nav: MCP server | MCP server · For ChatGPT, Claude, and any app that speaks MCP. | guidance only: a compact row in the Developers menu. Links `/developers?setup=mcp`. The line is the MCP setup card on `/developers` |
| Nav: SDK | SDK · For your own code, with the TypeScript SDK or plain HTTP. | guidance only: a compact row in the Developers menu. Links `/developers?setup=api`. The line is the API setup card on `/developers` |
| Nav: make | Make a skill · Write a Skill for your package or project, then keep it current. · Guides and three authoring Skills · Skillgen drafts updates after each release · Get the steps | guidance only: the large Developers menu card: name, line, its two routes, action. Links `/make-skill`, which routes to the guides or to `/skillgen`. The three are `generate-package-skill`, `generate-project-skill` and `review-skill` |
| Make a skill: Skillgen route | Already ship a package Skill? · Keep it current with Skillgen · After each release tag, Skillgen opens a pull request that updates your Skill. npm packages only. | guidance only: the second question on `/make-skill`, under the Skill kinds. Links `/skillgen`. The badge reads "GitHub App" |
| Nav: setup guides | All setup guides | guidance only: the link under the Developers menu cards. Links `/developers` |
| Skillgen lead | Keep your package skill current. After each release tag, Skillgen opens a pull request that updates the Skill in your repository. You review it and decide what merges. | guidance only: the `/skillgen` line under the H1. Its first two sentences are the page's meta description. A "Make a skill" link above the H1 returns to `/make-skill` |
| Skillgen opt-in | Skillgen opens a pull request after each release tag. It runs only on the repositories you turn on here. | guidance only: the intro of the Skillgen view on `/me?view=skillgen`. The `/skillgen` step 02 says the same in its own words: Skillgen never runs on a repository you did not turn on |
| Skillgen groups | Ready · Needs a change · Turn on all (n) · n of n on | guidance only: the two groups on `/me?view=skillgen`. Ready rows say "Updates <package> on each new tag." when on and "Can update <package> when you turn it on." when off. Needs a change rows show the refusal sentence from `skillgenRefusal` |
| CLI H1 | The skilld CLI | guidance only: the `/cli` H1 and its OG title |
| CLI line | Search, run, install, and keep Skills current. | guidance only: the `/cli` line under the H1. It is the CLI's own `--help` line, so change it in the CLI first |
| CLI intro | Give your Agent Skills that real maintainers write. A run reads the current source every time, and one command updates the Skills you install. Install the skilld Skill once, and your Agent searches and loads Skills on its own. | guidance only: the `/cli` intro under the line |
| CLI claims line | Open-source CLI · No telemetry · 73 Agent targets | guidance only: the `/cli` claims line. The page counts the `--agent` values of `skilld install --help` |
| CLI install label | Install the CLI | guidance only: the label beside the CLI install chip on `/cli`. A switch above the chip picks `macOS / Linux`, `Windows`, or `npm`, and `macOS / Linux` is preselected |
| CLI install consequence | One native binary. It upgrades itself from signed releases. · Needs Node.js. npm handles upgrades. | guidance only: the line under the CLI install chip on `/cli`. The first is for `macOS / Linux` and `Windows`, the second for `npm`. `crates/skilld-command/src/upgrade.rs` in the CLI decides both. If it changes, change these strings |
| Claim: open source | open source | guidance only: the CLI and the site. `skilld-dev/skilld` and `skilld-dev/skilld.dev` are both public under MIT, checked 2026-10-07. If either repository goes private, narrow the claim to the one a reader can clone. "No telemetry" still names the CLI only |
| Claim: telemetry | no telemetry | guidance only: the CLI. Its README states that it sends no telemetry or analytics. Never say it of the site, which keeps anonymous analytics |
| Claim: privacy | analytics without cookies or IPs | guidance only: analytics and privacy copy. Never the bare "privacy-friendly" |
| Claim: comparison | skills.sh alternative | guidance only: always a link to `/vs/skills-sh` |

The homepage H1 is also the title of the homepage OG card. The page draws the rose brand dot as its full stop, so never type a period. The card types no full stop either, because its lockup dot is its one rose element. Both break the line after "for you".

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
Its description uses `Edit a local copy. It keeps the author and licence.`
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

### Task search

The search panel offers task search for a sentence, in a row at its foot. GLOSSARY.md defines the term.
Name the model's part plainly, as a language model. Never call the action AI search or smart search.
The strings live in `taskRowCopy` in `app/components/SkillSearchPanel.vue`.

Each status shows a title, then a detail line:

- Offer: `Find skills for this task`. `A language model runs a few searches and keeps the skills that fit. Takes about 5 seconds.`
- Running: `Finding skills for this task…`. `This takes about 5 seconds.`
- Nothing fits: `No skill fits this task`. `The search results are the closest matches.`
- Visitor limit: `Too many task searches in a row`. `Try again in a minute.`
- Daily limit: `Task search reached today's limit`. `Try again tomorrow.`
- Off: `Task search is off right now`. `The search results still work.`
- Failed: `Couldn't finish the task search`. `Select to try again.`

Found Skills replace the search results under the heading `Skills for this task`, with the line `A language model picked these from a few searches of the registry.`

### Behavior readings

The Skill behaviors panel shows a behavior reading under each SKILL.md match that needs approval. GLOSSARY.md defines the term and ADR-0016 the mechanism.
Name the model plainly, as a language model. Never call a reading a review, a scan, a safety call, or a false positive.
The strings live in `layers/registry/app/components/_SkillBehaviors.vue`.

- If the rules fail: `Skill behaviors are unavailable. Run skilld run to check every file.`

- Each match: `SKILL.md:42 · Quoted example. {reason}`. `behaviorVerdictLabel` in `shared/behavior-readings.ts` owns the five labels: `Instruction`, `Quoted example`, `Prohibition`, `Documentation`, `Unclear`.
- Panel note, shown when a match has a reading: `A language model read each match that needs approval in its context. Its reading is no guarantee and changes no approval.`
- The skilld CLI approval message adds `(model reading: quoted example. {reason})` to each match, and ends its list with `A language model on skilld.dev wrote each model reading. A reading is no guarantee and changes no approval.` The CLI owns that string, so change it there first.

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

**Exception, the humans-versus-generated claim.** When the contrast is authorship by a human
against machine generation, "human" and "person" are the right words and "dev" weakens the
point. "Curated agent skills by humans" and "person-authored skills" stay as they are. The rule
above is about naming our audience, not about the provenance claim.

**Exception, "ecosystem" as a category.** Package and learn pages use "ecosystem" in its
technical sense: npm, PyPI, crates, RubyGems. That names a category, not a community size, so
the scoped ban above does not cover it.

**Exception, "hyped".** Harlan approved "Stay hyped" as the pitch line for finding Skills. It names what devs talk about on X and Bluesky, which we measure and show. Use "hyped" only for social trending. "Hot", "popular" and "top" stay banned.

## Open questions

Wording calls this file does not settle. Add one here, resolve it, fold the answer into the
section above, then delete it from this list.

1. **Two one-sentence descriptions ship.** The site description is "Curated agent skills by
   humans, written by real maintainers in their own GitHub repos"; the recorded 1-sentence form
   is "Skilld is a curated registry of agent skills written by real people in the GitHub repos
   you already depend on." Both are true and they are not the same sentence. Decide which is
   canonical for a one-sentence slot, or record what each is for.
