# Skillgen bootstrap

<!-- eslint-disable harlanzw/ai-deslop-buzzwords -- GLOSSARY.md defines Harness as a product noun. -->

Status: open · 2026-10-07 · docs/skillgen-bootstrap-brief

**Next move:** Measure one Harness bootstrap run on GLM 5.3, then build the opt-in and Worker changes.

Done means: a maintainer turns Skillgen on for a public repository that has a published [npm](https://npmjs.com) package and no Skill.
Within 30 minutes Skillgen opens a reviewed pull request that adds the Skill and lists it in the package's `files`.
If the App holds the issues permission, it also opens one issue that lists the package bugs a review confirmed.

Today Skillgen only updates an existing Skill. `prepareTag` skips with `EXISTING_SKILL_REQUIRED`, and the account page offers only repositories with a Skill in the registry.

## Decisions

- **One Skill per npm package.** A Skill ships inside its package, so npm distributes it with the version it describes. A monorepo does not get one shared Skill.
- **The bootstrap pull request adds `skills` to the package's `files`.** Without it the Skill never reaches npm. Update runs still change only the Skill directory.
- **The Harness runs OpenCode on GLM 5.3** through OpenCode Go (`opencode-go/glm-5.3`).

## What the manual run showed

On 2026-10-07 five packages went through the bootstrap workflow by hand: direct `generate-package-skill` runs in Claude Code, an independent `review-skill` run, one repair pass, then a pull request and an issue.

| Package | Pull request | Issue | Review result | Repair |
| --- | --- | --- | --- | --- |
| `which-nuxt` 0.4.1 | harlan-zw/which-nuxt#13 | harlan-zw/which-nuxt#12 | 0 errors, 5 warnings | 10 of 11 accepted |
| `@unhead/vue` 3.4.2 | unjs/unhead#1009 | unjs/unhead#1008 | 0 errors, 5 warnings | 17 of 19 accepted |
| `retriv` 0.15.0 | skilld-dev/retriv#21 | skilld-dev/retriv#20 | 1 error, 4 warnings | 9 of 9 accepted |
| `@nuxtjs/robots` 6.2.4 | nuxt-modules/robots#339 | nuxt-modules/robots#338 | 1 error, 7 warnings | 11 of 12 accepted |
| `@nuxt/scripts` 2.0.0-beta.14 | nuxt/scripts#950 | nuxt/scripts#949 | 3 errors, 3 warnings | 14 of 14 accepted |

Observations that shape the design:

- **Every review changed the Skill.** Reviews found 5 errors and 24 warnings across five Skills. Most came from prose claims, not code blocks. A bootstrap needs the same review and repair the update path has.
- **Deterministic checks missed a broken description.** The `@unhead/vue` description held quotes and `%`. skilld-dev/skilld#217 rejects that shape and returns failed checks to the Agent in the same session.
- **Generators report false bugs too.** The retriv review measured the pgvector recall claim and replaced it. The which-nuxt review corrected a `hosting: null` claim. An issue on a third-party repository must list only findings a second run confirmed.
- **A direct run costs far more than the update budget.** The five generations used 65 to 139 tool calls and 205k to 388k tokens each, before review. The update job allows 96 model calls for generation, review, and repair together.
- **Version choice is a real input.** `@nuxt/scripts` main publishes 2.0.0 betas while npm `latest` is 1.3.12. The first run tested 1.3.12 and had to be redone.
- **Some packages need no Skill.** In a monorepo, internal packages, such as an engine used only by sibling packages, should be skipped. `generate-package-skill` now stops and reports why.
- **The Skill ships one release behind.** Skillgen runs after a tag, so the tarball for that tag carries the previous Skill.

## Ledger

- [x] **Skip tags older than the default branch.** A maintenance tag would rewrite the newer Skill. skilld-dev/skilld.dev#527.
- [x] **Resolve scoped Skill directory names.** `@nuxtjs/seo` resolves to `skills/nuxtjs-seo` as well as `skills/seo`. Same pull request.
- [x] **Return failed output checks to the Agent.** skilld-dev/skilld#217 also limits Harness output to `SKILL.md` and `references/`, 9 files and 64 KiB.
- [ ] **Run the Harness on GLM 5.3.** Add the OpenCode Go provider to the Worker gateway and set the `OPENCODE_API_KEY` secret.
- [ ] **Bootstrap budget.** Measure one Harness bootstrap run on `which-nuxt` with GLM 5.3 before choosing limits. The update limits will not fit.
- [ ] **Opt-in without a Skill.** `inspectSkillgenRepository` returns `NoSkill` today. Make a public package that npm publishes eligible, and list maintained repositories with one even when the registry holds no Skill.
- [ ] **Package choice.** Store the packages a maintainer turns on per repository. Default to the root package, or to packages that no sibling package depends on.
- [ ] **Bootstrap job.** Turning a repository on queues a job for the latest tag that matches each chosen package. It reuses the provenance checks. `currentSkill` may be empty for this job kind. The destination is `skills/NAME` beside the package's `package.json`, and the pull request adds `skills` to `files`.
- [ ] **Structured mismatches.** `skilld-harness` returns the generation's mismatches as data: expected, observed, repro, source. Review confirms or drops each one.
- [ ] **Issue publication.** Request `issues: write` for the App. File one issue per bootstrap with confirmed mismatches only. Skip quietly while an installation has not accepted the permission.
- [ ] **Copy.** `/skillgen`, `/make-skill`, and `/me?view=skillgen` say Skillgen needs an existing Skill. Update them with the opt-in change.

## Open questions

- Is "bootstrap run" the term? It would name the first Skillgen run that adds a Skill. `GLOSSARY.md` has no entry yet.
- Should a bootstrap pull request also add the README badge and tip, or only the Skill and `files`?
- Should issues wait for a maintainer to approve them on `/me?view=skillgen`, given they post to someone else's tracker?

## Log

- 2026-10-07 Manual run on five packages. Pull requests and issues are linked in the table above.
