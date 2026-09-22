# Homepage rebuild

Status: open · 2026-09-22 · Phase 1 shipped; visual review and four follow-ups open

**Next move:** Ready. Item 3 in the ledger is the one that matters: until the abstractness classifier runs as a job, only the seeded top 1200 Skills are classified and every newer Skill surfaces as `is_abstract=NULL`, so the cluster pages quietly go stale.

Done means: the 6-card grid and each `/skills/<slug>` page render correctly on desktop and mobile, the six cluster URLs are in the sitemap, and a Skill added today is classified without a manual pass.

## Ledger

- [x] Phase 1: the 6-card grid and the six `/skills/<slug>` cluster routes
- [ ] Visual review of `/` and `/skills/<slug>` on desktop and mobile
- [ ] Recently Updated: apply the `is_abstract=1 AND is_official=1` filter and add the "what changed" snippet from `skill_revisions`
- [ ] Promote the classifier to a job, keyed on the real `SKILL.md` SHA, wired into the nightly generator pass
- [ ] Add the six `/skills/<slug>` URLs to the sitemap
- [ ] Spot-check 30 random `is_abstract=1` rows for false positives

## Log

- 2026-09-22 moved out of `docs/homepage-rebuild-todo.md`. The ledger above is this document's own Remaining list; nothing was re-verified.

Phase 1 shipped. Visual review on `/` and `/skills/<slug>`{lang="html"} pending; remaining items below.

## Decisions locked
1. Cluster destination → **new `/skills/<slug>`{lang="html"} routes** (not query param, not anchors).
2. 6 clusters: `plan`, `master-agent`, `docs`, `review`, `debug`, `ship`. URL-stable forever.
3. Cluster B labelled **"Master your agent"**.
4. Demand badge = skill count + total installs (e.g. `49 skills · ~270k installs`).
5. Hero CTA stays `gh:obra/superpowers` (biggest demand signal, signals 3rd-party curation).

Open: package surface for P5 ("Stack Sam") ; deferred, not blocking.

## Done
- ✅ Classifier ran 1200/1200 (237 abstract / 963 package-specific) → `/tmp/skilld-ux/classifications.jsonl`.
- ✅ `scripts/backfill-abstractness.ts` populates `skill_generated(kind='abstractness')`{lang="ts"}.
- ✅ Migration `migrations/0023_skill_abstractness.sql` adds `is_abstract`, `target_package`, `abstractness_category` columns + indexes; backfills from `skill_generated`.
- ✅ Local D1 + Remote D1 both backfilled and migrated.
- ✅ `layers/registry/server/data/clusters.ts` ; 6-cluster config with pinned examples.
- ✅ `/api/clusters` (grid data) + `/api/clusters/[slug]` (paginated cluster detail), both using denormalised columns.
- ✅ `app/components/HomepageClusterGrid.vue` + new "What are you trying to do?" section in `app/pages/index.vue`. Hero subhead rewritten.
- ✅ `layers/marketing/app/pages/skills/[cluster].vue` ; cluster detail page.
- ✅ `skills-to-gh-redirect` middleware allowlists cluster slugs.
- ✅ `GeneratedKind` union extended with `'abstractness'`.

## Remaining
1. **Visual review** ; confirm the 6-card grid + cluster page render correctly on desktop and mobile. Dev server: `pnpm dev`.
2. **Recently Updated tweaks** ; apply `is_abstract=1 AND is_official=1` filter; add "what changed" snippet from `skill_revisions` (docs/work/EXECUTE-github-pivot.md line 268 spec'd, not built).
3. **Promote classifier to a job** ; `layers/registry/server/jobs/generate-abstractness.ts` mirroring `generate-tags.ts`; key on real SKILL.md SHA so it regenerates on drift. Wire into the nightly generator pass so new skills get classified automatically. Until this lands, only the seeded top 1200 skills have classification ; newer skills surface as `is_abstract=NULL`.
4. **Sitemap entry** ; add the 6 `/skills/<slug>`{lang="html"} URLs to the sitemap (the sitemap currently emits only `/skills/{guide,official,stats,index}`).
5. **Spot-check classifier output** ; sample 30 random `is_abstract=1` rows; flag false positives (e.g. `seo` was a borderline call).

## Inputs (kept for reference)
- `/tmp/skilld-ux/homepage-spec.md` ; full spec: personas, 6-cluster taxonomy, wireframes, copy, data deps.
- `/tmp/skilld-ux/ux-research.md` ; persona + pattern-survey detail.
- `/tmp/skilld-ux/classifications.jsonl` ; raw classifier output (1200 records, resume-safe).
- `/tmp/skilld-ux/backfill.sql` ; generated SQL, idempotent, safe to re-run.
- `scripts/classify-skill-abstractness.ts` ; Haiku-backed classifier (resume-safe).
- `scripts/backfill-abstractness.ts` ; emits backfill SQL from the JSONL.

## Re-running anything
```bash
# Regenerate backfill SQL from JSONL
npx tsx scripts/backfill-abstractness.ts > /tmp/skilld-ux/backfill.sql

# Apply locally
npx wrangler d1 execute skilld-db --local --file=/tmp/skilld-ux/backfill.sql

# Apply remotely (needs CLOUDFLARE_ACCOUNT_ID for the Harlan account)
export CLOUDFLARE_ACCOUNT_ID=5904138d55ca25d5670dca6adf99894e
npx wrangler d1 execute skilld-db --remote --file=/tmp/skilld-ux/backfill.sql
```
