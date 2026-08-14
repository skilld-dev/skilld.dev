# skills.sh discovery crawler

The local crawler records skills.sh leaderboard observations and stages their
[GitHub](https://github.com) repositories in the existing
`discovery_candidates` queue. GitHub stays canonical for repository metadata
and skill content. skills.sh rankings do not grant repository trust or bypass
admission checks. The crawler does not capture install totals or change skill
scores.

## Setup

Apply pending migrations before importing:

```sh
pnpm db:migrations:dev
```

For production, use the existing reviewed migration command:

```sh
pnpm db:migrations:prod
```

## Run

The default command fetches Trending and All Time, then prints a read-only
summary:

```sh
pnpm crawl:skills-sh
```

Apply the observations and repository hints to local D1:

```sh
pnpm crawl:skills-sh -- --apply=local
```

Remote application is always explicit:

```sh
pnpm crawl:skills-sh -- --apply=remote
```

Limit or select views:

```sh
pnpm crawl:skills-sh -- --view=trending --limit=100
```

Review the replay-safe SQL without applying it:

```sh
pnpm crawl:skills-sh -- --emit-sql > /tmp/skills-sh-discovery.sql
```

Each applied run writes `skills_sh_crawl_runs` and
`skills_sh_discovery_observations`. A partial D1 file execution leaves the run
in `started`, making the failure visible. Re-running a saved SQL file is safe.
Observed repositories enter `discovery_candidates` for the normal admission
workflow. The crawler cannot write leaderboard eligibility or trust decisions.

The parser exits nonzero when skills.sh returns no GitHub rows, changes the
expected leaderboard shape, returns non-HTML, times out, or exceeds the size
bound. Well-known domain skills are counted and ignored because skilld only
promotes GitHub repository hints.
