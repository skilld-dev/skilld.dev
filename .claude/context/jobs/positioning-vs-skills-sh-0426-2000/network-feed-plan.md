# AT Protocol Network Feed: Implementation Plan

_Date: 2026-04-26 (revised after codebase audit + decisions)_
_Sibling to: `github-integration-plan.md`_
_Strategy: `plan-ceo.md`_

## Goal

When a logged-in user lands on the homepage, the primary feed shows **skills picked by the @handles they follow on Bluesky**, not a global ranking. Anonymous visitors see editorial / activity feeds; logged-in visitors see their network.

The strategic moat skills.sh structurally cannot copy (no identity layer, no social graph). Turns existing AT Protocol auth from "just login" into a distribution mechanism.

## Translation: what does "picked" mean?

> **"Skill picked by @handle"** = a skill appears in a public `dev.skilld.collection` record authored by that handle.

Saves (`dev.skilld.collection.save`) are private bookmarks (per project memory) and **never enter feed queries**. P0 architectural invariant.

The unit of trust is **collection authorship**.

## Codebase audit (2026-04-26)

| Component | Status | Path |
|---|---|---|
| AT Protocol OAuth + session | done | `server/utils/atproto/oauth.ts`, `oauth-session-store.ts` |
| Authenticated agent helper | done | `server/utils/atproto/agent.ts` |
| `curators` table in D1 | done | `migrations/0002_curators.sql` |
| Curator labels (`early-curator`, `prolific`, `verified-maintainer`) | done | `curator-index.ts` |
| `dev.skilld.collection` lexicon (skill grain: `packageName/owner/repo/reason`) | done | `lexicons/dev.skilld.collection.json`, `lexicons/collection.ts` |
| `dev.skilld.collection.save` lexicon (private) | done | `lexicons/dev.skilld.collection.save.json` |
| Fetch user's Bluesky follows (full pagination) | done | `server/api/social/following-curators.get.ts` |
| Match follows ↔ indexed curators | done | `getCuratorsByDids` |
| `useFollowingCurators` composable | done | `app/composables/useFollowingCurators.ts` |
| `refresh-curators` scheduled task (`*/10 * * * *`) | done | `server/tasks/refresh-curators.ts`, `nuxt.config.ts:106` |
| Moderation flagging (`isProfileFlagged`) | done | `server/utils/atproto/moderation.ts` |
| Bluesky feed-generator (loops curators × fetches collections from PDS) | done | `server/utils/atproto/feed-generator.ts` |

