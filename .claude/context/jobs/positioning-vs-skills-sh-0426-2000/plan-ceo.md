# CEO Strategic Review: Positioning skilld.dev vs skills.sh

_Date: 2026-04-26_

## 0. Premise (corrected)

skills.sh **does** publicly display "Security Audits" on every skill page: `Gen Agent Trust Hub: Pass`, `Socket: Pass`, `Snyk: Pass`. Alongside `Weekly Installs`, `GitHub Stars`, `First Seen`. So the trust gap is real — they have a visible feature you don't.

But the strategic conclusion doesn't flip, it sharpens. Three paths:

1. **Chase parity** (commission Snyk/Socket scans, display "Pass" badges). Result: skilld becomes "skills.sh with smaller numbers". You legitimize their frame. **Reject.**
2. **Counter-position with a better trust signal.** The Receipts panel (E2 below) becomes the wedge, not optional. A Snyk "Pass" tells you nothing actionable. "Regenerated from vue.org/docs against vue@3.5.13, 4 days ago, commit `abc1234`" tells you everything. skills.sh can't follow without rebuilding their data model. **Recommended.**
3. **Both.** Tempting, dilutes the narrative. Pick one frame.

The deeper premise still stands: your brand thesis is "people first, never a popularity contest". Curator endorsements + verifiable provenance is the trust story you can win on. Third-party security badges are a story skills.sh started a year before you and will always lead on. **Don't fight on their ground.**

The "no users yet" problem is real but it's solved by seeding 5–10 named developers with audiences (E4), not by pivoting to security audits.

## 1. The Nuclear Scope Challenge

| | |
|---|---|
| **The "So What?" Test** | If skilld.dev positions clearly against skills.sh today, the metric that moves is **first-100-curators acquisition**. Without positioning, devs see two leaderboards and pick the one with bigger numbers. |
| **What happens if we don't** | skilld becomes "skills.sh with a different sort order." Indistinguishable. |
| **Existing leverage (avoid rebuilds)** | `app/.claude/context/brand-guidelines.md` already has the differentiation table (Context7 vs skills.sh vs skilld). `app/pages/index.vue` already has "people-first" structure. `server/api/skills/[...slug].get.ts` already computes `tier` (official-org / official-user / community), `maturity` (active/steady/dormant cadence), and curator endorsements. **All the raw material for a stronger trust narrative already exists in the data layer.** This is not a rebuild. |
| **The 12-Month Ideal** | Devs say: "I install from skilld because @danielroe / @atinux / @pi0 picked it." The npm equivalent of Substack, distribution by people you follow, not by rank. |

## 2. Mode Selection: SCOPE EXPANSION (Cathedral Mode), Recommended

Your concern signals you're treating positioning as defensive (compare-feature-with-feature against skills.sh). That's Surgeon Mode, and it loses. The right mode here is **Cathedral**: stop comparing, claim a different category. skills.sh is a *directory*. skilld is an *editorial registry*. Different shape, different audience, different defensibility.

**Other modes considered and rejected:**
- *Bulletproof:* Doesn't apply, there's no specific feature to harden, this is positioning.
- *Selective:* Tempting but too timid. The current homepage hedges between popularity ("Popular skills" section) and people. Pick a side.
- *Surgeon:* The user's instinct ("we can't compete on security audits"). Reductive. Cuts the wrong limb.

## 3. The 10-Star Vision

**The "Magic" Version (one sentence):** A developer lands on skilld.dev, sees a skill installed by three people they follow on Bluesky with a one-line note from each on *why*, and installs it without ever needing a download number.

**Incremental wins (Expansion Proposals, opt-in):**

