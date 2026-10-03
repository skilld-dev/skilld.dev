# Public API v1

Status: open · 2026-10-03 · SDK 0.1.1 consumed; rate-limit implementation merged in #374

**Next move:** Ready. Fold Artifact delivery into the contract. Declare public `RATE_LIMITED` answers in the SDK contract.

**Delivery order:** Publish the public SDK, then update the site’s exact npm pin through a pull request.

Done means: the skilld CLI release on npm `latest` reaches likes, watches, collections, and changes through `/api/v1`, and `skilld-sdk` installs from npm.

Decisions: [ADR-0006](../adr/0006-public-api-contract.md) and [ADR-0007](../adr/0007-contract-in-the-cli-repository.md). Shape: [docs/arch/README.md](../arch/README.md#public-api-adr-0006).

## Ledger

- [x] **Site API.** #362 added the contract, routes, OpenAPI document, SDK, and API tab.
- [x] **CLI parity in `~/pkg/skilld`.** skilld-dev/skilld#180 added account commands and contract example checks. Release 3.3.0 reached npm `latest`.
- [x] **Developers page CLI tab.** #364 added account commands and generated `/docs/cli` from release 3.3.0. `pnpm cli:grammar` checks the printed commands.
- [x] **Publish `skilld-sdk`.** skilld-dev/skilld#182 moved the contract and publisher to the public CLI repository. Release run 36970062302 published 0.1.1 with provenance.
- [x] **Consume the published contract.** The site pins 0.1.1 and removes its local package and publisher. ADR-0007 records the release order.
- [ ] **Fold Artifact delivery into the contract.** Then retire the hand-written OpenAPI YAML in `skilld-protocol`, and drop the parity test's exemption for `layers/artifact-delivery`.
- [x] **Rate limit `/api/v1`** with guest and account Workers rate-limit bindings in #374.
- [x] **MCP tools call v1 through the SDK,** so MCP and WebMCP return the public operation shapes.
- [ ] **Declare `RATE_LIMITED` for public operations in the SDK contract.** SDK 0.1.1 reports public 429 answers as contract failures.
- [x] **Define skilld token and replace the old token labels.** #372 added the term and inline token creation.
- [ ] **Decide the remaining API terms in `GLOSSARY.md`:** skilld API, operation, and SDK.
- [x] **List the OpenAPI document in `/.well-known/api-catalog`.** `aiReady.apiCatalog` in `nuxt.config.ts`.
- [ ] **Remove `/api/cli/collections` and `/api/cli/changes`** when v2 CLI traffic to them reaches zero. The account operations supersede both.
- [ ] **Correct the `digest` entry in `GLOSSARY.md`.** Migration 0117 moved the digest to one fixed schedule, so "weekly by default; daily and off are options" is out of date. `account.update` takes `digest` as on or off.

## Log

- 2026-10-03 #374 merged on October 2 with passing tests, lint, typecheck, and build.
  Deployment [37038090688](https://github.com/skilld-dev/skilld.dev/actions/runs/37038090688) passed on `1ccf98ec`, which includes #374.
  Production rate-limit load testing was outside this check-in.
- 2026-10-03 #372 defined skilld token. A search found no old token labels in user-facing app code.
  `layers/mcp/shared/mcp-tools.ts` still reads legacy endpoints and defines separate response types.

- 2026-10-02 Contract, server binding, and SDK written on `feat/public-api`. ADR-0006 records the wire format, the auth model, and the money posture.
- 2026-10-02 Release run 36964676286 completed successfully. GitHub published v3.3.0, and npm `latest` resolved to 3.3.0. The CLI follow-up adds account commands and generates the reference from release help.

- 2026-10-02 #364 and skilld-dev/skilld#182 merged. npm trust moved to the CLI repository. Release run 36970062302 published skilld-sdk 0.1.1. The site migration pins that version and retains route parity checks.

- 2026-10-03 `refactor/mcp-public-sdk` uses SDK search, Skill lookup, and collection lookup for both MCP transports.
  Collection pagination moves to the API. Search returns its frozen source-and-stars shape; Skill lookup supplies the run command.
  Tests cover contract examples, invalid responses, missing entities, cancellation, and single-request failure handling.
  SDK 0.1.1 declares rate limits for some account operations, but not public discovery operations.
  Public 429 answers therefore produce a reported contract failure and a redacted tool error.
  Correct the published contract in the CLI repository, publish the SDK, then update this site's exact pin.