**Audit findings (resolves prior open questions)**:
1. **Collections are NOT indexed in D1.** `listCollectionRecords(did)` fetches from PDS with 5-min KV cache.
2. **`feed-generator.ts` already does the fan-out** (loop all curators × fetch each curator's collections from PDS). Strong evidence the index is overdue: this same code can route through the index, dropping latency from N round-trips to 1 query.
3. **`refresh-curators` task pattern reuses cleanly** for both the index sync and the follows refresh.
4. **No per-DID rate-limit infra.** Light-touch in-memory throttle (or KV-backed counter) is sufficient at current scale.

## Decisions (locked)

1. **Index shape: normalized.** `collections` + `collection_skills` join table. Skill-grain query becomes a single indexed join.
2. **Sync trigger: cron pull.** Extend `refresh-curators` (or pair with it) to also walk each curator's collection records into the index. ~10-min staleness acceptable.
3. **Network feed caching: per-DID swr only.** `defineCachedEventHandler` keyed on viewer DID, 1-min TTL, swr. No pre-materialization.
4. **Empty-state list: curators tagged `early-curator`.** Hand-curated, reuses existing `curators.labels` field. No popularity ranking.

## Strategic side benefit

Building this index also retrofits `feed-generator.ts` (Bluesky feed-generator) onto the same query path, dropping N PDS fetches per render to one D1 query. The index pays for itself twice.

## New schema

```sql
-- migrations/0009_collections_index.sql
CREATE TABLE IF NOT EXISTS collections (
  uri              TEXT PRIMARY KEY,            -- at://did:.../dev.skilld.collection/<rkey>
  did              TEXT NOT NULL,               -- curator DID
  rkey             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  preamble         TEXT,
  stacks           TEXT NOT NULL DEFAULT '[]',  -- JSON array
  post_uri         TEXT,                         -- bluesky postRef.uri
  post_cid         TEXT,
  created_at       INTEGER NOT NULL,            -- unix seconds
  updated_at       INTEGER NOT NULL,
  indexed_at       INTEGER NOT NULL,
  deleted_at       INTEGER                      -- tombstone, nullable
);
CREATE INDEX IF NOT EXISTS idx_collections_did_updated  ON collections (did, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_updated      ON collections (updated_at DESC);

CREATE TABLE IF NOT EXISTS collection_skills (
  collection_uri   TEXT NOT NULL,
  position         INTEGER NOT NULL,            -- order within collection
  package_name     TEXT NOT NULL,               -- e.g. "vue", or full slug if owner/repo present
  owner            TEXT,
  repo             TEXT,
  reason           TEXT,
  PRIMARY KEY (collection_uri, position),
  FOREIGN KEY (collection_uri) REFERENCES collections(uri) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collection_skills_lookup
  ON collection_skills (package_name, owner, repo);

-- migrations/0010_follows_cache.sql
CREATE TABLE IF NOT EXISTS follows_cache (
  follower_did     TEXT NOT NULL,
  followed_did     TEXT NOT NULL,
  cached_at        INTEGER NOT NULL,
  PRIMARY KEY (follower_did, followed_did)
);
CREATE INDEX IF NOT EXISTS idx_follows_cache_follower ON follows_cache (follower_did, cached_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_cache_followed ON follows_cache (followed_did);

CREATE TABLE IF NOT EXISTS follows_refresh_state (
  follower_did     TEXT PRIMARY KEY,
  refreshed_at     INTEGER NOT NULL,
  next_eligible_at INTEGER NOT NULL             -- rate-limit gate (15 min)
);
```

## Network feed query

Single denormalized join. Skill grain.

```sql
SELECT
  cs.package_name,
  cs.owner,
  cs.repo,
  cs.reason,
  c.uri          AS collection_uri,
  c.slug         AS collection_slug,
  c.name         AS collection_name,
  c.did          AS curator_did,
  cu.handle      AS curator_handle,
  cu.display_name AS curator_display_name,
  cu.avatar      AS curator_avatar,
  c.updated_at   AS picked_at
FROM follows_cache f
JOIN collections        c  ON c.did = f.followed_did AND c.deleted_at IS NULL
JOIN collection_skills  cs ON cs.collection_uri = c.uri
JOIN curators           cu ON cu.did = c.did
WHERE f.follower_did = ?
ORDER BY c.updated_at DESC
LIMIT 50;
```

Dedup across collections is done in the application layer (group by `package_name + owner + repo`, keep most-recent `picked_at`, surface up to 3 curators per skill).

## Sync architecture

Two cron tasks, both in Worker, both reusing `refresh-curators` shape:

```
┌────────────────────────────────────────────────────────┐
│ Task: refresh-curators  (existing, */10 min)           │
│   ─ rebuild curators index from PDS                    │
│   ─ EXTEND: for each curator, sync collections to D1   │ ← NEW
│             (upsert collections + collection_skills)   │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ Task: refresh-follows  (new, hourly)                   │
│   for each follower in active users (login < 7d):      │
│     - check follows_refresh_state.next_eligible_at     │
│     - fetch /xrpc/app.bsky.graph.getFollows (paginate) │
│     - replace follows_cache rows for follower_did      │
│     - update follows_refresh_state                     │
└────────────────────────────────────────────────────────┘
```

**Tombstone handling**: collection sync compares the set of URIs returned from PDS against `collections.uri WHERE did=?` and sets `deleted_at` on missing rows (soft-delete). Feed query filters `deleted_at IS NULL`.

**Moderation**: `refresh-curators` already drops flagged curators from the index. Cascade: when a curator is dropped, set `deleted_at` on all their collections.

## API endpoints

| Route | Auth | Cache |
|---|---|---|
| `GET /api/feed/network` | required | per-DID, 1 min, swr |
| `POST /api/social/refresh-follows` | required | rate-limited 1/15min via `follows_refresh_state` |

`GET /api/social/following-curators` (existing) gets refactored to read from `follows_cache` instead of paginating Bluesky on every hit.

## Homepage UI

Logged-in homepage hierarchy:

```
[Hero]
─ "Picked by your network" (network feed)         ← NEW, primary
─ "Recently published" (global, from github-integration-plan E4)
─ "Featured curators" (existing)
─ "Featured orgs / users" (existing)
```

**Empty state** (network feed has no rows):
```
"Your network hasn't picked anything yet on skilld."
[Follow these curators on Bluesky →]
```
List sourced from `SELECT * FROM curators WHERE labels LIKE '%early-curator%' ORDER BY last_published DESC LIMIT 8`.

## Implementation phases

### Phase 1: Index foundation (~3 days)
- [ ] Migrations `0009_collections_index.sql`, `0010_follows_cache.sql`
- [ ] `server/utils/atproto/collection-sync.ts`, single-curator sync function (upsert + tombstone)
- [ ] Extend `server/tasks/refresh-curators.ts` to call `collection-sync` per curator
- [ ] Backfill: one-shot `scripts/backfill-collections-index.ts` populating from current PDS state
- [ ] Refactor `server/utils/atproto/feed-generator.ts` to read from index (incidental win, drops PDS fan-out)

### Phase 2: Follows caching (~2 days)
- [ ] Extract pagination from `following-curators.get.ts` → `server/utils/atproto/follows.ts`
- [ ] `POST /api/social/refresh-follows` endpoint, gated by `follows_refresh_state.next_eligible_at`
- [ ] Refactor `following-curators.get.ts` to read from `follows_cache`
- [ ] `server/tasks/refresh-follows.ts`, hourly cron, scoped to active users (touch `oauth_sessions.last_seen` or equivalent)
- [ ] First-login hook: schedule a one-shot refresh on first authenticated request

### Phase 3: Network feed endpoint + UI (~2 days)
- [ ] `server/api/feed/network.get.ts`, `defineCachedEventHandler` per-DID
- [ ] App-layer dedup + curator aggregation (group by skill, list ≤3 curators)
- [ ] `app/components/NetworkFeedSection.vue`, mounted on `app/pages/index.vue` for authed users
- [ ] Empty state: query `early-curator` set, render follow CTA
- [ ] "Last synced N min ago" + manual refresh button (hits `/api/social/refresh-follows`)

### Phase 4: Polish
- [ ] Stale-cache UI indicator if `follows_refresh_state.refreshed_at > 24h`
- [ ] `[Follow on Bluesky]` quick-action on every curator card
- [ ] Surface "picked by @x for [reason]" inline on skill cards in network feed
- [ ] Track empty-state CTA click-through

## Risk register

| Risk | Mitigation |
|---|---|
| **Index sync drift / missed records** | Backfill script as ground-truth resync. Cron pull is idempotent (upsert on URI). Periodic full-walk every N hours catches drift. |
| **Tombstones missed on collection deletion** | Diff returned URIs vs DB on every per-curator sync; soft-delete missing. Hard-delete after 30-day grace. |
| **Privacy: save records in feed** (P0) | `dev.skilld.collection.save` records are never read by sync or feed code. Lexicon NSID hardcoded in sync filter. **Code-review invariant.** |
| **Empty network for new users** | `early-curator` CTA, never silently empty |
| **Stale follows cache** | Surface "Last synced 47 min ago"; "Refresh" button hits rate-limited endpoint |
| **Bluesky API outage during follow refresh** | Serve last-good cache; explicit "Network feed unavailable, retrying" notice. Never silently fall back to global feed (would look like skills.sh). |
| **Spam curator publishing many low-quality collections** | `isProfileFlagged` already filters at curator-index level; cascade tombstones their collections. Rate-limit collection count per curator if needed. |
| **`refresh-curators` task time budget** | Adding collection sync inflates per-cycle cost. If approaching CF Worker time cap, split into parallel tasks (one per DID batch) or extend cron interval to 15 min. Observe before optimizing. |
| **Schema mismatch: `package_name` ambiguity** | Some `CollectionSkill` records carry `owner+repo`, some only `packageName`. Index both. Feed query falls back gracefully when owner/repo missing. |
| **Stale follow ↔ deleted Bluesky account** | Sync detects 404 on `getFollows` for any `followed_did`; mark `deleted_at` on `follows_cache` rows. |

## Out of scope

- Public endorsement primitive on individual skills (would need new lexicon, defer)
- Save records ever appearing publicly (privacy violation, never)
- Network feed of collections themselves (skill is the unit)
- Feed personalization beyond follow graph (no ML ranking, no engagement signals)
- Push notifications for new picks
- Cross-network identity (Bluesky/AT Protocol only)
- Firehose / Jetstream subscription (cron pull is sufficient at current scale; revisit at >500 curators or when freshness <1min becomes a feature)
- Pre-materialized `network_feed_cache` (defer until query latency demonstrates need)

## Files

**New**:
- `server/utils/atproto/collection-sync.ts`
- `server/utils/atproto/follows.ts`
- `server/tasks/refresh-follows.ts`
- `server/api/feed/network.get.ts`
- `server/api/social/refresh-follows.post.ts`
- `app/components/NetworkFeedSection.vue`
- `scripts/backfill-collections-index.ts`
- Migrations: `0009_collections_index.sql`, `0010_follows_cache.sql`

**Modified**:
- `server/tasks/refresh-curators.ts`, add per-curator collection sync
- `server/utils/atproto/feed-generator.ts`, read from index instead of PDS fan-out
- `server/api/social/following-curators.get.ts`, read from `follows_cache`
- `app/pages/index.vue`, conditional `NetworkFeedSection` for authed users
- `nuxt.config.ts`, add `refresh-follows` to `scheduledTasks`

## Bottom line

Three discrete pieces: a collections index (~3 days, also retrofits the Bluesky feed-generator), a follows cache (~2 days), a feed query + UI (~2 days). Total ~1 week of focused work.

The privacy boundary around `dev.skilld.collection.save` records is **P0** as an architectural invariant. The cron-pull model is borrowed wholesale from `refresh-curators`, no new infra.

Two one-way doors avoided: no firehose subscription (sticks with cron), no per-user materialization (sticks with swr cache). Both reservable later if scale demands.

## Sequencing vs `github-integration-plan.md`

These plans are **independent**: GitHub integration writes to `skills` + `activity`; network feed writes to `collections` + `follows_cache`. Different tables, different cron tasks, different failure modes. They can run in parallel.

The homepage UI work overlaps slightly: both plans modify `app/pages/index.vue`. Coordinate the section ordering once, then both ship without merge friction.

If forced to pick first: **GitHub integration ships the Receipts panel** (the explicit counter to skills.sh's "Security Audits: Pass"). **Network feed ships the personalized homepage** (the moat skills.sh can't copy). Receipts moves perception faster; network feed compounds slower but harder to dislodge. Recommend Receipts first if launch deadline matters, network feed first if curator-acquisition matters more right now.