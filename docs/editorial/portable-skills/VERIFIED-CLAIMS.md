# Verified claims

| ID | Status | Evidence kind | Claim and scope | Supporting source | Checked |
| --- | --- | --- | --- | --- | --- |
| P01 | Documented | Official documentation | SKILL.md requires name and description. Name matches the directory. Description is non-empty and at most 1024 characters. | https://agentskills.io/specification | 2026-10-05 |
| P02 | Documented | Official documentation | Claude Code discovers .claude/skills and adds invocation and dynamic-context features. | https://code.claude.com/docs/en/skills | 2026-10-05 |
| P03 | Documented | Official documentation | Codex discovers .agents/skills and follows symlinked Skill folders. | https://learn.chatgpt.com/docs/build-skills | 2026-10-05 |
| P04 | Documented | Official documentation | Gemini CLI discovers .gemini/skills and .agents/skills. The alias takes precedence within a tier. Consent precedes injection of the full Skill body. | https://geminicli.com/docs/cli/skills/ | 2026-10-05 |
| P05 | Documented | Official documentation | allowed-tools is experimental and implementation support varies. | https://agentskills.io/specification | 2026-10-05 |
| P06 | Observed | Live provider estimate | how to create claude skills: 390 monthly searches, KD 30, US 2840. | research.json, NuxtSEO 0.5.3 | 2026-10-05 |
| P07 | Observed | Implementation inspection | skilld maintains generate-project-skill and generate-package-skill. Direct runs do not establish cross-Agent task completion. | skilld/skills/*/SKILL.md | 2026-10-05 |
| P08 | Unresolved | Partial live observation | The example selects and completes in all three Agents. Codex passed four local checks. Claude discovered it but execution hit its weekly limit. Gemini failed before execution. | REPLAY.md. These observations do not establish a three-Agent pass. | 2026-10-05 |

P08 limits the article: prescribe checks; never claim a completed cross-Agent trial.
