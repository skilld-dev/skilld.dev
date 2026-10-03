# Homepage rebuild

Status: open · 2026-10-03 · classifier and recent-updates implementation verified against `1ccf98ec`

**Next move:** Ready. Review the current homepage and category pages on desktop and mobile. Sample 30 classified Skills for accuracy.

Done means: the current homepage and category pages pass desktop and mobile review, classification accuracy passes the sample, and new eligible Skills receive automatic classification.

## Ledger

- [x] Initial cluster grid and category routes implemented
- [ ] Visual review of `/` and the current `/skills/<slug>` category pages on desktop and mobile
- [x] Recently Updated requires `is_abstract=1 AND is_official=1` and reads change summaries from `skill_revisions`
- [x] Automatic classification uses the real `SKILL.md` SHA and prompt version in the hourly generator
- [x] Retire the original six-cluster sitemap requirement under the SEO recovery freeze
- [ ] Spot-check 30 random `is_abstract=1` rows for false positives
- [ ] Observe one newly admitted eligible Skill receiving automatic classification

## Log

- 2026-09-22 Moved from `docs/homepage-rebuild-todo.md`. The initial ledger was copied without fresh verification.
- 2026-10-03 Read `ai-generate-submit.ts`, `ai-generation-work.ts`, and the hourly schedule in `docs/arch/cron.md`.
  Classification freshness compares the source SHA and prompt version. The generator reserves classification capacity beside embeddings.
- 2026-10-03 `pnpm registry:convergence` read production D1. All 5,887 eligible Skills had current classifications, with zero remaining.
  Eligibility requires an indexable Skill, rendered source, a source SHA, and a Repository without a broken marker.
  This proves current coverage, not classification accuracy or the arrival of a new Skill.
- 2026-10-03 Read `server/utils/recent-updates-query.ts`. It applies both required filters and joins revision messages.
- 2026-10-03 Replaced the original six-cluster completion criteria with the current category surface.
  The later keyword rework changed the categories. SEO recovery freezes sitemap expansion until its gate decision.

## Current implementation

- Classification: `layers/registry/server/tasks/ai-generate-submit.ts` and `layers/registry/server/utils/ai-generation-work.ts`.
- Category membership: `layers/registry/server/utils/cluster-membership.ts` and `layers/registry/server/data/clusters.ts`.
- Recent updates: `server/utils/recent-updates-query.ts` and `server/api/feed/recent-updates.get.ts`.
- Production coverage check: `pnpm registry:convergence`.

The classifier uses Workers AI. The initial manual pass classified 1,200 Skills with Haiku.
The original taxonomy, install-count badges, and `gh:` hero reference are historical inputs, not current requirements.
Current sitemap decisions belong to [SEO recovery](EXECUTE-seo-recovery.md).
