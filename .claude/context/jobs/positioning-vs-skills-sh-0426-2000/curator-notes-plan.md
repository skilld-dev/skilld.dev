# Curator Notes: Deeper Integration Plan

_Date: 2026-04-26 (revised after codebase audit + decisions)_
_Strategy: `plan-ceo.md` (E1 narrative substance)_
_Builds on existing `dev.skilld.collection.skillEntry.reason` infrastructure_

## Decisions (locked)

1. **Lexicon field name: `takeaway`.** When the second-tier headline field ships in Phase 3, it will be named `takeaway`. One-way door: never rename or remove once curators write to it.
2. **Schema timing: defer `takeaway` to Phase 3.** Phase 1 promotes the existing `reason` field across surfaces. Validate that promotion changes engagement before paying the schema-commitment cost.
3. **Pull-quote placement: above the README, below H1+meta.** Curator voice becomes the first content a visitor reads on a skill page. Stronger editorial signal than sidebar or below-summary placement.
4. **Quick-add popover (W2): Phase 2.** Phase 1 ships display promotion only (days). W2 is real product surface (picker + mutation + toast); ship it once promotion proves the editorial wedge works.

## Codebase audit corrections

- **OG cards are takumi-rendered, not raw `og:description`.** All OG via `nuxt-og-image` with templates in `app/components/OgImage*.vue` (`Skill.takumi`, `Collection.takumi`, etc., referenced from `app/pages/skills/[...slug].vue:236`, `app/pages/people/[handle]/[slug].vue:59`). Item #5 below is reframed: editorial voice is rendered into the takumi template, not set as a meta string.
- **Cross-post infra confirmed**: `state.shareOnBluesky` flag (`CollectionEditor.client.vue:38`) → `useCollectionMutations.publish` → `server/api/collections/index.put.ts:56` posts to Bluesky. Item #7 modifies that server-side post body.

## Goal

Turn the curator **reason** field from an optional caption into the **primary editorial product** of skilld. Every surface that mentions a curator should consider: is the reason present, can it be present, should it be the headline?

When a curator picks a skill, the *why* is what beats install counts. Right now the why exists at the data layer and is rendered as muted footnote text. That mismatch is the deeper-integration opportunity.

## What already exists (audit results)

| Layer | Status | Path |
|---|---|---|
| Lexicon: `skillEntry.reason` (≤500 chars) | ✅ done | `server/utils/atproto/lexicons/dev.skilld.collection.json` |
| Lexicon: `postRef` (Bluesky thread anchor) | ✅ done | same |
| TS interfaces (`CollectionSkill.reason`) | ✅ done | `server/utils/atproto/lexicons/collection.ts:10` |
| Validation passes `reason` through | ✅ done | `validateCollectionInput`, `parseCollectionRecord` |
| Inline editor in `CollectionEditor.client.vue` | ✅ done | reason as reactive `skillMeta` |
| Inline editor in `/people/[handle]/edit-skills.vue` | ✅ done | "+ add reason" affordance, on-blur commit |
| Display on collection page | ✅ done | `app/pages/people/[handle]/[slug].vue:255–260` |
| Display on skill detail page (Picked by panel) | ✅ done | `app/pages/skills/[...slug].vue:1093–1097` |
| Bluesky thread embed | ✅ done | `BlueskyThread.vue` + `postRef` lookup |
| Collection-level `preamble` (long form intro) | ✅ done | renders on collection page header |

## The strategic gap

Today, reasons are:

- **Visually tertiary** — muted, truncated, single-line, easy to miss
- **Hidden behind hover** — "+ add reason" affordance has `opacity-0 group-hover:opacity-100`
- **Missing from key surfaces** — activity feeds, network feed, OG cards, homepage curator cards, receipts panel
- **Write-only at the collection editor** — no quick add from skill page, no prompt at endorsement time
- **Single-tier** — one 500-char field has to do the job of both headline and body
- **Undiscoverable** — no way to browse "skills with curator notes", which is the platform's most valuable subset

This plan addresses each.

## Surface-by-surface integration

### 1. Skill detail page — promote reason above the fold (HIGH)

**Current**: `Picked by` panel at `skills/[...slug].vue:1064`, well below README, summary, install. Reason is a 1-line truncated muted `<p>`.

**Change**:
- When 1+ curator with a non-empty reason exists → render a "Why curators picked this" pull-quote block at top of page, immediately below the H1, *above* the README.
- Display: curator avatar + handle + full reason in larger body type. No truncation.
- Multiple reasons → carousel or stacked, top-by-curator-followers.
- No reasons present → keep current "Picked by" panel where it is. No empty-state pull-quote.

**Visual model**: think "blurbs on a book jacket". The README is the back-cover blurb; the curator pull-quote is the front cover endorsement.

### 2. Activity feeds — reason as the headline, not curator name (HIGH)

When the GitHub-integration `recent-publishes` and `recent-updates` feeds render, **only** show `skill_published` / `skill_updated` events. The new feed type `skill_picked` (curator added skill to collection) should:

