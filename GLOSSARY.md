# Glossary

Canonical vocabulary for skilld.dev. Every user-visible string, public API name, doc heading, and route segment uses these terms and no synonyms.

Shared terms match the skilld CLI glossary (`skilld-dev/skilld/GLOSSARY.md`). That file wins for CLI commands, protocol types, and source status values. This file owns what a concept is called. [`COPY.md`](COPY.md) owns how a sentence says it, including the register per context and the banned language. The URL canonicals these terms resolve to, and the layer that owns each one, live in [`docs/arch/README.md`](docs/arch/README.md).

## Map

| Term | Owner | Relation | Customer word |
| --- | --- | --- | --- |
| Skill | GitHub Repository, `layers/registry` | Repository 1—N Skill | "skill" |
| Agent | the user's tool | Agent 1—N Agent target | "your agent" |
| Repository | GitHub | Repository 1—N Skill | "repository" |
| Artifact | skilld.dev API | Skill commit 1—1 Artifact | not shown |
| source status | lockfile, skilld.dev API | Artifact 1—1 source status | "Verified", "Unverified", "Local" |
| run | skilld CLI | Skill 1—1 run command | "run" |
| install | skilld CLI | Skill 1—1 install command | "install" |
| fork | Agent, Skill page | Skill 1—N local copy | "fork" |
| lockfile | skilld CLI | project 1—1 lockfile | "lockfile" |
| curator | `layers/collections`, `/@login` | curator 1—N collection | "curator" |
| collection | `layers/collections`, `/@login/slug` | collection N—N Skill | "collection" |
| watch | `layers/identity` | account N—N Repository or collection | "watch" |
| digest | `layers/identity` email | account 1—1 digest schedule | "digest" |
| track | `/skills/<slug>`, `layers/registry` | track 1—N Skill | "track" |
| comparison | `/compare/<slug>`, `layers/marketing` | comparison N—N Skill | "comparison" |
| trending | `/skills/trending`, ADR-0004 | Repository 1—N social mention | "trending" |
| registry | skilld.dev | one | "skilld" |
| skilld token | `cli_tokens`, `layers/identity` | Author 1—N token | "skilld token" |
| provenance | Skill detail, cards | Skill 1—1 author and source link | "written by", "source" |

Collisions

- "Verified" names a source status only. Never a safety claim, never a sync time.
- "curator" and "author" both surface on profile pages. A curator assembles collections. An author writes a Skill.

## Terms

### Skill

**Is:** a directory with a `SKILL.md` that follows the Agent Skills specification, written by a maintainer in their own Repository.

**Never:** prompt, plugin, extension, module, guide.

**Casing:** `Skill` in new product prose. Existing UI uses lowercase `skill`; see Open questions.

### Agent

**Is:** the coding tool that reads Skills: Claude Code, Codex, Cursor, Gemini CLI, and the rest of the CLI's targets.

**Never:** client, tool, editor, IDE.

**Casing:** `Agent` in prose, "your agent" in UI.

### Repository

**Is:** a GitHub repository that contains one or more Skills. The source of truth.

**Never:** package host, registry entry. `repo` stays in identifiers and existing UI labels.

### Artifact

**Is:** immutable Skill bytes resolved from one exact source commit, delivered by the skilld.dev API to the skilld CLI.

**Never:** hosted Skill, registry package, upload.

### source status

**Is:** the recorded provenance state for an installed Skill: `verified`, `local`, or `unverified`.

**Use for:** the receipts panel and lockfile values. "Verified" means the Artifact attestation checked out.

**Never:** safety state, trust score, "verified safe", a sync timestamp.

### run

**Is:** `skilld run`. The Agent reads the Skill for the current session and nothing lands on disk. The default command on every Skill surface.

**Marketing phrase:** "run once off", in pitch copy such as "No more skill bloat: run once off, fork, or install". It names the same path. UI labels and commands keep "run".

**Never:** try, preview, use once, ephemeral.

### install

**Is:** `skilld install`. Skill files land in the project and the lockfile records them. The opt-in second step.

**Never:** add, download.

### fork

**Is:** copying a Skill at one source commit into editable local files, with author credit and licence preserved.

**Use for:** an Agent request followed by a local Skill install. Upstream updates do not replace the local copy.

**Never:** run, remote install, GitHub repository fork unless explicitly requested.

**Casing:** `fork` in prose. It is an Agent workflow, not a CLI command.

### lockfile

**Is:** the file the skilld CLI writes to record installed Skills, their commits, and source status.

**Never:** manifest, registry file.

### curator

**Is:** a developer who assembles one or more collections. Identity is their GitHub login at `/@login`.

**Use for:** collection pages, the `/community` directory, "Browse curators".

**Never:** creator, publisher (for a person), "the Community" as a proper noun.

### track

**Is:** a page of Skills for one kind of work, at `/skills/<slug>`. A person writes its label, its second-person line and its pinned Skills; a classifier category fills in the depth beneath them.

**Never:** cluster, category, outcome, topic, use case (in UI). `CLUSTERS` and `abstractness_category` are the internal names and stay in the code.

**Collides with:** collection. A track is ours, permanent, and one per kind of work. A collection belongs to a curator, at `/@login/slug`, and any number can exist.

### collection

**Is:** a curated set of Skills assembled by a curator, with a reason per Skill, at `/@login/slug`.

**Never:** preset, pack, bundle, kit, stack (in UI).

### comparison

**Is:** an editorial article comparing Skills for one concrete task, at `/compare/<slug>`.

**Use for:** dated, source-backed tradeoffs and conditional recommendations.

**Never:** versus page, alternatives page (as pillar names), ranking, benchmark (without measured output evidence).

