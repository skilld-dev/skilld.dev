# Public API v1

Date: 2026-10-02

**Next move:** Review the CLI documentation follow-up and move the contract package to the public CLI repository.

Done means: the skilld CLI release on npm `latest` reaches likes, watches, collections, and changes through `/api/v1`, and `skilld-sdk` installs from npm.

Decisions: [ADR-0006](../adr/0006-public-api-contract.md). Shape: [docs/arch/README.md](../arch/README.md#public-api-adr-0006).

## Ledger

- [x] **Site API.** #362 added the contract, routes, OpenAPI document, SDK, and API tab.
- [x] **CLI parity in `~/pkg/skilld`.** skilld-dev/skilld#180 added account commands and contract example checks. Release 3.3.0 reached npm `latest`.
- [ ] **Developers page CLI tab.** Branch `feat/developers-cli-commands` adds account commands and generates `/docs/cli` from release 3.3.0. `pnpm cli:grammar` checks the printed commands.
- [x] **Publish `skilld-sdk`.** Harlan published 0.1.0. Move the publishing workflow with the contract to `skilld-dev/skilld`.
- [ ] **Fold Artifact delivery into the contract.** Then retire the hand-written OpenAPI YAML in `skilld-protocol`, and drop the parity test's exemption for `layers/artifact-delivery`.
- [ ] **Rate limit `/api/v1`** with a Workers rate-limit binding. The contract already declares `RATE_LIMITED` and `Retry-After`.
- [ ] **MCP tools call v1 through the SDK,** so the MCP server and the API answer the same shapes.
- [ ] **Decide the API terms in `GLOSSARY.md`:** skilld token, skilld API, operation, and SDK. Then rename "New CLI token" on `/me/cli-tokens/new` and the "CLI tokens" lines in the privacy page.
- [x] **List the OpenAPI document in `/.well-known/api-catalog`.** `aiReady.apiCatalog` in `nuxt.config.ts`.
- [ ] **Remove `/api/cli/collections` and `/api/cli/changes`** when v2 CLI traffic to them reaches zero. The account operations supersede both.
- [ ] **Correct the `digest` entry in `GLOSSARY.md`.** Migration 0117 moved the digest to one fixed schedule, so "weekly by default; daily and off are options" is out of date. `account.update` takes `digest` as on or off.

## Log

- 2026-10-02 Contract, server binding, and SDK written on `feat/public-api`. ADR-0006 records the wire format, the auth model, and the money posture.
- 2026-10-02 Release run 36964676286 completed successfully. GitHub published v3.3.0, and npm `latest` resolved to 3.3.0. The CLI follow-up adds account commands and generates the reference from release help.
