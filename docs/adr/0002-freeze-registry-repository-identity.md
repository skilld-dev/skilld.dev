# ADR-0002: Freeze registry repository identity

**Status:** Accepted
**Date:** 2026-07-27

## Context

[GitHub](https://github.com) repository renames and transfers change
`nameWithOwner`. The registry uses `owner`, `repo`, and `name` as durable keys
across skills, revisions, collections, subscriptions, activity, generated
content, and public `/gh` routes. An hourly sync cannot safely rewrite all of
those keys without risking indexed URLs.

GitHub resolves an old repository name to the current repository. Its
[GraphQL](https://graphql.org) response exposes the canonical `nameWithOwner`.

## Decision

The registry identity is frozen at first admission. A rename does not rewrite
`owner`, `repo`, skill slugs, or public `/gh` routes, so no registry redirect is
required.

`repos.source_owner` and `repos.source_repo` store GitHub's current canonical
identity. Sync records these values and uses them for tree, blob, commit, and
render fetches. Later syncs start from the stored source identity, removing the
ongoing dependency on GitHub resolving the old name.

## Consequences

Existing indexed registry URLs remain stable. GitHub source access follows
renames without cross-table migrations. Repository transfers do not transfer
registry trust, subscriptions, collections, or activity to a new public
identity.

Deploy migration `0078_repo_source_identity.sql` before code that writes the
new columns. The next successful sync records canonical source identity for
renamed repositories.

## Rejected alternative

We rejected migrating registry identity and adding aliases. That path requires
an atomic rewrite of skills, revisions, collections, subscriptions, activity,
and generated content, plus permanent redirect storage. The frozen URL avoids
that work and stays valid.