| # | Proposal | What it is | Why it differentiates |
|---|---|---|---|
| **E1** | **Curator-as-Trust-Signal (the wedge)** | Replace "X installs" everywhere on skill cards with "Picked by @daniel, @atinux, +3". On the skill page, lead with the curator quote, not the README. | This is your Snyk badge equivalent. It's a trust signal skills.sh structurally cannot copy, they have no curator graph. |
| **E2** | **The "Receipts" Panel on every skill (the wedge)** | Auto-generated provenance card on every skill page: source repo + branch + permalinked commit SHA, SKILL.md last-modified date + author, references folder contents, revision history (last N commits touching the skill), source URLs from frontmatter when declared. Already ~80% computable from `[...slug].get.ts` (`maturity`, `pushedAt`, `tier`, `branch`). | **Direct counter to skills.sh's "Security Audits: Pass" stamps.** Their badges are opaque (a third party said "Pass", trust them). Yours are verifiable (here's the SHA, click through to GitHub). Frames trust as *transparency*, not *certification*. They cannot follow without rebuilding their data model around per-skill commit history. |
| **E3** | **Stack-aware homepage** | If a visitor's `package.json` mentions Nuxt (detected via `?stack=nuxt` URL param sharing or one-time onboarding), the homepage reorders to surface curators whose stacks match. | skills.sh is global. You become personal. Pure leverage of existing data, `stack` is already in your terminology glossary. |
| **E4** | **Founding-Curator Program (positioning, not code)** | Hand-pick 10 named devs. Give each a `/people/@handle` page seeded with their real skills before launch. Make curator names appear on the homepage hero ("Curated by Daniel Roe, Sébastien Chopin, Anthony Fu, …"). | Solves "no users yet." You have no user metrics, but you have **named taste**. Borrowing reputation is the standard cold-start play and the brand guidelines already plan for it. |
| **E5** | **"Skill Passport", public regeneration log** | Public page per package skill: every regen run, the commit, the diff. "vue skill regenerated 23 times. View history." | The most Snyk-killing version of E2. Auditable history without a third-party badge. **Bezos one-way door**, if you commit to this, you commit to running regen reliably forever. |

**My opinionated recommendation:** Ship **E1 + E2 + E4** in that order. E1 reframes existing UI copy (small effort, large narrative impact). E2 surfaces data you already compute. E4 is outreach work, not engineering. E3 is high-value but later. E5 is the cathedral spire, defer until after launch.

## 4. CEO Cognitive Audit

| | |
|---|---|
| **Inversion Check (what makes this fail)** | The single most likely failure: skilld launches, the homepage still shows "Popular skills" sorted by install count (existing section in `index.vue` line 297–351), and visitors conclude it's a worse skills.sh. **The leaderboard section in your own homepage is your biggest positioning enemy.** |
| **Door Type** | **Two-Way** for E1, E2, E3 (UI copy, data presentation). **One-Way** for E5 (commits to permanent regen infrastructure) and partly E4 (curator relationships are reputational, bad first impressions burn the brand). |
| **Subtraction Check** | Cut: the "Popular skills" section ranked by install count. It contradicts the brand thesis ("never sort by downloads as primary view", your own brand-guidelines.md). Cut: any framing that compares to skills.sh feature-for-feature. Cut: pursuing Snyk/Socket badges. They'd dilute the narrative ("we're security theater too") and you'd be a smaller version of someone else's bet. |
| **Proxy Skepticism** | Are we solving for the user, or for "feeling competitive"? The user's question was rooted in fear of looking weaker. Real users don't compare badge-for-badge. They install what someone they trust recommends. Build for that. |

## 5. Strategic Recommendations

| Proposal | Value (1-10) | Effort | Decision | Rationale |
|---|---|---|---|---|
| E1, Curator-as-Trust on skill cards | 10 | S | **Recommended (do first)** | Highest narrative leverage, lowest cost. Already-computed data, just UI copy. |
| E2, Receipts panel (provenance) | 10 | M | **Recommended (the wedge, do alongside E1)** | Direct counter to skills.sh's "Security Audits: Pass" badges. Reframes trust from opaque certification to verifiable provenance. Most data already in `[...slug].get.ts`. |
| E4, Founding curator program | 9 | M | **Recommended** | Solves the cold-start problem the user actually flagged ("we have no users yet"). Non-engineering work. |
| Cut "Popular skills" section | 8 | S | **Recommended** | Required for E1 to land. Currently contradicts the thesis. |
| E3, Stack-aware homepage | 8 | M | Optional (post-launch) | High value, but premature without traffic to personalize for. |
| E5, Public regeneration history | 7 | L | Optional / defer | One-way door. Powerful but commits to regen reliability forever. |
| Pursue Snyk/Socket badges | 2 | L | **Reject** | Diluting the narrative. Same game, smaller scale. |

## 6. Zero Silent Failures Registry

Failure modes for the **launch positioning rollout** specifically:

