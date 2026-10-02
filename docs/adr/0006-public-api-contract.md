# ADR-0006: Public API contract

**Status:** Accepted
**Date:** 2026-10-02

## Context

The skilld CLI is the first consumer of this API. Today it can search, run, and install. It cannot
like a Skill, watch a Repository, list your collections, or read what changed in the Repositories
you watch. Those features exist only on the site, behind routes the site's own pages call. The CLI
parity work needs a stable way to reach them.

The site has two kinds of API route today:

1. **Internal routes.** `defineApiHandler` routes serve the site's pages. Their shapes follow the
   pages, and they may change on any deploy. Two of them, `/api/cli/collections` and
   `/api/cli/changes`, answer `skilld-protocol` wire shapes for `skilld pull` and `skilld changes`
   in the v2 CLI. The Rust CLI never shipped either command.
2. **`/api/v1`.** Artifact delivery (ADR-0005) and `skills.search` shipped there to the Rust CLI.
   Their schemas live twice: in the server, and in the hand-written OpenAPI YAML of
   `skilld-protocol` in the CLI repository. Nothing checks the YAML against the server.

skilld 3.2.0 parses the `skills.search` answer and every problem body with
`deny_unknown_fields`. A new field in either one breaks the released CLI.

nuxtseo.com ships its developer surfaces as three doors: a CLI, an MCP server, and an API with a
typed SDK. skilld.dev has the first two. The third door costs little once the CLI needs a
contract anyway.

VISION anti-scope 5 says protocol work serves the skilld CLI and requires a dated ADR. This is that
ADR.

## Decision

### One contract package

