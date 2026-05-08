# ADR-0001: URL pillars and Nuxt layer split

**Status:** Accepted
**Date:** 2026-05-08

## Context

`/skills/[...slug].vue` was a catch-all branching on slug arity into three concepts (org, repo, skill). `/orgs/[owner].vue` duplicated the org case. `/gh/*` shipped as an alias. `legacySkillPath` and `repoSkillPath` both produced canonical-looking URLs with no rule for which to use. SEO pages (`guide`, `official`, `stats`) lived inside the entity namespace and forced the catch-all to allowlist them.

Identity was muddled: a GitHub user and a skilld curator (atproto) could land on overlapping URLs.

## Decision

Three Nuxt layers, three URL pillars, one rule per pillar.

### `/gh/*` — registry layer (proxied GitHub)
- `/gh/[owner]` — owner hub (org or user)
- `/gh/[owner]/[repo]` — repo hub
- `/gh/[owner]/[repo]/[name]` — skill detail
- Owns: [GitHub](https://github.com) fetch, SKILL.md resolution, registry sitemaps, `api/orgs|repos|skills|skill-live|skills-raw`.
- Knows nothing about curators, atproto, collections.

### `/people/*`, `/collections/*`, `/` — app layer (skilld native)
- `/` homepage feed
- `/people/[handle]` curator profile
- `/people/[handle]/collections/[slug]` collection detail (canonical; old `/people/[handle]/[slug]` 301s here)
- `/people/[handle]/collections/new`
- `/collections` discovery index
- Owns: atproto, collections, saves, feeds, auth.

### `/skills`, `/skills/*`, `/frameworks/*`, `/learn/*` — marketing layer
- `/skills` index, `/skills/guide`, `/skills/official`, `/skills/stats`
- `/frameworks/[name]` (e.g. `/nuxt` → `/frameworks/nuxt`)
- Built on `@nuxt/content` (MDC, content collections, schema).
- `/skills` namespace is reserved for marketing; entity routes live under `/gh`.

### Cross-layer data
Strict HTTP only (`$fetch('/api/...')`{lang="ts"}). No importing server utilities across layers. Each layer must be deletion-testable in isolation.

## Why `/gh` instead of folding into `/skills/[owner]/...`

The `/gh` prefix is an explicit signal — to readers, to crawlers, and to the layer boundary — that the page is a proxy of GitHub data, not native skilld content. It also avoids the `/skills/owner/skills/name` collision when a repo is named `skills`. The cost (one extra path segment) is paid by clarity at the seam.

## Consequences

- `app/pages/skills/[...slug].vue` and `app/pages/orgs/[owner].vue` deleted; replaced with explicit registry routes.
- `legacySkillPath` deleted; one canonical URL per skill.
- Existing URLs migrated via staged 301s (canonical tag → reindex → 301), per `docs/url-migration.md`.
- New framework or content pages are 1-file additions in the marketing layer.
- A GitHub user who is also a curator gets two pages by design: `/gh/[owner]` (their proxied repos) and `/people/[handle]` (their atproto identity), with a "claim" link bridging them.

## Rejected alternatives

- **Collapse `/gh` into `/skills/[owner]/...`:** rejected — collides with marketing namespace and with `repo === 'skills'` case.
- **Single `/skills/[pkg]` canonical with multiple sources:** deferred — requires a package-skill table; revisit when first-party package skills ship per SCOPE.md.
- **Allow shared server utilities across layers:** rejected — defeats the deletion test, lets layers couple silently.
