# CEO Strategic Review: skilld.dev — Applying Matt Pocock Skill Discussion Insights

Source: Twitter thread on Matt Pocock's Claude Code skills (~25 replies). User asked how feedback maps to skilld.dev (curated registry of agent skills).

## 0. Theme Extraction from Discussion

| Theme | Frequency | Voices | Underlying JTBD |
|---|---|---|---|
| Workflow chaining / "show me how skills connect" | 5+ (dumb_coiner, regExpParser, askpascalandy, Joaola99) | "domain-model -> to-prd -> to-issues" | "I can't tell what a skill does until I see it composed." |
| Video / visual demos | 4+ (uxaistudio, neiker, regExpParser, bressanrafa) | "videos on how to use them" | "Skills are invisible. I need to *see* them work before I trust them." |
| Docs site with WHY | 3+ (regExpParser, mykytabatrak, dumb_coiner) | "in-depth WHY behind these skills" | "I need the mental model, not just the file." |
| Docs rot — keep raw markdown + grep | 1 strong (aias_0) | "Docs sites rot. Engineers grep." | "Don't build a fancy thing that goes stale." |
| Plugin / marketplace distribution | 5+ (matteoantoci, SilentA99672, barb1709_, nimdeekan, bressanrafa) | "make it a plugin" | "Reduce install friction." |
| First-view USP / hook clarity | 1 strong (yuki__shu1224) | "USP must be clear in first view" | "I bounce in 3 seconds if I don't get it." |
| Use cases / case studies | 3+ (bressanrafa, askpascalandy, Joaola99) | "story about how you chain them" | "Show, don't tell." |
| Evals / observability | 2 (rodrigoelias, sienio4) | "Evals", "Observability skills" | "How do I know the skill is *good*?" |
| Curator/people-driven discovery | 1 strong (DomJohnnie) | "we surface this user's skills" | Validates skilld's people-first thesis |
| Easy-install copy/paste | 1 (Joaola99) | "copy/paste in main Readme" | One-line install is the conversion event |

**Dominant signal:** skills are invisible until composed in a workflow with a story. skilld.dev today shows skill cards + curator profiles, but doesn't show *the chain*.

---

## 1. Nuclear Scope Challenge

- **Premise:** skilld.dev today is a *registry*. Without (a) WHY the curator chose them, (b) HOW they chain, (c) WHAT they look like running, every skill is a `SKILL.md` the user must imagine into their workflow. Cost of inaction: developers install one, can't tell if it works, churn off → "another package list."
- **Success Metric:** Install-through-rate per collection view. Secondary: time-to-first-install, 7-day return rate.
- **Existing Leverage:**
  - `/people/[handle]/[slug]` — collections already have editorial context + `reason` fields.
  - `SkillReceiptsPanel.vue` + `SkillReceiptsBadge.vue` — social proof primitives exist.
  - `BlueskyThread.vue` — AT Protocol wiring already in place.
  - `OgImage` — per-skill / per-curator OG already generates.
  - `server/api/feed/recent-publishes` + `recent-updates` — activity feed exists.
  - `reason` field on collection items — exists but likely under-rendered. **This is the gold.**
- **12-Month Ideal:** Developer lands → 30s to grok a curator's *workflow* (not just skill list) → watches a 30s capture of it running in Claude Code → installs the chain with one command → sees receipts that 14 others ran it in 7d without errors. Spotify-for-skills: playlists, not packages, with receipts.

---

## 2. Mode Selection: SELECTIVE EXPANSION

skilld has the right bones (people-first IA, collections, AT Protocol, profiles, receipts, OG). Cathedral Mode would tempt simultaneous video/docs/plugin rebuild → dilutes thesis. Twitter feedback isn't asking for a new product — it's asking the existing one to **make the workflow visible**. Polish/extension job: surface chain, surface WHY, surface proof.

(Cathedral mode for "skilld is a Claude Code plugin marketplace" held as P6 below — opt-in, since plugin distribution requires versioned infra not yet load-bearing.)

---

## 3. The 10-Star Vision

- **Magic Version:** Paste `@handle` link into Claude Code → inline 20s video of that workflow running → 3 endorsing curators → one install command → 60s later agent behaves like curator's agent → follow-button for update notifications.
- **Incremental Wins:**
  1. **Workflow Story Cards** on every collection: render `domain-model → to-prd → to-issues` as visual chain (use `nuxtseo-content:diagram` skill / D2 / Mermaid) above install command.
  2. **30-second "skill in motion" loop** on each skill detail — auto-playing muted asciinema/screen-recording, curator voiceover transcript below.
  3. **"Why this skill" pull-quote** — promote curator `reason` to hero on `/skills/[slug]` with avatar + profile link.
  4. **Raw markdown grep endpoint** — `skilld.dev/skills/[slug]/raw` + `/api/grep?q=...`. Direct answer to aias_0. 1-day build.
  5. **Workflow chain install** — `skilld add @x/y` works for collections already; add `skilld run @x/y` to dry-run the chain locally, surfacing exactly which skills fire on which triggers.

---

## 4. Cognitive Audit

