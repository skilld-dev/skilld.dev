# skilld.dev — domain & architecture vocabulary

Use these terms exactly. Drift breeds shallow modules.

## Domain

- **Author** — a person with a GitHub login who publishes collections. Native to skilld.dev. Lives at `/@<github-login>`. Backed by D1, identity comes from GitHub OAuth.
- **Collection** — an author-curated bundle of skills with editorial rationale. Atomic unit of sharing. Lives at `/@<github-login>/<slug>`.
- **Curator** — collection author (D1-backed via GitHub login). Synonym for "author" in copy when referring specifically to someone who builds collections.
- **Owner** — a github org or user that hosts skill repos. Proxied entity. Lives at `/gh/[owner]`.
- **Repo** — a github repo containing one or more skills. Lives at `/gh/[owner]/[repo]`.
- **Skill** — a `SKILL.md` resolved from a repo. Lives at `/gh/[owner]/[repo]/[name]`.
- **Watch** — an authenticated user subscribing to a repo or collection so they receive digest emails when its skills change. (Phase 2.)
- **Digest** — periodic email summarizing changes to a user's watched repos. (Phase 3.)

## Identity rule

- `/gh/[owner]` is *always* a github-proxied entity (the repo owner namespace).
- `/@<github-login>` is *always* an authored entity in skilld's own data (the collection-author namespace).
- A github org and a collection author can share a name — the `@` prefix disambiguates the author namespace.

## Layers (see ADR-0001)

- **registry** — `/gh/*` and `api/orgs|repos|skills|*`. Owns GitHub proxying.
- **identity** (Phase 2) — GitHub OAuth, sessions, `users` table, subscriptions, digests.
- **app** — `/`, `/@<login>/*`, `/collections/*`, `api/collections|feed|*`. Owns native data.
- **marketing** — `/skills`, `/skills/*`, `/frameworks/*`, `/learn/*`. Built on `@nuxt/content`. Owns SEO content.
- **admin** — existing.

Cross-layer reads go via HTTP (`$fetch('/api/...')`), never shared server utilities. Each layer is deletion-testable.

## URL canonicals

| Concept | Canonical |
|---|---|
| Owner hub | `/gh/[owner]` |
| Repo hub | `/gh/[owner]/[repo]` |
| Skill | `/gh/[owner]/[repo]/[name]` |
| Author | `/@<github-login>` |
| Collection | `/@<github-login>/<slug>` |
| Marketing index | `/skills` |
| Framework page | `/frameworks/[name]` |

The legacy `/people/[handle]` and `/people/[handle]/collections/[slug]` URLs are 410 Gone (with a 301 special-case for `/people/harlanzw.com → /@harlanzw`).
