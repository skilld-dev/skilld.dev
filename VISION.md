---
scope: skilld.dev (registry site, skilld CLI, discovery MCP server (planned, see docs/work/README.md), digest emails)
distilled-from: two-loop product model (AGENTS.md), COPY.md + DESIGN.md, ADR-0001 (URL pillars) + ADR-0002 (frozen identity) + ADR-0004 (self-sourced trending signal) + ADR-0005 (v3 product boundary), 2026-06 catalog hard-retire to indexable-only (~2.1k) + semantic search, 2026-06-16 deindex remediation (scaled-content suppression, 0.6% indexed), 2026-07-15 design engineer beachhead, Context7/skills.sh differentiation, 2026-08-04 posture decisions (free strategic asset; destination = curation authority + watch moat; beachhead framing), 2026-08-04 grill vs code audit + landscape research (installs never rank or trust; stars as the verifiable popularity signal; leaderboard kept as reviewed showcase; review-not-audit safety claim; watch asset broadened beyond the email; SEO carve-out for agent-name queries; `skilld author` as maintainer authoring aid; guides layer culled), 2026-08-20 v3 direction (Rust skilld CLI, skilld-maintained Skills, Harness, attested Artifact delivery)
last-reviewed: 2026-08-20
hard-cap: 7 principles, ~280 lines. Adding a principle requires removing one.
---

# Vision

What skilld is, why it exists, and how the pieces grow each other. This doc exists to reject ideas, not inspire them. If a section here can't reject anything real, it's wallpaper. Cut it.

---

## Mission

**Curated agent skills by humans.** Skills are knowledge, and knowledge has an author. A skill is worth installing because a person who knows the tool wrote it, so provenance is the quality signal: which repository contains it, and whether you can read it before you run it. skilld is the registry that treats this as the organizing fact. Every skill is a SKILL.md a maintainer wrote and still owns, surfaced with a link back to the source, usable with one command that works with every agent.

**Transient by default.** A Skill is knowledge, not a dependency, so the default is to use it, not to keep it. `skilld run` hands the Agent the Skill for one session and writes no file, no lockfile entry, and no Agent target. Installing stays one command away and earns its place: it is for the Skill you want in every session, and it is the only path the digest watches. This lowers the cost of trying a Skill to nothing, which is exactly the cost curation needs to be cheap to act on.

**The two loops are the whole product.** Every change must serve one; if a feature serves neither, cut it.

- **Loop 1, Activation:** anonymous discovery → run. Land on skilld.dev, see curated Skills and recent changes, open a Skill detail, copy `npx skilld run owner/repository/skill`, give it to the Agent. The Agent reads the Skill and follows it, and nothing lands in the repository. Installing is the second step, taken only for a Skill worth keeping in every session. No auth, no email, no friction. This is the SEO-bearing surface and the top of funnel.
- **Loop 2, Retention:** sign in with GitHub, bulk-import starred repositories that have Skills, watch collections, receive a digest when watched repositories change. The lifecycle hook and the moat.

They live on the same site but are sold separately: Loop 1 is the headline, Loop 2 is a CTA strip and a "Watch for changes" affordance. Identity is one namespace, the GitHub login; collection URLs are `/@<gh-login>/<slug>`.

**What we are not.** Never an AI product ("AI-powered" is banned; we serve developers who use agents, we are not one). The skilld CLI never generates Skills. The project publishes visible skilld-maintained Skills and an optional Harness for authoring. Search metadata (summaries, tags, FAQs) is machine-generated and labeled. Registry Skills retain explicit human or organization provenance. Not anti-organization: "by humans" is a claim about who wrote the Skill, not a filter on who owns the Repository.

**The contrast, named.** Context7 generates from doc chunks. skills.sh indexes a million skills and ranks them by a gameable install count; its Official badges and Packs are curation-lite bolted onto a popularity engine. skilld gives you Skills real maintainers wrote in their own repositories, admitted by a human, curated and watched, so your Agent stays current as the underlying packages evolve. Two structural edges no popularity index has: editorial judgment (a person decided this Skill earns a place) and change intelligence (we know when it moved and can tell you why it matters).

