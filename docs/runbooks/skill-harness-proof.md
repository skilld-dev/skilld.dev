# Skill generation on Cloudflare

This proof runs `skilld-harness` against an exact public npm package version.
It uses an existing Skill as the update baseline.
The result includes generated files, output checks, review findings, source attempts, and model call counts.

The proof produces a file bundle. GitHub tag handling and pull request publication follow this runtime proof.

## Deploy the proof

Dispatch the existing deployment workflow with `target=harness-proof` and the reviewed branch.
That target deploys only the separate `skilld-harness-proof` Worker and its container image.

```sh
gh workflow run deploy-cloudflare.yml --ref BRANCH --field target=harness-proof
```

Configure `ANTHROPIC_API_KEY` and `PROOF_TOKEN` as Worker secrets.
For Google, set `PROVIDER=google`, a supported model, and `GOOGLE_GENERATIVE_AI_API_KEY`.
Use a temporary proof token. Do not put either secret in a repository file or container environment.
The container receives a placeholder. Its outbound gateway adds the model credential inside the Worker.

## Run an update

Set `SKILL_HARNESS_PROOF_TOKEN` in the calling shell.
Pass the Worker URL, exact npm version, existing Skill directory, and scratch output path.

```sh
node scripts/skill-harness-proof.mjs \
  https://WORKER.workers.dev \
  nuxt-ai-ready@2.4.1 \
  ~/pkg/nuxt-ai-ready/skills/nuxt-ai-ready \
  ~/scratch/skill-harness-proof.json
```

Generation and a separate review use the same published authoring Skills as local runs.
Review receives the original Skill name and the prepared package source.
One repair attempt can address error findings. A fresh review checks the repaired output.
Remaining error findings stop the successful result. Rejected candidates remain available for inspection.
Existing deterministic checks inspect paths, file limits, and frontmatter.
They do not prove every example works. Inspect source attempts and review findings before using the bundle.

The container image includes the pinned Agent bootstrap. Each session receives its own copy.
Every job gets a fresh container. The Worker destroys it after saving the result.
Durable Object alarms check progress and enforce the fifteen minute deadline.

## Limits and failures

The proof allows one active job, 64 model calls, and 4,096 output tokens per call.
It limits each request to 512 KiB and each result to 1 MiB.
The published `skilld-harness` package does not expose token usage. Reports mark that data as `Unavailable`.
These bounds constrain usage. They do not constitute a measured dollar budget.

The outbound gateway allows HTTPS npm retrieval, GitHub source archives, and the configured model provider.
It blocks other destinations, hosted model tools, credential overrides, and model conversation reuse.
External documentation requests are blocked. Source files must carry the evidence for this proof.

If generation fails, read `state.result.detail` and `state.result.generation` in the saved result.
If the container stops, the Worker records `CONTAINER_LOST`.
If the deadline expires, it records `DEADLINE_EXCEEDED` and destroys the container.

After the proof, delete the temporary `PROOF_TOKEN` Worker secret.
The endpoint returns `PROOF_UNCONFIGURED` until a new token is configured.