- **Inversion (most likely failure):** Curators don't fill `reason` → WHY layer renders empty. **Mitigation: require `reason` on publish with LLM-drafted pre-fill.** Single highest-ROI change in this report.
- **Door Type:** P1–P5 all Two-Way (CSS, components, optional fields, additive endpoints). P6 (plugin) is One-Way — explicitly deferred.
- **Subtraction:** Cut separate `/docs` site (aias_0 right — docs rot). Cut video CMS — accept asciinema/YouTube/Loom URLs as frontmatter, render, done. Cut net-new stats surface beyond `app/pages/skills/stats.vue` — receipts already do this job.

---

## 5. Strategic Recommendations

| # | Proposal | Value | Effort | Decision | Rationale |
|---|---|---|---|---|---|
| P1 | Promote curator `reason` to hero on `/skills/[slug]` | 10 | S | Recommended | Highest leverage. Unlocks WHY layer. |
| P2 | Workflow Story Card (D2/Mermaid chain) on collection page | 9 | M | Recommended | Solves dominant "show me how they chain" theme. |
| P3 | Skill-in-motion video/asciinema slot on skill detail | 9 | S | Recommended | Frontmatter field + player. No CMS. Solves first-view hook + 4 video voices. |
| P4 | Raw `.md` + public grep endpoint | 7 | S | Recommended | Direct response to aias_0. Cheap. Unlocks LLM ingestion. |
| P5 | Required `reason` field with LLM draft in `CollectionEditor.client.vue` | 9 | S | Recommended | Activates P1. Without this, P1 cards render empty. |
| P6 | Claude Code plugin distribution | 8 | M | Optional / next sprint | 5 voices asked. Two-Way if scoped to thin wrapper. Hold until P1–P5 ship + MCP contract versioned. |
| P7 | Hero/USP rewrite — replace generic tagline with one above-the-fold workflow loop | 7 | S | Recommended | yuki's first-view critique applies to skilld.dev itself. |
| P8 | Standalone `/docs` site | 2 | L | Rejected | aias_0 nailed it — docs rot. Knowledge belongs in SKILL.md + raw endpoint. |
| P9 | Evals dashboard per skill | 6 | L | Deferred | rodrigoelias/sienio4 raised. Real but premature. Revisit after 100+ active curators. |

---

## 6. Zero Silent Failures Registry

| Path | Potential Failure | Handling Strategy | User Visibility |
|---|---|---|---|
| Nil (curator `reason` absent) | Hero on `/skills/[slug]` empty quote box | LLM-draft fallback at publish; if null, render skill description with subtle "no curator note yet" label | Visible: degraded but coherent + CTA |
| Nil (no skills in collection) | Workflow chain has 0 nodes | Suppress diagram when `items.length < 2`; fall back to single-skill layout | Visible: clean fallback |
| Error (video URL 404/CORS) | Embed fails silently, dead space | Error boundary; on load fail show thumbnail + external link | Visible: graceful degradation |
| Error (D2/Mermaid render fails) | Component throws on malformed chain | Server-side catch, fall back to ordered list with arrow icons; log telemetry | Visible: list fallback, no stack trace |
| Error (grep endpoint timeout/no results) | Slow query / abuse | 200 with `{results:[], message:"No matches"}`; edge rate-limit; cache top 100 | Visible: explicit empty state |
| Stale (curator updates skill, follower drift) | Chain shows v3, follower has v1 | Surface `freshness` indicator on every node; re-sync CTA on profile | Visible: per-node freshness badge |
| Stale (LLM-drafted reason outdated) | Auto-draft no longer reflects SKILL.md | On SKILL.md update mark `reason` as `needs-review`; notify via PDS; surface "reviewed on" timestamp | Visible: review timestamp under quote |
| Scaling (1000s of skills indexed by grep) | Naive grep blows CPU | D1 FTS5 or Cloudflare Vectorize; cap result set; paginate | Backend: bounded latency |
| Scaling (video bandwidth) | 50MB MP4 uploads → egress balloons | Reject at edge; require external URLs; 5MB hard cap on direct uploads + format whitelist | Visible: upload error lists sources |
| Stale (plugin distribution, P6) | Installed plugin pins old MCP endpoint contract | **CRITICAL DEFECT if P6 ships without versioned MCP contract.** Precondition: ship `skilld.dev/api/mcp/v1` with semver + deprecation policy *before* plugin | Gating constraint |

---

## 7. Action Items

- [ ] Ship **P5** first (require `reason` + LLM draft in `CollectionEditor.client.vue`) — gates everything else
- [ ] Ship **P1** (promote `reason` to hero on `/skills/[...slug].vue`)
- [ ] Ship **P3** (frontmatter `media` field on skill schema + render on skill page; pick asciinema-player or `<video>`, no CMS)
- [ ] Ship **P2** (Workflow Story Card on `/people/[handle]/[slug]` via existing diagram skill)
- [ ] Ship **P4** (raw `.md` route + `/api/grep` with FTS5)
- [ ] Ship **P7** (hero rewrite with above-the-fold loop)
- [ ] Define MCP contract versioning policy (precondition for P6)
- [ ] Telemetry for install-through-rate per collection view

**Out of scope:** standalone docs site, evals dashboard, plugin distribution (deferred), video CMS, leaderboard by downloads, IA reorg.

### Critical Files

- `app/pages/skills/[...slug].vue`
- `app/pages/people/[handle]/collections/[slug].vue` (or current collection detail route under `app/pages/people/[handle]/`)
- `app/components/CollectionEditor.client.vue`
- `app/pages/index.vue`
- `server/api/skills` (raw + grep endpoints) and skill metadata source