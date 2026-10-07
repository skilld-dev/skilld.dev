# Skill generation on Cloudflare

This proof runs `skilld-harness` against an exact public [npm](https://npmjs.com) package version.
It uses an existing Skill as the update baseline.
The result includes generated files, output checks, review findings, source attempts, and model call counts.

The proof produces a file bundle. [GitHub](https://github.com) tag handling and pull request publication follow this runtime proof.

## Deploy the proof

A merge to main deploys the `skilld-harness-proof` Worker and its container image after the site deploy.
It deploys only when the merge changed `workers/skill-harness/`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, or the deploy workflow.
A new version restarts containers, so an unchanged merge keeps the running version.

To deploy a branch by hand, dispatch the workflow with `target=harness-proof`.

```sh
gh workflow run deploy-cloudflare.yml --ref BRANCH --field target=harness-proof
```

By default, OpenCode runs GLM 5.3 through OpenCode Go: `PROVIDER=opencode-go` and `MODEL=glm-5.3`.
Configure `OPENCODE_API_KEY` and `PROOF_TOKEN` as Worker secrets.
For Anthropic, set `PROVIDER=anthropic`, a supported model, and `ANTHROPIC_API_KEY`.
For Google, set `PROVIDER=google`, a supported model, and `GOOGLE_GENERATIVE_AI_API_KEY`.
Use a temporary proof token. Do not put either secret in a repository file or container environment.
The container receives a placeholder. Its outbound gateway adds the model credential inside the Worker.

The runner disables model list fetches. The model must exist in the model snapshot of the pinned OpenCode.
After a bootstrap update, run `OPENCODE_DISABLE_MODELS_FETCH=true opencode models opencode-go` with that OpenCode version.
If the model is missing, declare it in `openCodeConfig` in `runner/run.mjs`.

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

The proof allows one active job and 96 model calls.
Generation targets 35 turns. Independent review targets 20 turns.
These turn targets guide the model. The gateway enforces the total call limit.
OpenCode Go calls allow 8,192 output tokens. The gateway caps `max_tokens` and `max_completion_tokens`.
Anthropic calls allow 8,192 output tokens, including a 2,048-token thinking budget.
Google calls allow 4,096 output tokens.
It limits each request to 512 KiB and each result to 1 MiB.
The runner uses `skilld-harness@3.3.0` and returns its usage reports.
Reports sum generation, repair, and review attempts separately.
If a token count is missing, the total stays unknown.
Failed runs retain bounded tool traces and any earlier valid candidate.
These candidates never pass publication without an accepted review.
These bounds constrain usage. They do not constitute a measured dollar budget.

The outbound gateway allows HTTPS npm retrieval, GitHub source archives, and the configured model provider.
It blocks other destinations, hosted model tools, credential overrides, and model conversation reuse.
For OpenCode Go, only chat completions pass. Every tool must have the `function` type.
The gateway removes extra choices and service tier requests, because both raise the price.
It forwards the `x-opencode-*` session headers, because OpenCode Go rejects a request without `x-opencode-session`.
External documentation requests are blocked. Source files must carry the evidence for this proof.

If generation fails, read `state.result.detail` and `state.result.generation` in the saved result.
If the container stops, the Worker records `CONTAINER_LOST`.
If the deadline expires, it records `DEADLINE_EXCEEDED` and destroys the container.

After the proof, delete the temporary `PROOF_TOKEN` Worker secret.
The endpoint returns `PROOF_UNCONFIGURED` until a new token is configured.
