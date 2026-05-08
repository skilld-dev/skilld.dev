# Homepage rebuild — TODO

UX research and skill-classification data is done. Implementation deferred — pick this up when ready.

## Inputs (do not regenerate)
- `/tmp/skilld-ux/homepage-spec.md` — final spec: personas, 6-cluster taxonomy, wireframes, copy, data deps, open decisions.
- `/tmp/skilld-ux/ux-research.md` — persona + pattern-survey detail.
- `/tmp/skilld-ux/classifications.jsonl` — 1200 skills classified abstract (237) vs package-specific (963).
- `scripts/classify-skill-abstractness.ts` — Haiku-backed classifier (resume-safe).
- `scripts/backfill-abstractness.ts` — emits SQL from the JSONL into `skill_generated(kind='abstractness')`{lang="ts"}.

## State
- Local D1: backfilled (1200 rows under `kind='abstractness'`).
- Remote D1: **not yet** — run `npx wrangler d1 execute skilld-db --remote --file=/tmp/skilld-ux/backfill.sql` when ready.
- `GeneratedKind` union in `layers/registry/server/utils/skill-generated.ts` has `'abstractness'` added.

## Decisions to settle before code (from spec §5)
1. Cluster destination: `/skills?cluster=<slug>`{lang="html"} filter, or homepage anchors only?
2. Lock the 6 clusters (Plan / Power-user / Docs / Review / Debug / Commit)?
3. Cluster slugs (URL-stable forever).
4. Demand badge format ("~270k installs" vs skill count vs qualitative).
5. Hero CTA — keep `gh:obra/superpowers` or push our own collection?
6. Package surface for P5 (Stack Sam) — exists or stub?
7. Final label for `agent-meta` cluster ("Work like a pro user" is provisional).

## Build (after decisions)
1. **Migration 0023** — denormalise classification onto `skills` (`is_abstract INTEGER`, `target_package TEXT`, `abstractness_category TEXT`). Backfill from `skill_generated` `kind='abstractness'` payload. Without this, homepage queries get gnarly.
2. **Cluster config** — `layers/registry/server/data/clusters.ts`: slug, label, icon, "I want to…" sub-copy, signature skill keys, included `category` slugs.
3. **Cluster aggregate endpoint** — `/api/clusters` returning `{slug, count, totalInstalls, exampleSkills[]}` for the homepage grid.
4. **Homepage section 2** — "What are you trying to do?" 6-card grid, replaces nothing (new section between hero and Recently Updated).
5. **Skills index filter** — `?cluster=<slug>`{lang="html"} if decision 1 chooses the route path.
6. **Recently Updated tweaks** — add `is_abstract=1 AND is_official=1` filter; add "what changed" snippet from `skill_revisions` (already specified in PIVOT_PLAN line 250 but not built).
7. **Promote classifier to a job** — `layers/registry/server/jobs/generate-abstractness.ts` mirroring `generate-tags.ts`; key on real SKILL.md SHA so it regenerates on drift; wire into the existing nightly generators.

## Smoke tests before shipping
- Spot-check 30 random `kind='abstract'` rows in the DB. False-positive rate <5% expected.
- Confirm cluster grid renders on mobile (2×3 → 6-tall stack).
- Verify cluster click → filtered skills index returns only abstract skills.
