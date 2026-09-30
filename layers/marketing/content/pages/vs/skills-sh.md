---
title: 'skilld vs skills.sh: curated Agent Skills with an author'
description: Looking for a skills.sh alternative? skilld is a curated registry where every Skill has a human author and readable source. One command, every Agent.
heading: skilld vs skills.sh
label: Comparison
author: Harlan Wilton
cta:
  label: Browse curated Skills
  to: /skills
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

skills.sh is Vercel's directory of Agent Skills. It indexes a large catalogue, ranks by install count, supports 73 agents, and runs audits on listed skills. If you want breadth and a popularity signal, it does that well. skilld is smaller by design: a person admits each Skill, every listing shows its author and links the source file, and `skilld run` lets your Agent use a Skill without writing a file.

| | skills.sh | skilld |
|---|---|---|
| Who admits a Skill | Any indexed repository | A person, with a reconstructible reason |
| Ordering signal | Install count | [GitHub](https://github.com) stars, with curation first |
| Provenance shown | Repository link | Author and exact source file, one click |
| Try before install | Install | `skilld run` prints the Skill, writes nothing |
| Staying current | `update --all` syncs files | Source commit tracked; update shows what changed |
| Agents | 73 | Detected Agent target; same command for each |

Both tools install the same SKILL.md files. The difference is who decided a Skill belongs and what you know about it before you run it.