**Collides with:** track and collection. A comparison explains a choice; a track lists Skills; a collection belongs to a curator.

### watch

**Is:** subscribing to a Repository or collection so the digest reports its changes. The Loop 2 verb.

**Never:** follow, star, subscribe, sync.

### digest

**Is:** the monthly email that summarises changes to watched Repositories. The user can turn it off.

**Never:** newsletter, notification, alert. "the weekly" is the separate opt-out email.

### trending

**Is:** Skills ranked by devs talking about them on X and Bluesky (ADR-0004). Never by installs.

**Never:** popular, hot, top, leaderboard.

### registry

**Is:** skilld.dev, the curated index of Skills and the discovery MCP server.

**Never:** marketplace, store, hub, catalog (in UI).

### skilld token

**Is:** a credential for account operations, used by the skilld CLI or a script.
Created through sign-in or the token form. Public operations need no token.

**Never:** CLI token, API token, API key (for this credential).
Existing route paths, table names, and protocol fields keep their identifiers.

**Casing:** lowercase in prose.

### provenance

**Is:** who wrote a Skill and the exact `SKILL.md` in their Repository. The quality signal.

**Use for:** "written by {user}" on user pages, "published by {org}" on organization pages, source links.

**Never:** trust score, verification tier, "curated by" for an author.

### Owner

**Is:** the GitHub organization or user that hosts Skill Repositories. A proxied entity, never a row skilld.dev owns. Lives at `/gh/[owner]`.

**Never:** author (that is skilld's own namespace), org (bare), account, publisher.

**Casing:** `Owner` in prose, `owner` in identifiers and route segments.

### Author

**Is:** a person with a GitHub login who publishes collections on skilld.dev. Native to this site, backed by D1, identity from GitHub OAuth. Lives at `/@<github-login>`.

**Use for:** the entity behind a collection. `curator` is the customer word for the same person when the sentence is about the collections they built.

**Never:** user, creator, publisher, profile.

**Casing:** `Author` in prose, `author` in identifiers.

### Harness

**Is:** the `@skilld/harness` package that runs skilld-maintained Skills with strict output checks.

**Never:** runner, executor, sandbox.

### skilld-maintained Skill

**Is:** a Skill the skilld project maintains for generation, review, search, or install guidance.

**Use for:** those Skills only. It is not a registry admission and confers nothing on a third-party Skill.

**Never:** official Skill, first-party Skill, verified Skill (`verified` is a source status).

### Artifact attestation

**Is:** a signed claim linking an Artifact to its Repository, commit, contents, and check results.

**Never:** signature (bare), certificate, receipt.

### check result

**Is:** one named check, its version, its finding, and its outcome for one Artifact.

**Never:** test result, scan, audit.

### package skill

**Is:** a Skill tied to one npm package, drafted with the skilld-maintained `generate-package-skill` Skill and owned, edited, and published by its maintainer in their own Repository.

**Never:** platform-authored. The platform publishes no Skills; `VISION.md` anti-scope 1 fixes that.

**Casing:** lowercase in prose and UI.

### guide skill

**Is:** a curation tag for a Skill not tied to a package. Distributed as a git Skill, tagged for filtering in browse views.

**Never:** tutorial, article, doc.

**Casing:** lowercase in prose and UI.

### project install

**Is:** installing into the current repository. The default.

**Use for:** the UI label `Project`.

**Never:** local.

### global install

**Is:** installing into the Agent's home directory, so every project sees the Skill.

**Use for:** the UI label `Global`. "Teach your agent skilld" is the promo label for `npx skilld install skilld --global`, which installs the skilld Skill globally. "Teach" appears only in that label and never replaces "install".

**Never:** system-wide.

### weekly

**Is:** the one email everyone gets: Skills you liked that changed, plus what trended. Opt-out, on by default.

**Use for:** "the weekly", lowercase. It sits beside **digest**, which is the separate watched-Repository email. They are not the same send.

**Never:** newsletter, roundup, trending digest.

## Naming new things

- Name a feature descriptively, not cleverly. "Stack selector", never "StackMatch".
- No trademark-style capitalisation for a feature. Never "Smart Collections".
- A CLI command is lowercase: `skilld run`, `skilld install`, `skilld update`.

## Banned

| Never | Use instead | Why |
| --- | --- | --- |
| follow | watch | One Loop 2 verb |
| sync (user-facing) | import (stars), "Checked GitHub {ago}" (freshness) | Internal jargon; say what happened |
| use once, try, preview | run ("run once off" in pitch copy) | One name for the transient path |
| add (CLI verb) | run or install | v2 grammar |
| popular, install count | starred, stars | Installs never rank or trust |
| verified safe, secure, scanned | name the exact check | An attestation cannot guarantee safety |
| people (audience) | devs | Brand guidelines |
| Community (proper noun) | curators, `/community` route | Unglossed; the route stays |
| named, naming (user copy) | talked about, mentioned | Internal word for the social route |
| AI-powered | (cut) | skilld is not an AI product |

## Open questions

Naming calls this file does not settle. Resolve one, fold the answer in, delete the entry.

1. **`Skill` or `skill` in site UI?**
   The CLI glossary and new v3 copy use `Skill`. Most existing site UI, COPY.md, and meta descriptions use lowercase `skill`.
   - Recase the site to `Skill`, one sweep, touches hundreds of strings.
   - Keep lowercase on the site, record the split as deliberate.
2. **`repo` or `repository` in site UI?**
   The CLI glossary bans `repo`. The site uses `repo` in labels, props, and routes (`/gh/owner/repo`).
   - Ban in new prose only, keep identifiers and routes.