**Safety, claimed carefully.** In the year registries shipped malicious Skills by the hundreds (ClawHavoc; 13.4% of scanned public Skills critically flawed), "is this safe to run" became the first question. Every admitted Skill has provenance and readable source. Artifact attestations add source and integrity verification with exact check results. We never claim that a Skill is safe. "Secure", "scanned", and "verified safe" remain banned claims.

**Destination (north star).** Two linked bets, and pointedly not a third. First, **curation authority**: skilld becomes the place whose taste decides which Skills are worth installing, the Wirecutter of Agent Skills, where "featured on skilld" means something because most things aren't. Second, the **watch moat**: skilld is how a developer's Agent stack stays current. The asset is the revision history, diff intelligence, and freshness data, which power the registry pages, the SEO surface, and the digest alike; the email is one output of the asset, never the asset itself. A vendor shipping `skills update --all` syncs files blindly; only the party holding the diffs can say what changed and whether it matters, so the bet survives that feature. Nobody else is building this, and it compounds with every watched repository. The rejected third bet: becoming "the npm of Skills." GitHub is the source of truth and should stay so; we build no publish flow, own no namespace, and hold no Skill hostage. Being the trusted layer on top of GitHub is the position; being the infrastructure underneath is a fight we don't need and a capture we don't want.

---

## North star user

**Beachhead: the design engineer.** A developer who builds product UI with taste. Lives in Nuxt or Vue, Tailwind, motion-v; ships their own interfaces and cares that agent output matches their standards, not just compiles. Drives Claude Code, Cursor, or Codex daily and has felt the gap between what the agent knows and what the maintainer of the library actually intended. They already read source before installing a dependency; "read the SKILL.md before you run it" is how they think.

**Ceiling: the Agent-native developer.** Anyone who drives an Agent and wants trustworthy, current Skills for their stack. The design engineer is the niche we win first because the audience is reachable, the canonical repositories are few and known, and taste is the exact thing curation sells. Design engineering is the beachhead, never the ceiling; expansion is more curated verticals, not a looser bar.

When they land, they want to know who wrote the Skill and whether it is current. When they install, they want files in their repository they can read and edit. When their stack moves, they want one email that says what changed and why it matters.

**Who it's not for.** The contrast only has an edge if the foils are named:

- **The prompt hoarder** chasing "1000+ ChatGPT prompts" energy. They want volume and novelty; we sell judgment and maintenance. Routing them away costs nothing.
- **The enterprise platform team** wanting private registries, SSO, governance, and compliance workflows. Real market, not our product. Private GitHub Artifact delivery does not add these obligations.
- **The growth-hacking Skill author** who wants promoted placement, badges, install-count leaderboards to climb. Supply-side maintainers are partners, and their reward is provenance and traffic to their repository, never a marketing channel to buy.
- **The agent vendor** wanting exclusivity or first-party favoritism. One command, every agent; no vendor gets a privileged lane.

---

## Money posture

**skilld is free, and free is the strategy.** The product's return is audience, SEO authority, distribution for the CLI, and trust that compounds toward the founder's paid work (Nuxt SEO Pro, sponsorships, whatever comes next). Naming this matters because it settles arguments in advance: there is no revenue argument for a feature, so features are judged purely on the two loops.

Free is also what makes the curation credible. A registry that sells placement cannot claim editorial judgment; the moment a listing can be bought, "featured" is worthless. Independence from paid placement is the same move as nuxtseo's independence from platform capture: the users who notice are exactly the users whose trust compounds.

The cost side is a real constraint, not a footnote: the stack (Workers, D1, Vectorize, email) must stay cheap enough to run indefinitely at zero revenue. A feature whose marginal cost scales faster than its loop contribution is rejected on cost alone.

**Rejects:** paywalls on either loop; ads; sponsored or promoted listings; pay-to-list or pay-to-rank; donation nagging in the UI; enterprise contracts that convert a free asset into a support obligation; any feature whose justification is "future monetization."

