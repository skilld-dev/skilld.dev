# skilld.dev

Registry site for Agent Skills: GitHub-proxied discovery, author-curated collections, and digest
emails. Nuxt on Cloudflare Workers, D1, and Workers AI.

## Read first

- [`VISION.md`](VISION.md) — the product filter: mission, money posture, the two loops, seven principles, anti-scope. Read before any product, scope, design, or marketing decision. When it conflicts with the code, VISION wins.
- [`DESIGN.md`](DESIGN.md) — the visual filter: tokens, the three design principles, components, motion, the brand system, and the Avoid list. Read before UI work.
- [`COPY.md`](COPY.md) — the verbal filter: the canonical strings, the register per context, and the banned language. Read before any user-visible string.
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
  A remote run writes nothing at all: no lockfile entry, no agent target, no cache. Every Skill
  surface leads with the run command, and the install command sits under it as the opt-in.
- **Identity is one namespace, and the prefix decides which.** `/gh/[owner]` is always a
  GitHub-proxied entity. `/@<github-login>` is always an entity in skilld's own D1. A GitHub org
  and a collection author may share a name; the `@` disambiguates. The legacy `/people/*`
  namespace is 410 Gone.
- **Cross-layer reads go over HTTP.** `$fetch('/api/...')`, never a shared server utility. Every
  layer stays deletion-testable. Layer boundaries: ADR-0001.
- **Handlers read bindings from `event.context.platform`, never from
  `event.context.cloudflare.env`.** `server/plugins/platform.ts` mounts it with `db`, `ai`,
  `github`, and `requestId`.
- **An internal API route is `defineApiHandler({ schema, policy, handler, presenter })`.**
  Response shape belongs in a presenter, input in a zod schema, authorization in policy atoms.
  Never inline in the handler.
- **A `/api/v1` route in the contract is `defineApiOperation({ operation, handler })`** from
  `#shared/server/operation`. Its descriptor lives in the public CLI repository at
  `packages/sdk/src/contract`. Its route file sits at the operation's own path.
  In the `skilld-dev/skilld` repository, run `pnpm --filter skilld-sdk generate` and commit the OpenAPI file.
  Publish the SDK, then update this site's exact catalog pin. Answers only gain fields. ADR-0006 and ADR-0007.
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
- **`skills.search` answers are frozen for skilld 3.2.0.** The CLI parses them with
  `deny_unknown_fields`, so one new field breaks every released `skilld search`. Add the field to
  `skills.get`.
- **A comment carries its own reason.** Never cite a gitignored file, such as
  `GOOGLE_RECOVERY.md`, or a file on a personal machine as the reason for a decision.
  Nobody who clones this repository can read either one.

## Consumers

- The public CLI repository owns `packages/sdk`, published as `skilld-sdk`. This site pins its exact npm version.
  Under ADR-0007, Rust tests read its generated OpenAPI file and decode every example.
- The skilld CLI and `@skilld/harness` are separate repositories. `skilld-dev/skilld/GLOSSARY.md`
  wins for CLI commands, protocol types, and source status values.
- The push-only grammar check (`pnpm cli:grammar`) blocks deployment until the npm `latest`
  release supports every command this site prints. Printing a command the released CLI lacks
  fails the deploy, not the page.
- The skilld Skill comes from `skills/skilld` in `skilld-dev/skilld`. `.skills/skilld.json` pins
  its commit, and `.skills/skilld` is the synced copy that Claude Code, Codex, and opencode load.
  Never edit the copy. To update it, change the pinned commit and run `pnpm sync:skills`.
  CI runs `pnpm check:skills`, which fails when the copy drifts from its declaration.
- The Skill evals live in `skilld-dev/skilld` (`pnpm eval:opencode`). Point them at a local or
  preview site with `--site <origin>` before you deploy an MCP or API change.