- Use the **reason** as the visible text, not the skill name
- Format: `"<reason>" — @handle, in <collection name>`
- If reason is empty, fall back to: `@handle picked <skill> for <collection>`

This **inverts the hierarchy**: the why becomes the message; the actor and target become attribution.

```
Before (no reason):  @daniel picked vue for "Nuxt Stack"
After (with reason): "Use this for v3 SSR with Pinia, not Vapor"
                     — @daniel, in "Nuxt Stack"
```

### 3. Network feed — same inversion (HIGH)

The network feed plan currently emits `picked_at` events. Apply the same headline-inversion rule. A network feed of pull-quotes is qualitatively different from a network feed of names.

### 4. Receipts panel — pair editorial with provenance (MED)

The Receipts panel (GitHub integration plan E2) shows commit SHA + sources + history. Add a sibling block when reasons exist:

```
RECEIPTS                    │ ENDORSEMENTS
Source: github.com/…        │ "Use this for v3 SSR with Pinia, not Vapor"
SHA: abc1234                │  — @daniel
Modified: 4 days ago        │ "Pairs well with my nitro skill"
…                           │  — @atinux
```

Provenance answers *what the skill is*. Endorsements answer *why someone trusted it*. Side-by-side, they are the full trust story.

### 5. OG / social cards — reason rendered into the takumi template (HIGH)

When a collection or skill page is shared on Bluesky, Twitter, Slack, the image visitors see is generated by `nuxt-og-image` from a takumi template, not a meta string.

- **Skill page OG (`Skill.takumi`)**: if the skill has 1+ curator reasons, render the highest-follower curator's reason as a quote block on the image, with `— @handle` attribution. Truncate to ~140 chars to fit the canvas. Otherwise render the README summary as today.
- **Collection page OG (`Collection.takumi`)**: already renders `preamble`. Add first skill's reason as a sub-line below it.

This makes shared links **carry the editorial voice** out to social, which is the loop that brings new visitors back. Implementation: edit the takumi template Vue components, pass the curator quote as a prop in `defineOgImage(...)`.

### 6. Homepage curator cards (LOW–MED)

Currently the "Featured curators" section likely shows curator name + collection count. Add: most-recent reason quote on hover or as a permanent sub-line on the card. Lets visitors scan curators by *what they say*, not just *who they are*.

### 7. Bluesky cross-post template (MED, ties to the publish loop)

When a curator publishes a collection (existing `state.shareOnBluesky` flag in `CollectionEditor.client.vue:38`):
- Today: cross-post likely contains collection name + URL
- Add: include the **first skill's reason** as part of the post body when present
- Format: `"<reason>" — picked vue in <collection name> on skilld.dev <link>`

This pulls the editorial substance into the Bluesky timeline, where most curator audiences live. Direct distribution amplifier.

## Write-side improvements (encourage more notes)

Currently the "+ add reason" affordance is hover-revealed and non-prompting. Most curators ignore it. Three changes to lift opt-in rate:

### W1. Default-visible affordance on first add

When a curator adds a skill to a collection for the first time, expand the reason input by default with a placeholder like `Why this skill? (one line is plenty)`. Collapse on second skill onward. New curators see the editorial pattern; experienced curators aren't pestered.

### W2. Quick-add from skill detail page

Add a `[Add to a collection +]` action on every skill page (logged-in only). Opens a popover:
- Pick existing collection or create new
- Inline reason input, focused by default
- Submit → updates collection, shows toast

Removes the "navigate to collection editor" friction. The moment of evaluation (reading a skill page) is when the reason is freshest in the curator's mind. **Capture it there.**

### W3. Reason length tiering (lexicon-additive)

Today: one `reason` field, 500 chars, used as both headline and body. Real editorial often wants:
- A 1-line **takeaway** (under 100 chars, the pull-quote)
- An optional longer **note** (under 500, the rationale)

**Lexicon evolution** (additive, no breaking change):
```json
"skillEntry": {
  "properties": {
    "packageName": { … },
    "reason": { "maxLength": 500 },     // existing, becomes "note"
    "takeaway": { "maxLength": 100 }    // new, the headline pull-quote
  }
}
```

Editor UX: two-row input. Top row is `takeaway`, bottom (optional, expandable) is `reason`. If a curator only writes `takeaway`, that's fine. If they only write `reason` (existing data), display behaviour unchanged.

**Display rule**: prefer `takeaway` for headline surfaces (activity feed, OG, pull-quote); fall back to first sentence of `reason`.

**One-way door**: adding fields is safe; renaming or removing is not. Never rename `reason` → `note` even if it would read better. Stack `takeaway` on top.

## Discoverability

### D1. "Notable picks" feed

A new homepage section: skills with the highest-quality curator notes (e.g. ≥1 reason from a `prolific` or `verified-maintainer` curator). This becomes the editorial showcase.

### D2. Per-skill share buttons that quote the reason

