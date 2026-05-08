# skilld.dev — GitHub Pivot Plan

Status: planning, locked decisions from grill session 2026-05-08. No code landed yet.

## Two-loop product model

Every change in this plan must serve one of two loops. If a feature doesn't, cut it.

- **Loop 1 — Activation (anonymous discovery → install).**
  Lands on skilld.dev → sees curated/official skills + recent updates → opens skill detail → copies `npx skilld add gh:owner/repo` → runs it. No auth, no email, no friction. SEO-bearing surface. Top of funnel.

- **Loop 2 — Retention (authenticated watching → digest).**
  Returning user signs in with GitHub → bulk-imports starred repos that have skills → optionally watches collections → receives weekly (or daily) digest email when watched repos change. The CLI doesn't yet auto-update or report installs, so the digest is the *only* way users learn what changed and why. Lifecycle hook + moat.

These loops live on the same site but are sold separately. Loop 1 is the headline. Loop 2 is a small CTA strip on the homepage and a "Watch for changes" affordance on skill/collection pages. Loop 2 only fires when explicitly requested.

## What dies

- AT Protocol auth, OAuth client, session handling.
- Bluesky social embeds, "follow on Bluesky" CTAs, follows cache.
- Curator-as-bsky-identity framing across all copy.
- `/people/[handle]` route (replaced by `/@<gh-login>`).

Code/files removed:
- `server/api/auth/atproto.get.ts`, `server/api/auth/session.delete.ts` (replaced)
- `server/utils/atproto/**`
- `server/tasks/refresh-curators.ts`, `server/tasks/refresh-follows.ts`
- `app/components/AuthModal.client.vue` (replaced with simple `<UButton to="/api/auth/github">`)
- `scripts/harvest-bsky-*.ts`
- Deps: `@atproto/api`, `@atproto/common`, `atproto-oauth-client-cloudflare-workers`

Tables dropped (Phase 4, after migration):
- `curators`, `follows_cache`, `follows_refresh_state`

## What stays

- Existing GitHub sync infra: `server/utils/github-client.ts`, `server/utils/sync-repo.ts`, `server/tasks/sync-github-skills.ts`. Per-skill SHA tracking, ETag-conditional GETs, `skill_revisions`, `activity` table all reused as the change feed.
- Curation tables: `is_official`, `trust_tier`, `repo_trust_overrides`, `supported_repos`. Currently 1351 official skills, 79 core-official repos, 14 trusted-author repos — enough to populate the homepage on day one.
- Collections (concept and table) survive, but moved off atproto into D1. Migrate the 2 existing collections by hand under `gh-login=harlanzw`.
- `?prefill=name&slug&preamble&skills` URL pattern on `/collections/new` (now writes to D1).

## Identity

- One namespace: `<github-login>`. URLs:
  - `/@<gh-login>` — author profile
  - `/@<gh-login>/<collection-slug>` — collection detail (replaces `/people/[handle]/[slug]`)
  - `/collections` — index of `featured=1` collections, ordered by `featured_at DESC`
  - `/collections/new` — authoring UI (login-gated)
  - `/me` — dashboard (subscriptions, cadence, history)
  - `/login`, `/onboarding/{discover,cadence,email}`
- `/people/*` URLs all 410 except `/people/harlanzw.com` → 301 to `/@harlanzw`.
- Sitemap regenerated to drop `/people/*` and add `/@*`.

## Schema changes

Five additive migrations. No destructive changes until Phase 4.

### `migrations/0017_users.sql`

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE NOT NULL,
  login TEXT NOT NULL,
  name TEXT,
  email TEXT,
  digest_email TEXT,
  digest_email_pending TEXT,
  digest_email_token_hash TEXT,
  digest_email_token_expires_at INTEGER,
  avatar TEXT,
  github_token_encrypted TEXT,
  github_token_scopes TEXT,
  stars_synced_at INTEGER,
  email_opt_in INTEGER NOT NULL DEFAULT 0,
  digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('weekly','daily','off')),
  digest_dow INTEGER DEFAULT 1,
  digest_hour INTEGER NOT NULL DEFAULT 9,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  onboarded_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE INDEX idx_users_login ON users(login);
