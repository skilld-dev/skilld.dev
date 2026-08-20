# ADR 0005: v3 skilld CLI, Harness, and Artifact delivery

Date: 2026-08-20

Status: accepted

## Context

The v2 `skilld` CLI combines Skill management and generation.

Current Agents can follow package-specific authoring instructions with large context windows.

The CLI can become faster and smaller by focusing on Skill management.

Public and private GitHub installs need exact provenance and fail-closed delivery.

This direction changes earlier VISION exclusions.

## Decision

The skilld CLI becomes Rust.

The project publishes visible skilld-maintained Skills for direct generation, review, search, and install guidance.

`@skilld/harness` runs those same assets with deterministic checks and atomic promotion.

Direct runs remain user reviewed.

`skilld.dev` resolves exact GitHub commits into immutable Artifacts with attestations.

Artifact attestations contain exact check results.

They never claim that a Skill is safe.

Private GitHub support uses account-scoped transient Artifact delivery.

GitHub remains the namespace and source of truth.

The service provides no private registry, upload flow, team policy, seats, or SSO.

## Consequences

The registry may publish skilld-maintained Skills without presenting generated output as maintainer-authored content.

The site adds a versioned Artifact delivery interface under `/api/v1`.

Public Artifacts may use immutable shared cache entries.

Private Artifacts remain encrypted and short lived.

Installed Skills remain local files and work when skilld.dev is unavailable.

New installs and upgrades fail closed when current policy cannot be checked.

Explicit direct remote installs remain available with an `unverified` source status.

This ADR supersedes VISION clauses that rejected skilld-maintained Skills, all Artifact hosting, and all private source delivery.

It preserves the rejection of private registries and safety guarantees.
