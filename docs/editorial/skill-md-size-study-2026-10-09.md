# Skill size study evidence

The study answers how Skill descriptions, bodies, and reference inventories differ across a frozen registry sample.
Harlan requested original research using the Unhead research articles as the editorial reference.

## Reproduction

The source measurements are committed under `public/research/skill-md-size-2026-10-09/`.
Run `pnpm exec tsx scripts/research/build-size-study.ts` to rebuild `summary.json`.
The provenance manifest records the original export hash, measurement hash, tokenizer, and rubric version.

Migration 0151 stores the same summary and provenance in D1.
The existing source-version description and body observations remain in `skill_generated`.
The research snapshot has no foreign key to live Skills. Source deletion must not erase published evidence.
Publish corrections with an explicit snapshot revision. Do not silently replace historical measurements.

## Claim checks

| Claim | Evidence |
| --- | --- |
| 12,141 filtered Skills, 2,297 repositories | Included rows and distinct repository identities |
| 12,138 matched bodies, three missing | Nonnull body token measurements |
| 8.9% reach 5,000 tokens | 1,078 / 12,138 |
| Repository weighting raises that to 10.8% | Mean of per-repository proportions, 2,296 measured repositories |
| Mean description rises from 345 to 383 characters | Skill mean versus mean of repository means |
| 11,760 normalised descriptions | Trim and collapse whitespace before SHA-256 |
| 11,764 exact descriptions | Hash exact description text before normalisation |
| File duplicates leave the tail near 8.9% | 1,061 / 11,983 measured unique raw files |
| Reference mean is 2.27, median zero | 12,091 complete inventories, nulls excluded |

Exact text uniqueness and whitespace-normalised uniqueness use different definitions.
Neither means the source bodies are distinct.
Body counts exclude frontmatter. Whole-file kB includes frontmatter.
All percentiles use nearest rank.

## Interpretation limits

The corpus is neither a random sample nor a top-installed leaderboard sample.
Existing aggregator flags predate the study. Their exclusion does not establish independent mirror detection.
Models see different tokens. o200k_base estimates cannot reproduce every Agent's catalogue truncation.
Jev scores have no independent human calibration. The article labels the semantic section exploratory.
No actual Agent selection, task completion, or corpus-wide skills-ref validation claim appears.
The public row dataset omits source instructions and descriptions. Pinned commits and paths identify those sources.
Word frequencies require the source descriptions, the published stop list, and the stated token rule to reproduce.

## Search and admission

NuxtSEO Pro queries on 9 October 2026 measured the US `skill md` seed at 720 searches/month, KD 28.
Specific size and description-length seeds returned no provider data. This is not measured zero demand.
The owner explicitly approved original research as an authority surface, independent of keyword volume.
The admission record names that purpose and the 11 November gate in `page-admissions.ts`.
Review relevant impressions, citations, dataset use, and authoring-guide clicks separately.

## Primary guidance

- [Agent Skills specification](https://agentskills.io/specification): description cap, progressive disclosure, body guidance, and format validation.
- [Claude authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): concise instructions and real-usage tests.
- `scripts/lib/description-review.ts`: exact Jev questions, model version, and thresholds.
