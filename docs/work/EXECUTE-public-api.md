# Public API v1

Status: open · 2026-10-02 · branch `feat/public-api`

**Next move:** Harlan reviews the `feat/public-api` pull request. Publish `skilld-sdk` to [npm](https://npmjs.com) by hand before it deploys, because the developers page prints `npm install skilld-sdk`.

Done means: the skilld CLI release on npm `latest` reaches likes, watches, collections, and changes through `/api/v1`, and `skilld-sdk` installs from npm.

Decisions: [ADR-0006](../adr/0006-public-api-contract.md). Shape: [docs/arch/README.md](../arch/README.md#public-api-adr-0006).

## Ledger

- [ ] **Site API.** The contract in `packages/sdk`, a `defineApiOperation` route per operation, the generated OpenAPI document, the SDK, and the API tab on `/developers?setup=api`. Branch `feat/public-api`.
- [ ] **CLI parity in `~/pkg/skilld`.** The next pull request. Vendor `generated/openapi.v1.json`, decode every example in a test, and add the account commands on top of the v1 operations.
- [ ] **Developers page CLI tab.** List the new commands only after the CLI release that has them reaches npm `latest`. `pnpm cli:grammar` blocks the deploy before that.
- [ ] **Publish `skilld-sdk`.** Harlan publishes the first version by hand. Then add `.github/workflows/publish-sdk.yml` as the npm trusted publisher, so a `sdk-v<version>` tag publishes the next one.
- [ ] **Fold Artifact delivery into the contract.** Then retire the hand-written OpenAPI YAML in `skilld-protocol`, and drop the parity test's exemption for `layers/artifact-delivery`.
- [ ] **Rate limit `/api/v1`** with a Workers rate-limit binding. The contract already declares `RATE_LIMITED` and `Retry-After`.
- [ ] **MCP tools call v1 through the SDK,** so the MCP server and the API answer the same shapes.
- [ ] **Decide the API terms in `GLOSSARY.md`:** skilld token, skilld API, operation, and SDK. Then rename "New CLI token" on `/me/cli-tokens/new` and the "CLI tokens" lines in the privacy page.
- [x] **List the OpenAPI document in `/.well-known/api-catalog`.** `aiReady.apiCatalog` in `nuxt.config.ts`.
- [ ] **Remove `/api/cli/collections` and `/api/cli/changes`** when v2 CLI traffic to them reaches zero. The account operations supersede both.
- [ ] **Correct the `digest` entry in `GLOSSARY.md`.** Migration 0117 moved the digest to one fixed schedule, so "weekly by default; daily and off are options" is out of date. `account.update` takes `digest` as on or off.

## Log

- 2026-10-02 Contract, server binding, and SDK written on `feat/public-api`. ADR-0006 records the wire format, the auth model, and the money posture.