**Test:** does the change create an obligation to anyone other than the developer using it? If yes, fail.

---

## The game loop

Each surface feeds the next. A change that strengthens a loop edge is high-leverage; a change that touches no edge is suspect.

1. **The skilld CLI** (`npx skilld run owner/repository/skill`) solves the day-1 problem: use a Skill right now, across every Agent, with nothing to clean up. `npx skilld install` is the second command, for a Skill worth keeping as local files and keeping current. The CLI is the trust anchor and the distribution unit; the run command itself travels in READMEs, tweets, and docs, and it is cheaper to share because trying it is free.
2. **The registry site** converts search intent into installs. Skill, repository, and owner pages under `/gh/*` rank for the queries our users search; npm-guides pSEO and marketing pages extend the surface. Every indexable page is a curated page (principle 2), which is what makes the surface recover and hold rank after the 2026-06 suppression.
3. **Collections and curators** are the people layer. A curator assembles a stack at `/@login/slug`, installable in one command. Collections are the shareable artifact: a curator promoting their own collection is distribution we don't pay for, and people-first discovery (Letterboxd energy: people first, counts as context) is the brand.
4. **Watch and digest** convert a visitor into a returner. Sign in with GitHub, import starred repositories, watch what you depend on; the digest arrives when something actually changed. This edge feeds itself: digest links land back on Skill pages, freshness data makes the registry pages better.
5. **Back-edge: freshness is shareable.** "X updated their skill, here's the diff that matters" is a screenshot and a post. The digest, the changelog view, and the collection page are all artifacts a developer shares unprompted, feeding edges 1 and 2.

**Channels.** Named so channel ideas can be rejected too. Founder audience first: build-in-public posts from Harlan's account are first-class work. Then: registry SEO (edge 2), the install command spreading through maintainers' own READMEs, curator-shared collection links (edge 3), MCP registry listings. **Rejects:** paid ads; engagement-bait; badge-farming programs for maintainers; any channel whose copy fails the brand guidelines' banned-language list.

If a feature can't trace to a loop edge, the PR description must explain why.

---

## Universal surface gate

Applies to every user-facing route. Strategic relevance decides whether work belongs in the product; it does not earn placement on a page. Each page state gets one primary user question, one primary action, one owning concern. An overview may show a verdict and compact doorways; it does not become a second home for every concern it links to. Disclosure changes initial paint, not scope.

**Test:** can the page be named as one question, and does every artifact materially help answer it? Does the page offer one obvious next action? If not, split, move, merge, or cut before building.

---

## Principles

The filter for skilld-scoped work, precise enough to hold a proposal next to it and say no in 30 seconds.

### 1. Provenance is the quality signal

A Skill is trustworthy because you can see who wrote it and read it before you run it. Every surface that shows a Skill names the author and links the exact source file in its repository. Registry identity is frozen at admission (ADR-0002) so provenance URLs never rot. Machine-generated metadata is labeled as such and never dressed as authorship.

**How to apply:** no Skill card, search result, or digest entry ships without author and source link. A layout that drops provenance to save space fails review. Trust signals (official repository, owner-verified) are earned facts, never editorial favors.

**Test:** from any surface showing a Skill, can the user reach the exact SKILL.md in the author's repository in one click? If not, fail.

### 2. Curation over coverage

The 2026-06 deindexing is the founding scar: indexing everything read as scaled content and Google suppressed the site to 0.6% indexed. The fix was subtraction: catalog hard-retired to ~2.1k indexable skills, tags curated 387 → 271. Every admitted skill, every indexable page, every tag exists because a judgment was made, and the judgment must be reconstructible. Growth in rows is not growth.

**How to apply:** new content surfaces (pSEO, tag pages, generated guides) ship with an explicit admission bar and a cull path, or they don't ship. "Index it all and let Google sort it" is the named failure mode. Removing pages is progress when the bar rises.

**Test:** for any indexable page, can you state why a human curator would publish it? Does the change grow the number of skills a visitor can trust, or just the count? Count alone fails.

