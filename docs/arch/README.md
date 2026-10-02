# Architecture

How skilld.dev is shaped. The vocabulary these names use is [`GLOSSARY.md`](../../GLOSSARY.md);
this file says where each concept lives and which layer owns it.

Use the names exactly. Drift breeds shallow modules.

## Identity rule

- `/gh/[owner]` is *always* a GitHub-proxied entity (the repository owner namespace).
- `/@<github-login>` is *always* an authored entity in skilld's own data (the collection-author namespace).
- A GitHub org and a collection author can share a name; the `@` prefix disambiguates the author namespace.

## Layers (see ADR-0001)

- **registry**: `/gh/*` and `api/orgs|repos|skills|*`. Owns GitHub proxying.
- **identity** (Phase 2): GitHub OAuth, sessions, `users` table, subscriptions, digests.
- **app**: `/`, `/community`, `/@<login>/*`, `/collections/new`, `api/community|collections|feed|*`. Owns native data.
- **marketing**: `/skills`, `/skills/*`, `/frameworks/*`, `/learn/*`. Comark renders its Markdown. Owns SEO content.
- **admin**: existing.
- **artifact delivery:** `/api/v1/resolutions|artifacts|trusted-root|github/connections`. Owns exact source resolution, checks, signing, grants, and transient delivery.

Cross-layer reads go via HTTP (`$fetch('/api/...')`), never shared server utilities. Each layer is deletion-testable.

## Server-side architecture

- **Platform**: request-scoped object on `event.context.platform` carrying every infrastructure binding a handler needs: `db` (D1), `ai` (Workers AI), `github` (resolved client), `requestId`. Mounted by `server/plugins/platform.ts`. Handlers must read bindings from here, never directly from `event.context.cloudflare.env`. `db` is one D1 session per request: a safe method starts on any read replica, a mutating method starts on the primary, and a write's bookmark rides a `d1-bookmark` cookie so the next request reads it. Cron tasks and queue consumers use the raw binding, which always reaches the primary.
- **defineApiHandler**: the shape of every internal API route: `{ schema, policy, handler, presenter }`. Schema is a zod input, policy is an array of atomic predicates AND-ed, handler receives `{ body, platform, user, event }`, presenter shapes the response. Defined in `shared/server/handler.ts`.
- **Policy**: a `(ctx) => boolean | Promise<boolean>` atom in `layers/<layer>/server/policies/`. Composes by array.
- **Presenter**: a `(row) => dto` in `layers/<layer>/server/presenters/`. Response shape lives here, never inline in handlers.
- **Schema**: a zod input schema in `layers/<layer>/server/schemas/`. Auto-validated by `defineApiHandler`.

## Public API (ADR-0006)

`/api/v1` is the only API surface with a promise: an answer may gain a field and never loses one.
Internal routes may change on any deploy. One descriptor per operation, in
`skilld-dev/skilld` at `packages/sdk/src/contract`, drives four things.
This site consumes an exact npm version of `skilld-sdk`, following ADR-0007:

```text
descriptor (skilld-dev/skilld: packages/sdk/src/contract)
  ├─ OpenAPI document   generated/openapi.v1.json, served at /api/v1/openapi.json, drift test
  ├─ route checks       defineApiOperation in shared/server/operation.ts
  ├─ SDK                createSkilldClient, published as skilld-sdk
  └─ parity test        test/unit/api-v1-parity.test.ts: one route file per operation
```

- **Operation**: one `namespace.verb` entry in the contract, such as `skills.get`. Its ID never changes. Public handlers never receive caller identity. Rate-limit middleware verifies credentials only to select an allowance. Account operations reuse that identity. V1 responses bypass Workers Cache so every network request reaches the limiter. See [ADR-0008](../adr/0008-api-rate-limits.md).
- **defineApiOperation**: the shape of a `/api/v1` route: `{ operation, handler }`. The descriptor parses the input, checks the credential, and sets the status and cache headers. The handler only loads data. The answer passes the strict producer schema, so an unnamed field fails closed with a 500.
- **Route file**: lives in the layer that owns the data, at the operation's own path: `GET /api/v1/skills/{owner}/{repository}/{name}` is `layers/registry/server/api/v1/skills/[owner]/[repository]/[name].get.ts`. It calls that layer's utilities, or reads the internal route in process. It never duplicates SQL.
- **v1 presenter**: a pure function in `layers/<layer>/server/presenters/<thing>-v1.ts`, typed `OperationResult<typeof op>`.
- **Failures**: `operationFailure(code, detail)` returns an expected failure as a value. Every failure answers RFC 9457 `application/problem+json` with six fields, because the skilld CLI rejects any other.
- **Frozen**: the `skills.search` answer never gains a field while skilld 3.2.0 is in use.
- **Outside the contract**: Artifact delivery keeps its own schemas until it folds in.

After a contract change in the `skilld-dev/skilld` repository, run `pnpm --filter skilld-sdk generate` and commit the document.
Publish the new SDK version from that repository's `release.yml`. Then update this site's exact catalog pin.
The route parity test checks the site against the published contract.
See [ADR-0007](../adr/0007-contract-in-the-cli-repository.md).

## App-side architecture

- **Service**: an object owning an API client or app-wide reactive state. Constructed by `createAppServices(config)` in `app/services/`, exposed via `nuxtApp.$services`. Composables that just bind keys or call `$fetch` are not services.
- **Public pages render signed out**: the server never reads the session for a public page. The server render must not branch on User-Agent either, because `Vary` does not name it. Only then can one stored copy serve every visitor. A page that calls `useBotDetection()` on the server needs that call removed before it gets an edge cache rule. The browser loads the session after hydration. `useAuth().state` is `pending`, `anonymous`, or `signed-in`, and an auth-dependent control renders a same-size placeholder while it is `pending`. A page that needs the session on the server uses the `session` or `auth` route middleware, which also marks the response `private, no-store`.
- **Session reads**: server code reads the session with `readUserSession()`. It opens a session only when the request carries one, because h3 sets a new session cookie on every other read. ESLint bans a direct `getUserSession()`.
- **Markdown negotiation**: `shared/content-negotiation.ts` decides HTML or a 307 to the `.md` URL from `Accept` and `Sec-Fetch-Dest` only, and every page response names both in `Vary`.

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
