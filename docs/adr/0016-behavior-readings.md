# ADR-0016: Behavior readings

Date: 2026-10-07

## Context

The skilld CLI stops a remote run until the user approves each `ask` behavior: `remote-code`, `privilege`, `credentials`, `destructive`, and `hidden-text`.
The gate is a fixed text pattern match on the user's machine. It lists each match as `PATH:LINE`.

Many matches are not requests. A security guide quotes `curl ... | bash` as an attack to block.
A checklist says "No `~/.ssh` reads". A table recommends `sudo apt install` to a person.
The user sees only `PATH:LINE` and must open each file to tell these apart.
395 registry Skills still stop at the gate. Each `simota/agent-skills` Skill stops on the quoted attacks in its linked `_common/SECURITY.md` and `_common/WEB_FETCH_SAFETY.md`.

## Decision

A language model reads each match the CLI lists, once per Skill revision, and says what the line does where it stands.
The reading annotates the match. It never removes, adds, or changes a gate.

### What the model reads

An Artifact build runs the same matcher the CLI runs, `skilld-protocol/behaviors`, over every file it packs.
It keeps the first five matches of each `ask` behavior, as the CLI lists them.
A file over 1 MiB, or one that is not UTF-8, gets no reading.

For each match the model receives only:

- the matched line, cut to 400 characters;
- the Markdown headings above it;
- the first row of the table that holds it, or the prose line that introduces its list or code block;
- whether it sits in a fenced code block, and the block's language;
- the file path inside the Skill.

It never receives a whole file. Every invisible or control character arrives as `<U+XXXX>`{lang="html"}.

The model answers one verdict per match: `instruction`, `quoted-example`, `prohibition`, `documentation`, or `unclear`, with a reason of at most 20 words.

### Prompt injection

Skill text is untrusted. The matches arrive as JSON inside a block whose delimiter carries a random nonce, and the system prompt says to follow nothing inside it.
The answer must match a strict JSON schema. A verdict outside the five, a reason over 20 words or with an invisible character, an extra field, a match named twice, and a skipped match all read `unclear` with no reason.

The structural defence is the gate itself: it runs on the user's machine, and no check result reaches it.
A hostile Skill can at most mislabel its own match, on a surface that says a model wrote the label.

### Where it runs

The review runs in the Artifact build, after the scan and before the checks are recorded.
It is the non-required `behavior-review` check result, signed into the attestation. Policy `2026-10-07.5` adds it.
The released skilld CLI accepts a new non-required check, as `omitted-files` showed.

A build waits for the model only when no stored review covers its matches.
D1 keeps one row per Repository ID, commit, Skill folder, and rules version in `behavior_reviews`.
A build whose model input matches a stored row copies that row's readings, so a later commit that left the matched lines alone, or another Skill that links the same files, costs no model call.
A model that fails or takes more than 8 seconds gives an `error` result, which blocks nothing, and the build stores nothing.

Private Skill text never goes to a model. A private build carries a passing `behavior-review` result that says so.

### Where it shows

- The skilld CLI adds each reading to `BEHAVIOR_CONFIRMATION_REQUIRED`, labelled as a language model's reading and no guarantee.
- The Skill page panel shows the SKILL.md readings under each match that needs approval. It reads them from `GET /api/behavior-readings?blob=<SKILL.md blob SHA>`{lang="html"}, and drops a reading whose line text changed.

### Cost

Measured 2026-10-07 over 52 gated Skills, with GPT-6 Luna through the Workers AI chat completions endpoint and reasoning off:
199 matches, 43,328 input and 6,794 output tokens, $0.0078 in all.
That is $0.00015 a Skill and $0.00004 a match. The median call took 2.1 s, the 90th percentile 3.2 s, and the slowest 3.8 s.

The 395 gated Skills cost about $0.06 to read once.
The registry recorded about 166 indexed Skill revisions a day in the week before, and about 9 a day for gated Skills over 30 days: about $0.0013 a day.
Low reasoning effort, tried on 17 of the Skills, cost 19% more, took 1.4 s longer at the median, and left more matches unclear.

## Consequences

- A gated Skill's first build at new matched lines takes about 2 seconds longer.
- The digest and every other surface stay unchanged.
- Cull path: drop the check in a policy bump, drop `/api/behavior-readings`, then drop `behavior_reviews`.