### 3. Zero friction before use

Loop 1 admits no gate, and the first command costs the user nothing. Anonymous visitor to copied run command with no account, no email, no wizard, and no file written. The copy button is the conversion event and time-to-copied-command is the metric. Everything between landing and that copy is friction to remove, not surface to decorate.

**How to apply:** no auth walls, newsletter modals, or "sign up to install" anywhere on the discovery path. Every Skill surface leads with the run command; the install command sits under it as the opt-in for keeping the Skill. Loop 2 CTAs stay a strip and an affordance, never an interstitial. When a change touches discovery or skill detail, ask whether it moves the copy sooner.

**Test:** can a first-time anonymous visitor go from landing to a working run command inside a minute, and does that command change nothing on their disk? If any step demands identity first, fail.

### 4. The digest earns its send

Loop 2 lives or dies on one email being worth opening. A digest says what changed and why it matters: the diff that affects usage, not commit noise. The revision and diff pipeline behind it is the deep asset; digest quality is the proof that watching skilld beats watching GitHub notifications.

**How to apply:** digest content is curated by the same bar as the site: material changes summarized, noise dropped, silence when nothing meaningful happened. An empty month sends nothing. Watched changes arrive monthly; the user can turn the digest off. The separate weekly email covers trending Skills. Never increase digest frequency without the user's choice. The bet is instrumented, not assumed: digest opens, clicks, and forwards are the evidence that decides further Loop 2 investment (bar lives in docs/work/README.md).

**Test:** would a developer forward this digest to a teammate? Does it link back to a page that shows the change? A digest that exists to remind users we exist fails.

### 5. Local files, never a runtime dependency

Skills install as plain files in the user's repository. They work offline, survive skilld going down, and can be read, edited, and committed like any code. The registry is a discovery and freshness layer, never a runtime the Agent phones home to. This is the structural contrast with Context7's cloud API and the deepest form of "read before you run."

**How to apply:** no feature may insert skilld into the agent's runtime path. Update flows propose diffs to local files; they never make files remote. The MCP server serves discovery and search, not skill execution.

**Test:** if skilld.dev vanished tonight, does every installed skill keep working untouched? If any shipped feature answers no, fail.

### 6. Every agent, one command

`skilld install` works with every Agent, and no vendor gets a privileged lane. Agent-agnosticism is a trust position: the user's choice of Claude Code, Cursor, or Codex is theirs, and Skills are portable knowledge, not vendor plugins. Compatibility metadata is a fact we surface, never a tier we sell.

**How to apply:** new CLI and registry features start from the cross-agent frame; agent-specific behavior is an adapter at the edge, not a fork in the product. Product copy never assumes one agent. Partnership offers that trade placement for exclusivity are rejected by this principle, not negotiated. **SEO carve-out:** indexable meta and structured data may target the agent-name queries that have real search demand ("Claude Code skill"), naming cross-agent compatibility in the same breath; the carve-out covers search surfaces only and never extends to features, ranking, or product UI.

**Test:** does the feature work identically for a user on any major agent? If a vendor's users get a structurally better skilld, fail. (A meta description chasing a real query is not a structural advantage; a vendor-only feature is.)

### 7. Quiet craft

The interface recedes; the content speaks. Warm stone, rare rose, mono chrome, borders not shadows, the noise field in exactly three contexts. The voice is editorial: confident, warm, grounded, no hype words, every claim concrete. Craft is scope, not afterthought; a feature that works but reads loud or generic is not done. Full systems live in DESIGN.md and COPY.md; this principle makes them vetoes.

**How to apply:** polish PRs are first-class. New surfaces ship with empty states, motion within the 400ms budget, and copy that passes the banned-language list. The noise field never escapes its three contexts.

**Test:** would this screen pass as a page of a well-edited technical magazine? If it reads like a startup landing page, fail.

---

## Anti-scope

