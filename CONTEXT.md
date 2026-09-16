# skilld.dev — domain & architecture vocabulary

Use these terms exactly. Drift breeds shallow modules.

## Domain

- **Author** — a person with a GitHub login who publishes collections. Native to skilld.dev. Lives at `/@<github-login>`. Backed by D1, identity comes from GitHub OAuth.
- **Collection** — an author-curated bundle of skills with editorial rationale. Atomic unit of sharing. Lives at `/@<github-login>/<slug>`.
- **Curator** — collection author (D1-backed via GitHub login). Synonym for "author" in copy when referring specifically to someone who builds collections.
- **Owner** — a GitHub organization or user that hosts Skill repositories. Proxied entity. Lives at `/gh/[owner]`.
- **Repository** — a GitHub repository containing one or more Skills. Lives at `/gh/[owner]/[repo]`.
- **Skill** — a `SKILL.md` resolved from a repository. Lives at `/gh/[owner]/[repo]/[name]`.
- **Watch** — an authenticated user subscribing to a repository or collection so they receive digest emails when its Skills change. (Phase 2.)
- **Digest** — periodic email summarizing changes to a user's watched repositories. (Phase 3.)
- **skilld-maintained Skill:** a Skill maintained by the skilld project for generation, review, search, or install guidance. It is not a registry admission.
- **Harness:** the JavaScript `@skilld/harness` package that runs skilld-maintained Skills with strict output checks.
- **Artifact:** immutable Skill bytes resolved from one exact Git commit for delivery to the skilld CLI.
- **Artifact attestation:** a signed claim that links an Artifact to its Repository, commit, contents, and check results.
- **Check result:** one named check, version, finding, and outcome for an Artifact.
- **Source status:** the skilld CLI provenance value: `verified`, `local`, or `unverified`.

## Identity rule

- `/gh/[owner]` is *always* a GitHub-proxied entity (the repository owner namespace).
- `/@<github-login>` is *always* an authored entity in skilld's own data (the collection-author namespace).
- A github org and a collection author can share a name — the `@` prefix disambiguates the author namespace.

## Layers (see ADR-0001)

- **registry** — `/gh/*` and `api/orgs|repos|skills|*`. Owns GitHub proxying.
- **identity** (Phase 2) — GitHub OAuth, sessions, `users` table, subscriptions, digests.
- **app** — `/`, `/community`, `/@<login>/*`, `/collections/new`, `api/community|collections|feed|*`. Owns native data.
- **marketing** — `/skills`, `/skills/*`, `/frameworks/*`, `/learn/*`. Comark renders its Markdown. Owns SEO content.
- **admin** — existing.
- **artifact delivery:** `/api/v1/resolutions|artifacts|trusted-root|github/connections`. Owns exact source resolution, checks, signing, grants, and transient delivery.

Cross-layer reads go via HTTP (`$fetch('/api/...')`), never shared server utilities. Each layer is deletion-testable.

## Server-side architecture

- **Platform** — request-scoped object on `event.context.platform` carrying every infrastructure binding a handler needs: `db` (D1), `ai` (Workers AI), `github` (resolved client), `requestId`. Mounted by `server/plugins/platform.ts`. Handlers must read bindings from here, never directly from `event.context.cloudflare.env`.
- **defineApiHandler** — the single Nitro entrypoint shape: `{ schema, policy, handler, presenter }`. Schema is a zod input, policy is an array of atomic predicates AND-ed, handler receives `{ body, platform, user, event }`, presenter shapes the response. Defined in `shared/server/handler.ts`.
- **Policy** — a `(ctx) => boolean | Promise<boolean>` atom in `layers/<layer>/server/policies/`. Composes by array.
- **Presenter** — a `(row) => dto` in `layers/<layer>/server/presenters/`. Response shape lives here, never inline in handlers.
- **Schema** — a zod input schema in `layers/<layer>/server/schemas/`. Auto-validated by `defineApiHandler`.

## App-side architecture

- **Service** — an object owning a client (an API client) or app-wide reactive state. Constructed by `createAppServices(config)` in `app/services/`, exposed via `nuxtApp.$services`. Composables that just bind keys or call `$fetch` are not services.

## URL canonicals

| Concept | Canonical |
|---|---|
| Owner hub | `/gh/[owner]` |
| Repository | `/gh/[owner]/[repo]` |
| Skill | `/gh/[owner]/[repo]/[name]` |
| Author | `/@<github-login>` |
| Collection | `/@<github-login>/<slug>` |
| Marketing index | `/skills` |
| Framework page | `/frameworks/[name]` |

The legacy `/people/[handle]` and `/people/[handle]/collections/[slug]` URLs are 410 Gone (with a 301 special-case for `/people/harlanzw.com → /@harlanzw`).
