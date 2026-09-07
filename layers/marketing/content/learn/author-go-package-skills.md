---
title: Author a Skill for your Go module
description: Draft a Skill for your module, keep its files inside the module, and publish with the correct version tag.
relatedPages:
  - path: /make-skill
    title: Choose another package ecosystem
  - path: /skills
    title: Browse skills
createdAt: 2026-09-07
updatedAt: 2026-09-07
---

## 1. Draft your Skill

::package-skill-setup{ecosystem="go"}
::

Point your agent at the directory containing the module's `go.mod`.
Use its full module path, including a major version suffix when present.
Ask it to save the draft in `skills/your-skill/SKILL.md`, inside that module directory.

Cover public packages, context handling, errors, concurrency constraints, and supported Go versions.
Use complete import paths in examples.

## 2. Review the draft

Run the examples against the module version you plan to release.
Check that they import public packages and handle returned errors.
Describe required setup and cleanup for resources.
Remove generic Go advice and review the draft before committing it.

## 3. Keep the Skill inside the module

Commit `skills/your-skill/SKILL.md` and its linked local files inside the module directory.
For a repository with several modules, keep each Skill with its own `go.mod`.

Go module archives exclude nested modules and vendor directories.
Avoid placing the Skill behind another `go.mod` or linking to files outside the module.
See the [Go module archive rules](https://go.dev/ref/mod#zip-files).

## 4. Publish and share

Use your normal module release process.
Check the version tag against the module path before publishing.
For modules in repository subdirectories, the tag includes the subdirectory prefix.
Major versions from v2 normally require a matching module path suffix.
The [Go module publishing guide](https://go.dev/doc/modules/publishing) covers these cases.

After release, download that exact version for inspection:

```bash
go mod download -json example.com/your-org/your-module@v1.2.3
```

Replace the example module path and version with your release.
Inspect the directory shown in `Dir` for the Skill and its references.
See the [go mod download reference](https://go.dev/ref/mod#go-mod-download).

Link to the Skill's repository directory from your README.
Adding a Go module dependency does not automatically install the Skill into an agent.
Review the Skill when your public API or version requirements change.
