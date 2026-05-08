# Plan v2 — Synthesis after 4-reviewer adversarial pass

Reviewers: Skeptical PM, Staff Engineer, Curator Advocate, Design Critic.

## What broke in v1

| v1 Claim | Reality found by reviewers |
|---|---|
| P1 ("promote `reason` to hero") is highest-leverage greenfield work | **Already shipped.** `app/pages/skills/[...slug].vue:631-692` renders pull-quote with avatar/handle, piped into OG (`:268`) and meta (`:349`). P1 is a restyle/gate-on-P5, not new work. (Skeptical PM, Staff Eng, Design Critic) |
| Success metric = install-through-rate per collection view | **Unmeasurable today.** No telemetry on `installCmd` copy events. Six features ship blind. (Skeptical PM) |
| Twitter thread is roadmap signal | **Loud-minority bias.** Pocock's TS/educator audience ≠ skilld's grep-engineer audience (per `project_atproto_auth_decision.md`). (Skeptical PM) |
| P5 LLM-drafted `reason` activates the WHY layer | **Rubber-stamp risk.** Draft from SKILL.md = SKILL.md restated, exactly what aias_0 warned against. Required field = publish friction = fewer publishes. (Curator) |
| P3 video slots solve "show me motion" | **90% empty = abandonware aesthetic.** Asciinema looks 2014. Auto-play burns trust. (Curator, Design Critic) |
| P2 D2/Mermaid chain visualizes workflows | **Schema has no chain edges** (`triggers`/`depends_on` don't exist). Most collections are thematic bundles, not pipelines. D2/Mermaid looks like Confluence. (Staff Eng, Curator, Design Critic) |
| P4 raw + grep is a 1-day build | **L not S.** Skills aren't in D1/R2 as raw — fetched from `raw.githubusercontent.com` on demand. FTS5 indexes only `name/owner/display_name/slug`, not `body`. Requires schema migration + 265-skill backfill. (Staff Eng) |

## Plan missed entirely

- **Telemetry on install copy events** (the success metric instrumentation)
- **Follower attribution** ("3 followed you after viewing this collection") — what curators actually optimize for, per `project_collection_ranking.md`
- **Seeding via pre-fill UX** — documented pain point in memory (`feedback_seeding_via_prefill.md`)
- **GSC brand position chase** — documented baseline (`project_seo_baseline_2026-04-21.md`)
- **Fork/remix signal** — who built on whose work

---

## Revised scope: what actually ships

Reordered by ROI, with effort corrected and rejected items dropped.

| # | Action | Effort | Decision | Why |
|---|---|---|---|---|
| **R1** | **Instrument `installCmd` copy events** + collection view → install conversion funnel | XS | **Ship first** | Without this, every other recommendation is ship-blind. The success metric must be observable before anything is "validated." |
| **R2** | **Optional `reason` LLM-draft button** in `CollectionEditor.client.vue` — *not* required, *not* auto-filled. Curator clicks "draft from SKILL.md," edits, saves. | S | Ship | Reframes P5 from publish-gate to assist. Removes rubber-stamp risk. Curator keeps editorial voice. Uses existing `callHaikuApi` in `server/utils/anthropic.ts`. |
| **R3** | **Empty-state polish on `/skills/[slug]` curator-reason block** when no curator has written one — show "no curator note yet, [add yours]" CTA wired to collection prefill (per `feedback_seeding_via_prefill.md`) | XS | Ship | Closes the loop on the existing pull-quote block. Drives curator acquisition. |
| **R4** | **Hero rewrite as one live curator-collection artifact** (avatar + 3-4 named skill chips + install command + follow). Static by default, hover-loop optional. NO generic video. | M | Ship | Per Design Critic. Demonstrates the product in its own surface; aligns with people-first IA. Replaces generic tagline at `app/pages/index.vue:54-110`. |
| **R5** | **Custom skill-chip + arrow chain component** (border-default, mono, lucide `arrow-right`, optional trigger label above arrow) for collection pages where curator has authored an explicit order | M | Ship — but only on collections with `≥2` items AND linear-order semantic | Per Design Critic: reject D2/Mermaid for public surface. Per Curator: don't force chain semantics on bundles. Default treatment = unordered grid; chain is opt-in. |
| **R6** | **Follower attribution surface** — on curator profile, show "N followers gained from this collection in 30d" + on collection page show "saved by [avatars]" | S | Ship | Per Curator advocate: this is what curators actually optimize for. Reuses existing follow primitives. |
| **R7** | **Skill-page motion treatment** — hover-loop muted webm in terminal-framed card, `prefers-reduced-motion` respected, hosted as optimized webm (no third-party iframe, no CSP work needed) | S | **Ship as opt-in hero element on skill page**, NOT a slot that renders an empty state | Per Design Critic + Curator: avoid empty-state abandonware. If a curator records a clip, hero promotes it; if not, no UI surface appears. |
| **R8** | **Raw `.md` proxy + cache** at `/skills/[slug]/raw` (proxy GitHub, cache via Cache API/KV) | XS | Ship | Cheap, signals respect for engineers. Skip the grep endpoint until R1 telemetry shows demand. |
| ~~P4 grep over body~~ | — | M | **Defer** | Requires FTS5 body migration + 265-skill backfill. Existing search works for name/owner/slug. Validate demand via R1 + analytics on `/raw` endpoint hits before paying this cost. |
| ~~P6 Claude Code plugin~~ | — | M | **Defer** | Per `project_collection_ranking.md` thesis (no marketplace pattern). Revisit only after MCP contract versioning + R1 telemetry justify it. |
| ~~Standalone /docs site~~ | — | L | Reject | aias_0 was right; docs rot. SKILL.md + R8 raw is the answer. |
| ~~Evals dashboard~~ | — | L | Defer | Premature; receipts already cover trust signal. |

---

## Sequencing

1. **R1 (telemetry)** — gate everything else. Without metric instrumentation, we cannot tell which of R2–R7 actually move the number.
2. **R2 + R3 + R8** — small, additive, no schema risk. Ship in same sprint.
3. **R4 (hero)** — design-led; needs a real curator-collection chosen as the hero example, with copy review against `brand-guidelines.md`.
4. **R5 (chain component)** — depends on a 2-week instrumentation window from R1 to confirm collection views correlate with install conversions before adding visual weight.
5. **R6 (follower attribution)** — independent track; can run parallel to R4/R5.
6. **R7 (motion)** — last; only after at least 3 curators volunteer to record clips. Otherwise ship without and revisit.

## Preconditions / blockers

- R1 needs an analytics event sink (PostHog, Plausible, or D1 events table) — confirm which is wired
- R2 needs `ANTHROPIC_API_KEY` in Cloudflare Worker secrets (verify present)
- R5 needs an explicit `ordered: boolean` flag on the collections schema OR a fallback rule "if curator authored items in sequence within 5 minutes, treat as ordered" — TBD
- No CSP work needed for R7 (self-hosted webm avoids the issue)

## What this plan now respects (that v1 didn't)

- **Documented thesis** — anti-marketplace, anti-leaderboard, people-first, AT Protocol identity (per memory)
- **Documented baselines** — GSC position, seeding-via-prefill UX, curator follower ranking
- **Existing work** — does not redo P1 (already shipped), does not propose D2/Mermaid (already rejected by design system fit)
- **Curator's actual incentives** — followers, fork credit, surface placement; not platform metrics
- **Engineering reality** — FTS5 body ingestion, schema migrations, CSP, Workers SSR limits

## Open questions for the user

1. Which analytics sink should R1 write to? (PostHog / Plausible / homegrown D1 events)
2. Is there an explicit `ordered` semantic on collections, or do we treat all collections as unordered until proven otherwise?
3. Are you willing to defer R4 (hero rewrite) until R1 telemetry has 2 weeks of data, or ship on instinct?