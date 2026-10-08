# Demo measurement

The anonymous discovery loop measures actions, not identified visitors.
A copy shows intent. It does not prove that an Agent ran a Skill.

## Events

`POST /api/events/demo` accepts only fixed event shapes.
It rejects identity fields, task text, unknown fields, and arbitrary campaign names.

An exposure means at least half the output frame entered view.
Each stage counts each demo once during that page visit.
A carousel return does not count another exposure.
Separate stages and reloads count separately.

Agent and terminal copies count only after the clipboard succeeds.
The Agent prompt includes the recorded task.
A share count means the demo link was copied, not opened or posted.

Elapsed time uses five buckets: unseen, under 10 seconds, 10 to 29 seconds,
30 to 119 seconds, and 120 seconds or more.
The clock starts at the first exposure and includes time away from the tab.
It measures time before the action, not attention.

Campaign labels are `demo-component`, `demo-page`, and `demo-motion`.
Any other query value becomes `direct`.
Links use `?campaign=<label>`. Ordinary share links omit campaign data.

## Analytics Engine layout

The binding is `SKILLD_WEB_ANALYTICS`.
The first five blob positions retain the existing meanings.

| Position | Demo meaning |
| --- | --- |
| blob1 | Surface |
| blob2 | Empty, no command grammar |
| blob3 | `demo` |
| blob4 | `owner/repo/name` |
| blob5 | Country or `XX` |
| blob6 | `exposure`, `copy`, or `share` |
| blob7 | `agent`, `terminal`, or empty |
| blob8 | Elapsed bucket, empty for exposure |
| blob9 | Campaign label |
| double1 | Zero, preserves the existing command copy total |
| double2 | One demo action |

Existing `/api/events/install` still records the run copy.
Never add its copy counts to demo copy counts. They describe the same action.
Use the Analytics Engine sample weight when summing counts.

## Seven-day comparison

After deployment, collect seven full UTC days before comparing changes.
Group exposure, copy, and share counts by surface, demo, and campaign.
Report copies per 100 exposures and link copies per 100 exposures.
These are action rates and may exceed 100 with repeat copying.

Keep the production ranking weights fixed during the comparison.
Homepage display order may vary, but each row keeps its original rank.
Record deployment times beside the aggregate export.
Change one surface per comparison, then collect another seven full days.
A local preview cannot establish conversion lift or campaign performance.

## Recorded token usage

Recording metadata is separate from anonymous demo engagement counts.
The recorder saves Codex usage from completed turns.
Input includes cached input. Total tokens equal input plus output.
The page shows input, cached input, and output when Prompt opens.
Missing usage stays absent. The page does not estimate dollar costs.

Nine existing Codex demos carry usage from their matching completed recording events.
The backfill matched each Skill ref, source commit, prompt, and model against its recording log.
