# Build progress — twitter-feedback-pivot-0427-1530

Shipped R1, R2, R3, R8 from plan-v2-synthesis.md.

## R1 — Install copy event telemetry [completed]

- `migrations/0011_install_events.sql` — new `install_events` table with indexes on (occurred_at), (kind, owner, name), (kind, handle, slug)
- `server/api/events/install.post.ts` — POST endpoint, zod-validated, writes via `getDB(event)`
- `app/composables/useInstallCopy.ts` — wraps `useClipboard` + fires fire-and-forget `$fetch('/api/events/install')`
- 4 callsites wired with surface labels: `skill-card`, `skill-card-list`, `skill-card-compact`, `skill-page-hero`, `collection-card`, `collection-page-hero`

**Note:** migration 0011 must be applied to D1 before deploy (`wrangler d1 migrations apply skilld-db --remote`).

## R2 — REJECTED, replaced with discoverability fix

Original R2 was an "LLM-draft from SKILL.md" button. Reverted because:
- LLM draft from SKILL.md just restates SKILL.md (the curator advocate's warning landed once it was visible)
- Conflicts with anti-AI-flavored brand voice
- Real bottleneck was `+ add reason` being hidden behind hover, not blank-page paralysis

Replaced with:
- Removed `server/api/collections/draft-reason.post.ts`
- `app/components/CollectionEditor.client.vue`: dropped `opacity-0 group-hover:opacity-100` on the `+ add reason` button (now persistently visible), changed placeholder from "Why this skill? (one line is plenty, like ...)" to a short example "e.g. use this for v3 SSR with Pinia", auto-open the reason editor for every newly added skill (was first-only), kept blur-to-commit.

## R3 — Empty-state CTA on skill page [completed]

- `app/pages/skills/[...slug].vue` — added `<template v-else>` after the curator-reasons section. When no curators have written a reason, renders "No curator note yet. Be the first to add yours" linking to `/collections/new?skill=NAME&skillsOwner=OWNER&skillsRepo=REPO` (uses existing prefill from `feedback_seeding_via_prefill.md`).
- Also added a smaller "Add yours" CTA when reasons EXIST (suppressed for `anthropics`-owned skills since they're upstream and don't accept curator notes).

## R8 — Raw markdown proxy [completed]

- `server/api/skills-raw/[...slug].get.ts` — resolves skill via `findSkill`, fetches default branch + tree from ungh, locates SKILL.md path, proxies raw.githubusercontent.com. Caches body in KV cache (5min TTL, 1min for misses). Sets `content-type: text/markdown; charset=utf-8` and `x-skilld-source` header.
- "Raw SKILL.md" button added to skill page source-links row.

URL form: `/api/skills-raw/<owner>/<repo>/<name>` or `/api/skills-raw/<owner>/<name>` for `skills` repo. Plain catch-all routing avoids conflict with the `app/pages/skills/[...slug].vue` page.

## Verification

- Typecheck: 13 pre-existing errors, **0 new errors from these changes** (verified by stashing and re-running).
- Lint: 3 pre-existing errors + 1 warning, **0 new lint issues from these changes**.

## Not yet shipped (deferred per plan-v2)

- R4 (hero rewrite as live curator-collection artifact) — design-led, needs a real curator-collection chosen
- R5 (custom chip+arrow chain component) — needs explicit `ordered` semantic on collections schema first
- R6 (follower attribution surface)
- R7 (hover-loop webm motion treatment)

## Open questions still outstanding

1. Analytics sink: chose D1 `install_events` table over Cloudflare Web Analytics custom events (CFWA only handles pageviews). Reconsider if D1 row volume becomes a concern.
2. `ordered` semantic on collections — defer until R5 actually starts.
3. Hero rewrite (R4) — should run after 2 weeks of R1 telemetry data.