```

Token encryption: AES-GCM via Web Crypto, key from `NUXT_TOKEN_KEY` secret. Token kept indefinitely (per Q17 decision) for future CLI device-flow + private-repo expansion.

### `migrations/0018_skill_subscriptions.sql`

```sql
CREATE TABLE skill_subscriptions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'star-import' | 'manual' | 'collection:<slug>'
  muted_until INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, owner, repo)
);
CREATE INDEX idx_subs_user ON skill_subscriptions(user_id, created_at DESC);
CREATE INDEX idx_subs_repo ON skill_subscriptions(owner, repo);
```

Per-repo grain (not per-skill). Repos with multiple skills get grouped in the digest.

### `migrations/0019_user_starred_repos.sql`

```sql
CREATE TABLE user_starred_repos (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  starred_at INTEGER NOT NULL,
  has_skill INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, owner, repo)
);
CREATE INDEX idx_starred_user_haskill ON user_starred_repos(user_id, has_skill, starred_at DESC);
```

Cache of user's GitHub stars, populated on onboarding + manual re-sync. `has_skill` set by joining against `skills` table at sync time.

### `migrations/0020_collections.sql`

```sql
CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  preamble TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  featured_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (author_user_id, slug)
);
CREATE INDEX idx_collections_featured
  ON collections(featured, featured_at DESC)
  WHERE featured=1 AND deleted_at IS NULL;