| Path | Potential Failure | Handling Strategy | User Visibility |
|---|---|---|---|
| **Nil/Empty (no curators yet)** | A skill page with zero endorsements shows an empty "Picked by" panel, undermining the entire pitch | Show a graceful "Not yet picked by a curator. [Be the first →]" CTA. Never render an empty trust panel. | Visible, converts an empty state into a curator-acquisition CTA |
| **Nil/Empty (visitor has no stack)** | Personalization (E3) silently degrades | Default to editorially curated "Featured curators" rather than rank-based. Never silently fall back to install counts. | Visible, labelled "Featured" not "Top" |
| **Error (PDS/AT Protocol fetch fails)** | Curator endorsements fail to load on skill page → page looks like skills.sh | Cache last-good endorsements at edge (Cloudflare). On total failure, show explicit "Curator data unavailable, retrying" inline notice rather than rendering an empty card. | Visible, required, otherwise we silently look like the competitor |
| **Error (regen pipeline fails)** | E2 receipts show stale "regenerated 47 days ago" implying the platform is dead | Surface the regen status as a labeled *warning* (`amber: 47 days behind upstream`), don't hide it. **CRITICAL: failing transparency is more brand-damaging than no transparency.** | Visible, branded as honest, not broken |
| **Stale (curator changes mind / unfollows)** | Skill page still shows "Picked by @x" after they've removed it | E1 must re-fetch from PDS on each request or invalidate cache on AT Protocol record updates. Never display stale endorsements with curator names attached. | Critical, attaching a real person's name to something they didn't endorse is a **trust-destroying defect** |
| **Scaling (one viral curator)** | A single curator's skills get hammered, GitHub API rate-limits, `[...slug].get.ts` falls back to "fetch_failed" | Existing `resolutionStatus` field handles this. UI must render `path_missing` / `fetch_failed` states gracefully today (verify this is wired through to the Vue page, not assumed). | Visible, already partially handled, audit needed |
| **Reputational (founding curator leaves)** | A founding curator publicly leaves the platform | Plan explicit graceful-departure flow (archive their collections, don't silently delete). One-way door consequence of E4. | Visible, handled with respect, never silently |

**No CRITICAL DEFECTS flagged in the proposed paths**, but the **Stale path (curator endorsements)** is the closest thing to a critical defect risk in this plan. If implementation cuts corners on cache invalidation, names of real people get attached to things they don't endorse. That's catastrophic to the entire trust thesis. **Treat AT Protocol record invalidation as P0.**

## 7. Post-Review Action Items

- [ ] **Reframe the question.** The competitive moat is not security badges. It is editorial curation + verifiable provenance. Stop benchmarking against skills.sh's feature list.
- [ ] **Cut the "Popular skills" homepage section** in `app/pages/index.vue` (lines 297–351). It contradicts the brand thesis. Replace with "Recently picked by curators" sourced from PDS activity.
- [ ] **E1: Replace install-count copy with curator endorsements** on skill cards (`app/pages/index.vue`, `app/pages/skills/[...slug].vue`, `app/components/CollectionCard.vue`). Lead with names, not numbers.
- [ ] **E2: Build a "Receipts" panel component** for the skill detail page using existing `maturity`, `pushedAt`, `tier`, `branch`, `resolutionStatus` from `server/api/skills/[...slug].get.ts`. Frame as provenance, not security.
- [ ] **E4: Draft a 10-name founding-curator outreach list** with brand guidelines voice. Goal: 5 live profiles before public launch.
- [ ] **Verify** AT Protocol endorsement cache invalidation is correct (Stale path P0).
- [ ] **Audit** that `resolutionStatus: 'path_missing' | 'fetch_failed'` states render gracefully in the skill page UI today.

**NOT in scope:**
- Pursuing Snyk, Socket, or any third-party security audit certification.
- Building a "Trust Hub" page or any badge-based trust UI.
- Building npm-supply-chain scanning ourselves.
- Scoring or ranking curators publicly (a "curator leaderboard" would recreate the exact failure mode of skills.sh, one level up the stack).
- Removing install counts entirely from the data layer, keep them computed, just demote them in presentation.

---

### Critical Files for Implementation

- /home/harlan/sites/skilld.dev/app/pages/index.vue
- /home/harlan/sites/skilld.dev/app/pages/skills/[...slug].vue
- /home/harlan/sites/skilld.dev/server/api/skills/[...slug].get.ts
- /home/harlan/sites/skilld.dev/.claude/context/brand-guidelines.md
- /home/harlan/sites/skilld.dev/server/api/homepage.get.ts