`packages/sdk` holds the contract, beside the server that serves it. It publishes to [npm](https://npmjs.com) as
`skilld-sdk`. One descriptor per operation drives four things:

- **The OpenAPI document.** `pnpm --filter skilld-sdk generate` writes
  `packages/sdk/generated/openapi.v1.json`. The file is committed, the site serves it at
  `/api/v1/openapi.json`, and a test fails when it drifts from the contract.
- **The route checks.** A `/api/v1` route is `defineApiOperation({ operation, handler })` from
  `#shared/server/operation`. The descriptor parses each request location, requires a credential
  for an account operation, and sets the status and the cache headers. Every answer passes the
  producer schema, which rejects any field the contract does not name. A failed check answers 500
  `INTERNAL_ERROR`, never a wrong body. The route fails closed.
- **The SDK.** `createSkilldClient()` exposes each operation as `skilld.<namespace>.<key>()` and
  returns a tagged `Ok | Err` result. It reads answers with a lenient client schema, so a newer
  server never breaks an older SDK.
- **The route parity test.** `test/unit/api-v1-parity.test.ts` requires exactly one route file per
  operation, at the operation's own path. It also requires every route file under `/api/v1` to bind
  an operation.

An operation ID is `namespace.verb` and never changes. A query is a `GET`. A `PUT` or `DELETE`
names an end state, so the SDK may send it twice. A `POST` or `PATCH` is never retried.

### The wire format stays the shipped one

The contract keeps the `/api/v1` format that Artifact delivery and `skills.search` already ship:

- A success body is bare JSON. A list is `{ items, total }`, paged with `limit` and `offset`.
- A failure is RFC 9457 `application/problem+json` with exactly six fields: `type`, `title`,
  `status`, `detail`, `instance`, and `code`.
- The request ID travels in the `X-Request-Id` header.

The contract adds no `{ data, meta }` envelope. An envelope would break `skills.search` and every problem
body that skilld 3.2.0 parses. The one thing it would carry, the request ID, already has a header.

### Answers are additive

Within v1, an answer may gain a field. It never loses one, and a field never changes its meaning.
A change that breaks a caller ships under `/api/v2`. A deprecated operation sends the RFC 9745
`Deprecation` header and records its date in the descriptor.

One answer is frozen: `skills.search`. It never gains a field while skilld 3.2.0 is in use. New
fields go to `skills.get`.

### Authentication uses the credentials that exist

An account operation accepts the skilld.dev sign-in cookie, or a skilld token as a Bearer
credential. A skilld token is the one `skilld auth login` stores, or one created at
`/me/cli-tokens/new`. The API adds no token table, no API key, and no scope.

Account deletion has no operation. It stays in the browser, where the site asks for confirmation.
A leaked skilld token can change account state, such as likes and watches. It cannot delete the
account.

A GitHub Actions token from the OIDC exchange lasts one hour. It cannot create a skilld token, so a
compromised workflow cannot keep account access after its job ends.

### Public operations are cacheable from any origin

A public operation never reads the session. A public query sends `Cache-Control: public` with a
max age, and `Access-Control-Allow-Origin: *`, on its answer and on its problems. A shared cache may
store one copy for every caller. `index_requests` is public but changes state or polls it, so it
sends `private, no-store`.

An account operation sends `Cache-Control: private, no-store` and no CORS header. A script or a
server can call it with a skilld token. A browser page on another origin cannot call it, and the
sign-in cookie works only on skilld.dev itself.

### The CLI checks the same document

The Rust CLI vendors the generated OpenAPI document and decodes every example in a test. The
contract already parses each example against its producer schema at import. An example that one
side cannot read therefore fails a test on both sides before a release.

### Subtraction

The SQL lives once. The internal routes the pages call and the v1 routes now share one loader per
resource, so the change moved logic out of route files instead of copying it. One module,
`shared/server/skill-cards.ts`, builds every Skill card, so `pageUrl` and `sourceUrl` cannot
disagree between operations.

`/api/cli/collections` and `/api/cli/changes` stay for now, because the v2.3.0 CLI still calls them.
The account operations supersede both. They go when v2 traffic to them reaches zero. The
hand-written YAML in `skilld-protocol` goes when Artifact delivery joins the contract.

### Money posture

The test is whether the API creates an obligation to anyone other than the developer using it. It
does not:

- The API is free. It has no key to sell, no paid tier, and no rate tier.
- It has no SLA, no uptime promise, and no support channel.
- The only promise is the additive v1 answer, and the first consumer it serves is the skilld CLI.
- No operation publishes, uploads, or hosts a Skill. [GitHub](https://github.com) stays the source of truth
  (anti-scope 5).
- No answer carries an install count (anti-scope 4). Every Skill in an answer carries its
  provenance (principle 1).
- Installed Skills never call the API. skilld stays out of the Agent's runtime path (principle 5).

## Consequences

`AGENTS.md` names `defineApiOperation` as the shape of every `/api/v1` route in the contract.
Internal routes keep `defineApiHandler`, and they stay free to change.

The site serves some data twice: once to its pages, once through `/api/v1`. A v1 route calls the
owning layer's utilities, or reads the internal route in process. It never duplicates SQL.

Artifact delivery stays outside the contract for now. The parity test exempts
`layers/artifact-delivery`, and its schemas stay in `skilld-protocol`.

A third-party caller may build on v1. The posture above is all it gets.

## Follow-ups

- Fold Artifact delivery into the contract, then retire the hand-written YAML in `skilld-protocol`.
- Add a Workers rate-limit binding to `/api/v1`. `RATE_LIMITED` and `Retry-After` are already in
  the contract.
- Make the MCP tools call v1 through the SDK, so the MCP server and the API cannot disagree.
- Publish `skilld-sdk` to npm from `.github/workflows/publish-sdk.yml`. The first publish is
  manual, because npm sets up a trusted publisher only for a package that exists.
- Remove `/api/cli/collections` and `/api/cli/changes` when v2 traffic to them reaches zero.

## Rejected alternatives

- **A `{ data, meta }` envelope,** the shape nuxtseo.com uses. It breaks the shipped CLI for no
  gain.
- **A hand-written OpenAPI file.** `skilld-protocol` already shows how it drifts from the server.
- **A separate API repository.** The contract would drift from the routes it describes. Beside the
  server, one test run checks both.
- **API keys with scopes.** A second credential system to secure, with an enterprise shape that
  anti-scope 7 rejects. The existing skilld token covers the CLI and scripts alike.