1. **skilld-maintained Skills stay separate from registry provenance.** The skilld project may publish visible skilld-maintained Skills for generation, review, search, and install guidance. They name the project as author and remain readable source assets. Generated output never enters the registry as platform-authored maintainer content. Registry Skills retain their Repository owner and exact GitHub provenance. Machine-generated search metadata stays labeled and stays metadata.
2. **We are not AI-powered.** The product category is a curated registry. "AI" never modifies skilld itself in copy, positioning, or feature naming.
3. **No pay-to-play, ever.** No sponsored listings, promoted skills, paid placement, or ads. This is the money posture made permanent: curation that can be bought is not curation.
4. **Popularity is never the quality signal.** Unverifiable third-party counts (installs scraped from skills.sh) never order a surface, never feed trust tiers, and never appear as our numbers; we cannot vouch for a figure we cannot source. GitHub stars are the one sanctioned popularity signal: verifiable at the canonical source, synced for free, honest to display. Stars may order browse surfaces (catalog sort, the human-reviewed leaderboard) and may feed trust as a supporting input (a well-starred repository has earned community evidence), but stars alone never grant the top trust tier: admission and the highest trust signals stay human judgments, the homepage's organizing principle stays curation and freshness, and no star count ever substitutes for review. **Likes carve-out (ADR-0003, 2026-08-10):** Skill likes are first-party (a row we wrote, keyed to a GitHub-authenticated user, so we can state exactly what the number counts) and Skill-grained (stars measure a repository and lend the same count to all twenty Skills inside it). Like counts may be displayed and may back an opt-in `?sort=likes`. They never feed trust, never affect admission, never become a default order, and never order a trending surface: a board ranked by our own users' taste is a mirror. The carve-out covers display and that one sort key; every other clause above holds unchanged. **Trending carve-out (ADR-0004, 2026-08-19):** `/skills/trending` and the weekly email are ordered by social mentions we record ourselves from the public X and Bluesky APIs, and by star surges on repositories holding exactly one Skill. Both pass the test that admitted stars and rejected installs: we can state what the number counts, and a reader can check it, because every socially attributed row ships the post that named the Skill with its author and link. Each row states which route named it; a heading may never claim people named something when a star count did. Neither signal feeds trust or admission, and installs stay barred.
5. **We are not the npm of skills.** No publish flow and no namespace ownership. GitHub is the registry of record. Artifact delivery may cache immutable signed bytes for installation. It never becomes the source of truth. Protocol work serves the skilld CLI and requires a dated ADR.
6. **We do not optimize engagement.** Sessions per week is not a goal. Time-to-install and digest usefulness are. No streaks, no notification escalation, no re-engagement campaigns beyond the digest the user asked for.
7. **We are not an enterprise product.** No private registries, SSO, seats, or compliance surface. Private GitHub Artifact delivery is transient and account scoped. The free posture cannot carry enterprise support obligations.

---

## How this filter gets used

- **Roadmap:** every feature must trace to a loop edge and pass the applicable principles. Eligibility, then placement (surface gate). Anything that cannot pass both gets cut.
- **PR review:** every visible UI change states the page question, primary action, and owning concern, and records PASS/FAIL against applicable VISION, design, and brand gates. Citing one principle never waives another.
- **Subtraction:** every added artifact, route, tag surface, or noun names what it removes, merges, or moves. "Nothing dies" is not an accepted answer. Every surface is a permanent maintenance loan against one person's attention.
- **AI sessions:** this doc is referenced from AGENTS.md so every session loads it. Evaluate against the principles before writing code.
- **Disagreement:** when this doc and existing code conflict, this doc wins. Existing code is evidence, not precedent. Change the code or record a dated, narrowly scoped exception; do not weaken the rule to bless drift.

## When to update this doc

Edit freely. Two-way door. The only commitments are:
- Hard cap: 7 principles. Adding one removes one.
- Every principle must be falsifiable (have a real PR, feature, or row it would reject).
- Principles should accrete evidence: as user feedback and metrics arrive, quote them in place, the way a principle without a scar is a guess.
- The money posture and the Destination change only by a dated ADR, not an edit.
