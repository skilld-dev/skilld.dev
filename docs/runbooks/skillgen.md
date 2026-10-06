# Skillgen GitHub App

<!-- eslint-disable harlanzw/ai-deslop-buzzwords -- GLOSSARY.md defines Harness as a product noun. -->

Skillgen is the `skilld-skillgen` GitHub App.
It maintains an existing package skill through draft pull requests.
It accepts every public repository that installs it.
Maintainers set it up from [/skillgen](https://skilld.dev/skillgen).

## Register the App

Run the local registration helper with the Worker origin and a private scratch directory.

```sh
pnpm exec tsx scripts/skill-github-app-register.ts \
  https://skilld-harness-proof.harlanzw.workers.dev \
  ~/scratch/skilld-github-app
```

Open the printed local URL in your personal GitHub browser.
The helper creates a public App owned by `skilld-dev`.
Use a GitHub account allowed to register Apps for that organization.
Other accounts can install the App on selected repositories.
It saves the converted App secrets with mode `600`.
It converts the signing key to PKCS8 before saving it.
It rejects a callback with invalid state or a missing registration cookie.

The App requests Contents write and Pull requests write.
It requests no Actions, administration, or issues permission.

Configure the saved JSON with `wrangler secret bulk` in `workers/skill-harness`.
Pass the file through stdin. Never print its contents.
Also configure the model credential and `PROOF_TOKEN` described in the [Harness runbook](./skill-harness-proof.md).
Deploy through the existing Actions workflow with `target=harness-proof`.

Use the saved installation URL. Select only the package repository.
Installation starts a job for its latest tag.
New tag creation starts another job automatically.

## Source and publication checks

Each job reads the root `package.json` from the exact tag commit.
The tag must equal its package version, with an optional `v` prefix.
If the package publication follows the tag, the job waits for it.
The whole job has a thirty minute deadline.

The job matches npm's `gitHead`, or npm's HTTPS provenance record, to that commit.
The provenance match checks the package digest, repository, tag, and source commit.
It does not independently verify Sigstore signatures.

The baseline comes from an exact default branch commit.
Supported locations are `skills/<package-name>/SKILL.md` and the root `SKILL.md`.
The baseline can include Markdown files under `references/`.
It must fit the Harness limits and the App's 64 KiB baseline limit.

The App mints a single-repository installation token for each GitHub phase.
The container receives no GitHub or model credential.
Generation and review use the bounded Harness job.
Review must accept the result before publication.

The App checks the default branch again before writing.
If the branch moved, publication stops.
Changes affect only the Skill directory.
An existing pull request is reused, including a closed pull request.
An existing branch without a pull request stops publication.
The App never replaces a branch that someone could have edited.

## Inspect a job

The webhook response includes job IDs.
Read `/github/jobs/<id>` with `Authorization: Bearer <PROOF_TOKEN>`.
The response includes the phase or final outcome.
Read `/proofs/<id>` with the same token for the Harness result.

If a job failed, POST `/github/jobs/<id>/retry` with the same operator token.
Retry waits until the previous Harness job finishes.
It creates a new job and preserves the failed job.
Repeated retry requests reuse the new job.

Duplicate deliveries reuse a job.
Different tags resolving to the same commit reuse the recorded target.
Generation failures persist as job outcomes. They produce no pull request.

The App has one global queue and one active container.
Jobs run one at a time, and the thirty minute deadline includes time in the queue.
If 64 jobs are queued, the webhook answers 503. GitHub does not redeliver it.
Organization keys and optional shared capacity require separate onboarding and budgets.
