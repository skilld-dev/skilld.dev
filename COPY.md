---
scope: every user-facing string: marketing pages, meta tags, registry blurbs, docs, learn content, UI copy, emails, social cards
owns: the words. DESIGN.md owns the visual system and defers voice to this file; VISION.md owns what may be claimed at all; GLOSSARY.md owns what a concept is called
---

# Copy

The canonical source for skilld's verbal identity. Pages, meta tags and registry blurbs pull
from here; when a canonical string changes, change it here first, then propagate. A string that
contradicts this file is a bug.

## Canonical assets

These exact strings. Do not paraphrase them per page.

| Asset | String | Where it goes |
| --- | --- | --- |
| Name | `skilld` lowercase by default, `Skilld` only at a sentence start, `skilld.dev` for the domain. Never SKILLD, Skill'd, Skill-d, SkillD. | everywhere |
| Tagline | Curated agent skills by humans. | index OG image alt, the 5-word form |
| Site description | Curated agent skills by humans, written by real maintainers in their own GitHub repos | `nuxt.config.ts` site description, which feeds every page's meta description |
| Elevator pitch | Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes. | about copy, registry listings, anywhere two sentences are the budget |

### The product in four lengths

**5 words:** Curated agent skills by humans.

**1 sentence:** Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on.

**2 sentences:** Skilld is a curated registry of agent skills written by real people in the GitHub repos you already depend on. One install command, every agent; watch your stack and get a digest when it changes.

**1 paragraph:** Skilld is a curated registry of agent skills written by real people in the GitHub repos developers already depend on. Every skill stays in its author's repo with a link back to the source, so you can see who wrote it and read it before you run it. The platform tracks those skill files, surfaces what changed, and ships them through one install command that works across every agent. Sign in with GitHub to watch the repos you depend on; we send a weekly digest when their skills change so your agent stays current as the underlying packages evolve.

### Value propositions

| For... | Value |
|--------|-------|
| Developers picking skills | Skills written by people who know the tool, with the source one click away, and one install command across every agent |
| Developers staying current | Watch the repos you depend on, get a weekly digest when their skills change |
| Teams standardizing | Hand-picked collections install a stack in one command |

## Register by context

| Context | Register | Example |
|---------|----------|---------|
| Marketing (hero, landing) | Editorial, declarative | "Curated agent skills by humans." |
| UI chrome (buttons, labels) | Short verb phrases, mono font | "Browse", "Install", "View skills" |
| Descriptions (cards, meta) | Informative, concise | "Full Nuxt setup for production apps. Vue 3, Nuxt modules, Tailwind, and TypeScript conventions." |
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
| vibrant community, ecosystem (community-size claims), passionate developers, beloved by thousands | the number | "6 curators", never "a growing community". Calling skilld an ecosystem is a category claim, not a size claim; see the exception below |
| named, naming, named by (in user-facing copy) | talked about, mentioned | Our internal words for the social-attribution route; they read as jargon. "3 devs talked about it", never "3 people named it". The technical sense survives in identifiers, ADRs and code comments, where the precision is the point |
| people (for our audience) | dev, devs | They are developers, and "people" is a vaguer word doing a smaller job. "Developers" in full is fine where the short form reads clipped |
| first person in a CTA | the content, then the destination | "We send this every Monday" spends the words on us. "Trending skills to your inbox every Monday" gives the reader both things that matter |

**Exception, the humans-versus-generated claim.** When the contrast is authorship by a human
against machine generation, "human" and "person" are the right words and "dev" weakens the
point. "Curated agent skills by humans" and "person-authored skills" stay as they are. The rule
above is about naming our audience, not about the provenance claim.

**Exception, the homepage hero.** The 2026-09 homepage pivot made "Taste-tested agent skills
ecosystem" the landing H1 and the page title. That "ecosystem" names the category skilld
serves: skills across agents and package managers, written by their maintainers. It is not a
community-size claim, so the scoped ban above does not cover it. Package and learn pages use
the word in the same technical sense: npm, PyPI, crates, RubyGems.

## Open questions

Wording calls this file does not settle. Add one here, resolve it, fold the answer into the
section above, then delete it from this list.

1. **Two one-sentence descriptions ship.** The site description is "Curated agent skills by
   humans, written by real maintainers in their own GitHub repos"; the recorded 1-sentence form
   is "Skilld is a curated registry of agent skills written by real people in the GitHub repos
   you already depend on." Both are true and they are not the same sentence. Decide which is
   canonical for a one-sentence slot, or record what each is for.