On the skill detail page's curator pull-quote, add a one-click "Share this pick" that pre-fills a Bluesky post with the reason quoted + the skilld URL. Curators amplify each other's editorial voice.

### D3. Collection-page "skills with notes" filter

On a curator's collection page, add a toggle: `[Show only skills with notes]`. Helps visitors find the editorial signal inside large collections.

## Implementation phases

### Phase 1: Promote what exists (no schema change, ~2–3 days) — _LOCKED FIRST_
- [ ] Skill page: pull-quote block **above the README**, below H1+meta, when reasons exist (#1)
- [ ] Activity feed entries: invert hierarchy, reason-as-headline (#2)
- [ ] Network feed entries: same inversion (#3)
- [ ] OG: render quote into `Skill.takumi` + `Collection.takumi` templates (#5)
- [ ] Default-visible reason input on first skill in `CollectionEditor.client.vue` (W1)

### Phase 2: Capture more notes (~1 week)
- [ ] Quick-add popover from skill detail page (W2) — _moved out of P1 per locked decision_
- [ ] Receipts panel: pair reasons next to provenance when both present (#4)
- [ ] Bluesky cross-post template includes first reason (#7) — modifies `server/api/collections/index.put.ts:56`

### Phase 3: Editorial layering (lexicon-additive, ~1 week) — _gated on P1 results_
- [ ] Add optional `takeaway` field (locked name) to `dev.skilld.collection.skillEntry` (W3)
- [ ] Editor: two-row input, takeaway promoted
- [ ] Display rule: `takeaway` preferred on headline surfaces, `reason` on body surfaces
- [ ] Migration of existing reasons: leave as-is, no rewrite

**Phase 3 trigger criteria** (defined now to prevent drift): ship `takeaway` if Phase 1 measurement shows ≥30% of new collections include a reason AND ≥10% of curators report (informally or via feedback) wanting "a shorter pull-quote separate from the longer rationale". Otherwise stay on single `reason` field indefinitely.

### Phase 4: Discovery (~3–5 days)
- [ ] "Notable picks" homepage section (D1)
- [ ] Share-this-pick button (D2)
- [ ] Collection-page "with notes" filter (D3)
- [ ] Homepage curator cards: most-recent quote (#6)

## Risk register

| Risk | Mitigation |
|---|---|
| **Pull-quote with embarrassing/spam content above the fold** | Filter by `moderation.ts` flagging; only render reasons from curators who pass moderation. Reuse existing `isProfileFlagged`. |
| **Long reasons break OG card character limits** | Truncate to 200 chars with ellipsis specifically for OG / social. Display rule already required. |
| **Lexicon `takeaway` field never adopted by other consumers** | Acceptable — additive field, doesn't break existing parsers. Document the field; non-skilld consumers can ignore. |
| **Curators feel pressured to write notes** | W1 defaults to visible only on first skill, not every skill. Empty reason remains valid. No visible penalty for not adding. |
| **Quick-add from skill page produces low-quality reasons** | Placeholder text models the desired tone (`one line is plenty, like "Use this for v3 SSR"`). No char minimum. Quality emerges from named-curator culture, not gating. |
| **Inverted feed hierarchy hides skills with no reasons** | When no reason, fall back to `@handle picked <skill>` format. Never silently drop the event. |
| **Existing curator data has all-caps / typo / formatting issues** | Light sanitization at read time (trim whitespace, collapse newlines for headline surfaces). No retroactive rewrite. |

## Lexicon-change calculus (one-way door)

Adding `takeaway` to `skillEntry`:
- **Reversible aspect**: don't write/read it on consumer side; data sits unused.
- **One-way aspect**: once curators write content into it, deprecating means losing data. Choose the field name carefully (`takeaway`, `headline`, `pullQuote`, `tldr` — pick one and commit).
- **Public-spec implication**: skilld lexicons are namespaced under `dev.skilld.*`; other AT Protocol apps may parse them. Adding optional fields is non-breaking. **Removing or renaming is.**

**Recommendation**: name it `takeaway`. Plain English, matches the editorial intent, no jargon.

## Out of scope

- Threaded discussion on individual skills (Bluesky thread on collections is enough for now)
- Reactions / likes on curator notes (avoid the engagement-metric trap)
- Long-form review pages (preamble at collection level handles longform)
- Notes on saves (saves are private, by design)
- AI-generated reasons (would destroy the editorial signal)
- Multiple `reason` entries per skill per curator (one per skill, edit in place)

## Bottom line

The reason field exists, the editor exists, the displays exist. The deeper integration is **promoting the field across every visible surface and lowering the friction to write it**, not building anything fundamentally new. Phase 1 is mostly UI promotion with no schema change. Phase 3's `takeaway` field is the one strategic schema commitment.

Once shipped, every social share, every feed entry, every receipts panel carries the editorial voice. The platform stops being "a list of skills with curators attached" and becomes "an editorial publication where the curators are the product".

That is the version skills.sh structurally cannot copy.