CREATE INDEX idx_collections_author
  ON collections(author_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE collection_skills_v2 (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (collection_id, position)
);
CREATE INDEX idx_collection_skills_v2_repo ON collection_skills_v2(owner, repo);
```

Old `collections` and `collection_skills` tables survive read-only until Phase 4 cleanup.

### `migrations/0021_digests.sql`

```sql
CREATE TABLE digest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  change_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','skipped','failed')),
  resend_id TEXT,
  ai_summary_used INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  error TEXT
);
CREATE UNIQUE INDEX idx_digest_window ON digest_runs(user_id, window_end);
CREATE INDEX idx_digest_status ON digest_runs(status, window_end DESC);
```

`change_count==0` rows get inserted with `status='skipped'` and no email send (per "skip when nothing changed" decision).

### Phase 4 cleanup migration (post-launch)

Drop `curators`, `follows_cache`, `follows_refresh_state`. Drop old `collections`, `collection_skills` after verifying the v2 tables work.

## Sync extension

`server/utils/sync-repo.ts` already tracks SKILL.md SHAs and writes `skill_revisions`. Two changes:

1. **Asset SHA tracking.** Hash files under `/assets/**` per skill directory; emit `activity(type='asset_updated')` when changed. Bounded — most skills have small asset trees.
2. **Subscription-prioritized polling.** `server/tasks/sync-github-skills.ts` adds a pre-pass: query `(owner, repo)` joined to `skill_subscriptions` with stalest > 1h, run those first; existing 24h-stalest pass picks up the rest. Conditional GETs (already implemented) keep this within rate limits.

No new tasks/crons for sync. Existing hourly `sync-github-skills` does the work.

## Email + digest pipeline

- **Provider:** Resend. Domain `mail.skilld.dev`, SPF/DKIM/DMARC configured. Single sender identity.
- **Templates:** vue-email, one template (`digest`). Per-skill bullets, AI summary line per skill, repo grouping when multiple skills per repo, footer with one-click unsubscribe (RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post`).
- **Cron:** new task `server/tasks/send-digests.ts`, schedule `0 * * * *` in `nuxt.config.ts:scheduledTasks` and `wrangler.toml:triggers.crons`.
- **Selection logic:** for each user where `email_opt_in=1` AND `digest_frequency != 'off'` AND user-local `(dow, hour)` matches current UTC slot via stored `timezone`:
  - Window = `MAX(last digest_runs.window_end, onboarded_at)` → now
  - Aggregate `activity` rows joined to `skill_subscriptions` for that user in the window
  - If `change_count == 0`: insert `digest_runs(status='skipped')`, no send
  - Otherwise: build email, send via Resend, insert `digest_runs(status='sent', resend_id, sent_at)`
- **AI summary** (Anthropic Haiku 4.5):
  - Inputs per skill: name, description, list of commits in window (sha + message + touched files), SKILL.md diff
  - Output: one sentence per skill, "what changed + why a user might care"
  - Prompt caching: stable per-user prefix (subscription list, skill descriptions); only the per-week diffs change between runs
  - Failure mode: skip the summary line, send the digest with structured "X commits to SKILL.md →" links instead. Never block the email on LLM availability.
  - Rough cost: 100 subscribers × 1/week × ~2k in / 200 out ≈ negligible per Anthropic Haiku pricing.
- **Unsubscribe:** signed HMAC token → flips `email_opt_in=0`. Single-click, no confirmation page.
- **Email change flow:** user enters new address in `/me` → server stores `digest_email_pending` + token hash + 24h expiry → sends one transactional email with the verification link → on click, swap `digest_email := digest_email_pending`, clear pending columns. The only transactional email skilld sends.

## Auth

- GitHub OAuth via `nuxt-auth-utils` (`oauth.githubEventHandler`).
- Scopes: `read:user user:email` only. **No `repo` scope, ever.** Public stars only.
- Cookie session (Nitro session) replaces atproto session.
- Token encrypted with `NUXT_TOKEN_KEY`, stored on `users.github_token_encrypted`. Never logged. Used by `/api/me/stars/sync`.
- CLI device-flow auth deferred. Schema accommodates it (token storage, `users` table) but no implementation in this pivot.

## Onboarding flow

Triggered only when entering via `/login` (not pushed in users' faces). Skipped if `onboarded_at IS NOT NULL`.

1. **`/login`** — single "Continue with GitHub" button. Returns to `/onboarding/discover` (or to a `?return_to=` URL if set, e.g. when a "Watch this collection" button kicked off the flow).
2. **`/onboarding/discover`** — checkbox grid of `user_starred_repos WHERE has_skill=1`. "Watch all" toggle. Inline manual repo search for non-starred adds. CTA: "Watch N repos" → bulk-insert subscriptions.
3. **`/onboarding/cadence`** — frequency (`weekly` default), day-of-week if weekly, hour, timezone (autodetected via `Intl.DateTimeFormat().resolvedOptions().timeZone`).
4. **`/onboarding/email`** — confirm GitHub primary email or enter alternate. **Explicit opt-in checkbox** — unchecked by default, user has to tick it for `email_opt_in=1`. Sets `onboarded_at`, redirects to `/me`.

Watch-collection alternate entry: clicking "Watch this collection" on a collection page, when not signed in, runs the OAuth flow with `?return_to=/@harlanzw/nuxt-stack&action=watch-collection`. After callback, server bulk-inserts subscriptions for every skill in that collection (source = `'collection:<slug>'`), then short-circuits onboarding into step 3 only (cadence + email opt-in).

## `/me` dashboard

- Watched repos list (mute, remove, re-sync).
- "Sync stars" button (re-OAuth flow if token expired/missing, otherwise direct API call).
- Banner if `stars_synced_at > 30 days ago`: "Refresh your starred-repo list?"
- Cadence editor (frequency, day, hour, timezone).
- Email editor with verification flow.
- Digest history (last 10, with `change_count`, sent timestamp, status).

## Marketing copy changes

### Homepage `app/pages/index.vue`

- **Headline:** "Curated skills for AI agents"
- **Subhead:** "A curated registry of agent skills for the npm packages and GitHub repos you actually use. One install command, every agent. Get notified when they change."
- **Hero CTA:** install command demo with copy button (`npx skilld add gh:nuxt/nuxt`) + secondary "Browse collections" link.
- **Below hero, in order:**
  1. Recently updated official skills (8-12 cards, `is_official=1`, sorted by `last_synced_at DESC`, with "what changed" snippet from `skill_revisions`)
  2. Featured collections (3-6, `featured=1` ordered by `featured_at DESC`)
  3. "Watch for changes" CTA strip — single-line pitch + GitHub button
- Delete `NetworkFeedSection.vue` entirely.

### Skill detail `layers/registry/app/pages/gh/[owner]/[repo]/[name].vue`

- Drop curator avatars + curator count + "Recommended by N curators" sections.
- Drop Bluesky social embeds (`SocialEmbed.vue` Bluesky path).
- Keep: install command (primary, large, copyable), SKILL.md preview, agent compatibility badges, "Featured in" collections section.
- Add: small "Watch for changes" link in the install card sidebar (triggers OAuth if anon).

### Collection detail `app/pages/people/[handle]/[slug].vue` → `app/pages/@[login]/[slug].vue`

- Move/rename file to new route shape.
- Drop Bluesky thread embed.
- Primary CTA: install command for the collection (`npx skilld add @harlanzw/nuxt-stack` or equivalent — confirm CLI supports collection install).
- Secondary CTA: "Watch this collection" button.

### Auth modal

- Delete `app/components/AuthModal.client.vue`.
- Replace usage with direct `<UButton to="/api/auth/github">` or a tiny client-only component if needed for return-to flows.

### Skills index `layers/marketing/app/pages/skills/index.vue:8`

- Update meta description: emphasize curation/install over "curators."

### Brand & context docs

- `.claude/context/brand-guidelines.md`: replace "trusted open-source developers" / "AT Protocol" / curator-as-person framing. Recenter on "curated registry" + "watch for changes." Voice stays editorial, warm.
- `CONTEXT.md`: redefine "curator" as "collection author" (D1-backed via GitHub login). Drop atproto identity rule (lines 18-20). Update URL canonicals table (lines 37-39) — `/people/[handle]` → `/@<gh-login>`.
- `SCOPE.md`: rewrite Tech Stack section (drop "AT Protocol for auth and social layer"). Add the two-loop framing as a top-level section. Update Build Phases.
- `CLAUDE.md`: add the two-loop framing as the first section. Future agents need this mental model before touching anything.

## Memory updates

- Retire `project_atproto_auth_decision.md` (atproto is gone).
- Retire `project_collection_ranking.md` (no curator-followers concept anymore).
- Update `feedback_seeding_via_prefill.md`: prefill URL pattern survives but writes to D1, not atproto.
- Add new memory: `project_two_loop_model.md` — the canonical mental model for the product.

## Phasing (single ship, internal milestones)

Site is unused, so no need to stage public exposure. All phases land in one push.

**Phase 1 — Loop 1 cleanup (1-2 days)**
- Migrations 0020 (collections v2), seed your 2 collections under `harlanzw` (manually inserted user row with placeholder GitHub data, replaced when you OAuth in Phase 2).
- Rip atproto: deps, server code, components, tasks.
- Rewrite homepage, skill detail page, collection routes (`/people/*` → `/@*`).
- Delete AuthModal, NetworkFeedSection, SocialEmbed bsky path.
- Update SCOPE/CONTEXT/CLAUDE/brand docs with two-loop framing.
- Sitemap regen.

**Phase 2 — Auth + watching (3-4 days)**
- Migrations 0017 (users), 0018 (subscriptions), 0019 (starred).
- GitHub OAuth handler, token encryption util, session migration.
- `/login`, `/onboarding/{discover,cadence,email}`, `/me`.
- `POST /api/me/stars/sync`.
- "Watch for changes" buttons on skill + collection pages.
- Collection authoring UI at `/collections/new`.

**Phase 3 — Email + AI summary (3-4 days)**
- Migration 0021 (digest_runs).
- Resend integration, `mail.skilld.dev` DNS.
- vue-email digest template.
- `server/tasks/send-digests.ts` + cron registration.
- Anthropic Haiku integration with prompt caching.
- Unsubscribe handler + email-change verification.
- Asset SHA tracking in `sync-repo.ts`.
- Subscription-prioritized polling pre-pass.

**Phase 4 — Cleanup (post-merge)**
- Drop atproto tables.
- Drop old collections + collection_skills tables (keep until v2 verified).
- Memory file updates.

## Explicit non-goals for v1

- CLI device-flow auth (schema ready, no impl).
- CLI install telemetry (`install_events` stays unused for personalization).
- Realtime per-change emails.
- Topic/tag-based subscriptions.
- Background star auto-sync.
- Computed collection ranking / quality scores.
- Admin panel.
- Comments, reactions, social proof.
- Private starred repos (no `repo` scope ever).
- Welcome email.
- Drag-to-reorder / draft state in collection authoring.

## Open low-stakes items

- Whether `skilld add @harlanzw/nuxt-stack` works in the CLI today, or only `gh:` / `npm:` prefixes — confirm before wiring collection install CTA.
- Decide between Workers AI fallback or hard-fail when Anthropic is down (currently: skip summary, send digest without it).
