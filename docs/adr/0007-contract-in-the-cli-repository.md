# ADR-0007: Contract in the CLI repository

**Status:** Accepted
**Date:** 2026-10-02
**Amends:** [ADR-0006](0006-public-api-contract.md), package location and publishing.

## Context

The contract and SDK need public source and npm provenance.
The site repository is private. The CLI repository is public and already publishes packages.

## Decision

The public repository `skilld-dev/skilld` owns `packages/sdk` and publishes it as `skilld-sdk`.
It owns the descriptors, generator, client, tests, and committed `generated/openapi.v1.json`.
Rust contract tests read that document directly.

The CLI repository's `release.yml` publishes new SDK versions from GitHub-hosted runners with OIDC and provenance.
A manual workflow dispatch can publish the SDK without a CLI release.
The SDK keeps its own version.

The site consumes an exact npm catalog version of `skilld-sdk`.
It imports `skilld-sdk/contract` and `skilld-sdk/openapi.json`.
Its route parity test checks the routes against the published contract.
The site serves the package's document at `/api/v1/openapi.json`.

For a contract change:

1. Change the contract in the `skilld-dev/skilld` repository.
2. Run `pnpm --filter skilld-sdk generate` and commit the generated document.
3. Release the SDK through the CLI repository's workflow.
4. Update the site's exact catalog pin in a separate pull request.
5. Change site routes as needed and run the parity test before deployment.

## Consequences

The site removes its local SDK package and SDK publish workflow.
The npm trusted publisher points at `skilld-dev/skilld`, file `release.yml`, without an environment.
A contract change requires a package release before the site can consume it.

ADR-0006's wire format, authentication, route checks, and compatibility rules remain in force.
The `skills.search` answer stays frozen for skilld 3.2.0.
Artifact delivery stays outside this contract.
