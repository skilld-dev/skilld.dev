## Vision

`VISION.md` at the repo root is the product filter: mission, north-star user, money posture, game loop, 7 principles, anti-scope. Read it before any product, scope, design, or marketing decision. When it conflicts with existing code, VISION.md wins. `ROADMAP.md` holds the current horizons and the dated cull list (it superseded SCOPE.md).

## Two-loop product model

Every change must serve one of two loops. If a feature doesn't, cut it.

- **Loop 1 — Activation (anonymous discovery → install).** Land on skilld.dev → see curated/official skills + recent updates → open skill detail → copy `npx skilld add gh:owner/repo` → run it. No auth, no email, no friction. SEO-bearing surface. Top of funnel.
- **Loop 2 — Retention (authenticated watching → digest).** Returning user signs in with GitHub → bulk-imports starred repos that have skills → Always watches collections → receives weekly digest email when watched repos change. Lifecycle hook + moat.

These loops live on the same site but are sold separately. Loop 1 is the headline. Loop 2 is a small CTA strip on the homepage and a "Watch for changes" affordance on skill/collection pages.

Identity is one namespace: `<github-login>`. Collection URLs are `/@<gh-login>/<slug>`. The legacy `/people/*` namespace (atproto handles) is gone.

## UI & UX Work

Before modifying any UI or UX code, read and follow both:
- `.claude/context/design-guidelines.md` (visual system, components, spacing, motion)
- `.claude/context/brand-guidelines.md` (voice, tone, copy, terminology, positioning)
