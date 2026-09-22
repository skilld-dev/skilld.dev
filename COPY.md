---
scope: every user-facing string: marketing pages, meta tags, npm and registry blurbs, docs, learn content, UI copy, emails, social cards
owns: the words. DESIGN.md owns the visual system and defers voice to this file; VISION.md owns what may be claimed at all; GLOSSARY.md owns what a concept is called
---

# Copy

The canonical source for skilld's verbal identity. Pages, meta tags and package blurbs pull
from here; when a canonical string changes, change it here first, then propagate. A string that
contradicts this file is a bug, the same as a hex value that bypasses a token.

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

### UI copy patterns

These are the visual layer's half of the voice, moved here from `DESIGN.md`.

- **Button labels**: short verb phrases in mono. "Browse", "Install", "View skills". Action plus object, never the destination.
- **CTA pattern**: the first action is `Publish [noun]`, an update is `Update [noun]`.
- **Error style**: direct, helpful, no theatre. "Couldn't load curators. Check your connection and try again."
- **Empty states**: acknowledge, explain the value, provide the action. "No collections yet. Curators bundle their favorite skills into collections you can install with one command."
- **Data labels**: every metric is labeled and contextual. "12 skills", never "12". "Updated 3d ago", never "Mar 25".
- **Eyebrow text**: never stack a muted uppercase label directly above a heading. If it repeats the heading, delete it. If it carries real information, promote it into the heading or demote it to a data line below.

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
