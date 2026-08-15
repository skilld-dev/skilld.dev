---
derived-from: VISION.md + 2026-08-04 grill (code audit vs vision, competitive landscape research)
supersedes: SCOPE.md (deleted; build phases 1-4 shipped by 2026-05-15, IA snapshot below)
rule: every item traces to a loop edge and a VISION principle; every generated-content surface names its admission bar and cull path
last-reviewed: 2026-08-04
---

# Roadmap

Three horizons, worked in order. "Now" ships before "Next" starts in earnest.

## Now — Integrity sprint

Make the shipped product match VISION before pushing growth. SEO recovery is pending recrawl and the trust story requires honest surfaces first. Each item lands with its own proof (test, screenshot, or typecheck).

1. **Pivot ranking to GitHub stars.** `/skills` default sort moves from `installs` to `repository.stars` (already synced, verifiable, free). `SkillCard` default signal becomes stars. In `skill-trust.ts`, replace the installs-based `trust_source: 'downloads'` promotion with a stars-based threshold (supporting signal only; owner-verified/human review still gates the top tier). Retire the per-skill installs scrape (`skill-live` `fetchInstallsFromHtml`, the `installs` write-through, the skills.sh install tab/tooltips); the skills.sh crawl remains a repo-discovery feed only. *(Anti-scope 4, principle 2; `skills-query.ts`, `skills-registry.ts`, `skill-trust.ts`, `SkillCard.vue`, `skill-live/[...id].get.ts`.)*
2. **Label all machine-generated content.** Skill-page "What it does" summaries and FAQs, and the digest AI sentence, get explicit generated-content labeling. Zero unlabeled AI prose anywhere. *(Principle 1.)*
3. **Hero leads with the install command.** `npx skilld add gh:owner/repo` returns to the homepage hero; time-to-copied-command is the metric. *(Principle 3.)*
4. **Cull the npm-guides layer.** Delete `layers/guides` (pages, APIs, sitemap, canonical middleware, `scripts/ingest-guides.ts`); ship 410s for `/guides/*`. Decision dated 2026-08-04: indexable LLM prose under our own author attribution is the exact content shape that got the site suppressed in June. *(Principle 2.)*
5. **Authoring-aid reframe.** `/learn/author-npm-package-skills` and the homepage "Write a package skill" CTA reword to the sanctioned shape: `skilld author` bootstraps a draft the maintainer edits, owns, and publishes in their repo. Brand glossary corrected to match. *(Anti-scope 1.)*
6. **SEO carve-out, implemented honestly.** Meta/schema may keep targeting "Claude Code skill" queries but name cross-agent compatibility in the same string; product UI stays agent-neutral. *(Principle 6.)*
7. **Small integrity fixes.** "View publishers" no longer routes through the `/skills/official` 301; `/me` cadence editor gets real inputs instead of raw HTML elements. *(Principle 7, surface gate.)*

**Done when:** no surface contradicts a VISION principle without a dated exception, and GSC shows the guides cull and ranking swap did not regress indexed skill/repo pages.

## Next — Curation authority

The beachhead push (VISION north-star user). Curation is the claim; this horizon makes it visible.

- **Design Engineering Essentials.** Ship the flagship collection; ingest the four canonical repos from the 2026-07 pivot. The collection page is the template for what "curated by a person" looks like.
- **Curator recruitment.** A named handful of curators with real collections beats a hundred empty profiles. Target: every featured collection has a face, a rationale, and a working one-command install.
- **Safety positioning, written.** "Review, not audit" copy on the homepage and skill pages: provenance, human admission bar, source readable before you run it. Banned words stay banned ("secure", "verified safe").
- **Leaderboard as reviewed showcase.** Reframe copy so the admission bar leads ("every repo human-reviewed") and stars are the honest ordering, second. Stats page passes the surface gate or is folded into it.
- **Featured cadence.** A weekly editorial rotation (featured collection or skill) gives returning visitors a reason and the founder channel something to post.

**Done when:** a first-time visitor can tell within one viewport why this registry is curated and by whom.

## Later — Agent-native access + watch evidence

- **Discovery MCP server** at `/api/mcp`: search, skill/collection lookup, install-command handoff. Small surface on Workers next to the registry. Earns MCP-registry listings as a Loop 1 channel. Explicitly not an execution layer (principle 5).
- **Digest instrumentation.** Opens, clicks, forwards, unsubscribe rates; watch-funnel conversion (visitor → sign-in → watching → digest received). This is the evidence bar VISION principle 4 points at.
- **Evidence bar (decides Loop 2 investment):** by end of Q4 2026, if digest engagement shows real pull (opens and click-throughs trending up on a growing watch base), Loop 2 earns deeper work (diff views, per-skill change pages). If not, watch stays a maintained feature and roadmap weight shifts to curation surfaces. Either way the decision gets an ADR.

## Culled and rejected (dated)

- **2026-08-04 — npm-guides layer** (`/guides/npm/*`): deleted. Post-deindex risk outweighs the pSEO play.
- **2026-08-04 — package skills as a platform-authored line**: dead. `skilld author` survives as a maintainer authoring aid only.
- **2026-08-04 — installs metric entirely**: unverifiable third-party telemetry scraped from skills.sh; ranking, trust input, and display all pivot to GitHub stars (synced, verifiable, free).
- **2026-05-15 — atproto identity, curators/follows tables, legacy collections**: removed (SCOPE phases 1–4).

## IA snapshot (from SCOPE.md, still true)

```
/                          hero install command, curated + recently updated, featured collections
/@<gh-login>               curator profile
/@<gh-login>/<slug>        collection detail, one-command install
/gh/[owner]/[repo]/[name]  skill detail: preview, provenance, watch CTA
/skills, /skills/trending, /skills/stats, /community   browse + showcase surfaces
```

Install commands: `npx skilld add gh:owner/repo`, `skilld add @login`, `skilld add @login/collection`.
