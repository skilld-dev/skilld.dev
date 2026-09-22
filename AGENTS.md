# skilld.dev

Registry site for Agent Skills: GitHub-proxied discovery, author-curated collections, and digest
emails. Nuxt on Cloudflare Workers, D1, and Workers AI.

## Read first

- [`VISION.md`](VISION.md) — the product filter: mission, money posture, the two loops, seven principles, anti-scope. Read before any product, scope, design, or marketing decision. When it conflicts with the code, VISION wins.
- [`DESIGN.md`](DESIGN.md) — the design tokens: colors, type, radius, spacing.
- `.claude/context/design-guidelines.md` — the visual system in practice: components, spacing, motion. Read with DESIGN.md before UI work.
- `.claude/context/brand-guidelines.md` — the verbal filter: voice, tone, copy, terminology, positioning. Read before any user-visible string.
- [`GLOSSARY.md`](GLOSSARY.md) — every product concept. Read before a user-visible string, a public API name, a doc heading, or a route segment.
- [`docs/arch/README.md`](docs/arch/README.md) — the layers, the identity rule, the URL canonicals, and the server and app handler shapes.
- [`docs/work/`](docs/work/README.md) — open briefs, one `EXECUTE-*.md` each, plus the roadmap that sequences them.
- [`docs/adr/`](docs/adr) — decisions, numbered and immutable. Amend only with a later ADR.
- `docs/ideas/` — pre-decision sketches and market research. Nobody acts from that folder.
- `docs/runbooks/` — operational procedures, including the [daily check-in](docs/runbooks/checkin.md).
- `docs/ops/` — deploy safety, measured baselines, and the production triage ledger.

New Markdown at the repository root is an error. Identity and filters only.

## Rules

- **Every change serves one of the two loops, or it is cut.** Loop 1 is anonymous discovery to
  run: land, see curated Skills, copy `npx skilld run owner/repo/skill`, hand it to the agent.
  Loop 2 is authenticated watching to digest. They ship on the same site and are sold
  separately: Loop 1 is the headline, Loop 2 is a CTA strip and a "Watch for changes"
  affordance. `VISION.md` has the full argument.
- **Running is the default; installing is the opt-in.** A Skill is knowledge, not a dependency.
  A remote run writes nothing at all: no lockfile entry, no agent target, no cache. So a Skill
  that needs to run its own script needs an install, and the site must not offer a run command
  for one.
- **Identity is one namespace, and the prefix decides which.** `/gh/[owner]` is always a
  GitHub-proxied entity. `/@<github-login>` is always an entity in skilld's own D1. A GitHub org
  and a collection author may share a name; the `@` disambiguates. The legacy `/people/*`
  namespace is 410 Gone.
- **Cross-layer reads go over HTTP.** `$fetch('/api/...')`, never a shared server utility. Every
  layer stays deletion-testable. Layer boundaries: ADR-0001.
- **Handlers read bindings from `event.context.platform`, never from
  `event.context.cloudflare.env`.** `server/plugins/platform.ts` mounts it with `db`, `ai`,
  `github`, and `requestId`.
- **An API route is `defineApiHandler({ schema, policy, handler, presenter })`.** Response shape
  belongs in a presenter, input in a zod schema, authorization in policy atoms. Never inline in
  the handler.
- **An indexable surface names its target query, its admission bar, and its cull path.** Roughly
  50k auto-generated pages got this site suppressed once. `VISION.md` principle 2 is the rule and
  [EXECUTE-seo-keyword-rework](docs/work/EXECUTE-seo-keyword-rework.md) is the live work.

## Traps

- **`docs/arch/cron.md` is generated.** Run `pnpm cron:docs` after any schedule change, or
  `pnpm cron:parity` fails. Never hand-edit the table.
- **Only the seeded top 1200 Skills carry an abstractness classification.** Everything newer is
  `is_abstract=NULL`, so a query that filters on it silently drops recent Skills. The fix is
  ledger item 3 of [EXECUTE-homepage-rebuild](docs/work/EXECUTE-homepage-rebuild.md).
- **Digest email is the Cloudflare `send_email` binding, not a provider API.** Until the account
  has Send Email enabled for arbitrary destinations, every recipient must be a Verified
  Destination Address in the dashboard. A digest to anyone else fails silently in testing.
- **`GOOGLE_RECOVERY.md` is in `.gitignore`.** Around ten source comments cite it as the reason a
  surface is `noindex` or absent from the sitemap, and nobody cloning this repository can read it.
  Treat those comments as pointing at nothing until the file is either committed or the comments
  are rewritten to carry their own reason.

## Consumers

- The skilld CLI and `@skilld/harness` are separate repositories. `skilld-dev/skilld/GLOSSARY.md`
  wins for CLI commands, protocol types, and source status values.
- The push-only grammar check (`pnpm cli:grammar`) blocks deployment until the npm `latest`
  release supports every command this site prints. Printing a command the released CLI lacks
  fails the deploy, not the page.
