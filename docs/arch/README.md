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
- **defineApiHandler**: the single Nitro entrypoint shape: `{ schema, policy, handler, presenter }`. Schema is a zod input, policy is an array of atomic predicates AND-ed, handler receives `{ body, platform, user, event }`, presenter shapes the response. Defined in `shared/server/handler.ts`.
- **Policy**: a `(ctx) => boolean | Promise<boolean>` atom in `layers/<layer>/server/policies/`. Composes by array.
- **Presenter**: a `(row) => dto` in `layers/<layer>/server/presenters/`. Response shape lives here, never inline in handlers.
- **Schema**: a zod input schema in `layers/<layer>/server/schemas/`. Auto-validated by `defineApiHandler`.

## App-side architecture

- **Service**: an object owning an API client or app-wide reactive state. Constructed by `createAppServices(config)` in `app/services/`, exposed via `nuxtApp.$services`. Composables that just bind keys or call `$fetch` are not services.
- **Public pages render signed out**: the server never reads the session for a public page, so one stored copy can serve every visitor. The browser loads the session after hydration. `useAuth().state` is `pending`, `anonymous`, or `signed-in`, and an auth-dependent control renders a same-size placeholder while it is `pending`. A page that needs the session on the server uses the `session` or `auth` route middleware, which also marks the response `private, no-store`.
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
