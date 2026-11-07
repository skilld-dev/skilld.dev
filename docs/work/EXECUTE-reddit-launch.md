# Reddit launch

Status: open · 2026-10-07 · docs/reddit-launch-brief

**Next move:** On 14 Oct 2026, read the score, comments, and mod actions on the r/ClaudeCode and r/ClaudeAI posts. Then answer every demo request in their comments.

Done means: every subreddit in the ledger has one post or a recorded reason to skip it.
Every demo request from those threads has a recorded demo or a reply that says why not.

## Decisions

- **Each subreddit gets its own title and body.** Reddit filters identical posts across subreddits, and r/cursor removes "excessive posting of similar content".
- **A title leads with the result, not the brand.** In the month before launch, the top skill posts named what the skill made. A brand in the title reads as an ad.
- **Post to two or three subreddits a day at most.** The same r/cursor rule applies, and each post needs replies in its first hours.
- **Harlan writes and posts every post in his own voice.** r/opensource, r/cursor, r/mcp, and r/vibecoding remove AI-generated posts.
- **Skip four subreddits.** r/vibecoding needs tool approval through its X community first. r/commandline bans generative AI projects. r/Anthropic bans self-promotion. r/webdev allows project posts on Showoff Saturday only.

## Ledger

The order is the posting order. Each row names the rule that decides whether the post stays up.

| # | Subreddit | Angle | Flair | Rule that matters |
| --- | --- | --- | --- | --- |
| 1 | r/ClaudeCode | Headless Claude Code records what each skill makes | Built with Claude | A standalone post says what you built, how Claude Code helped, and what you learned. The feed needs OP karma above 50 |
| 2 | r/ClaudeAI | Demos recorded with Opus 5.5 | Built with Claude | Built with Claude by the author, says how Claude helped, free to try, minimal promotional language |
| 3 | r/codex | Running a skill in Codex | Showcase | The post must relate to Codex |
| 4 | r/cursor | The sourced skills.sh comparison | Showcase | Claims about competitors must be accurate and verifiable |
| 5 | r/mcp | The MCP server first | showcase | Self-promotion needs disclosure |
| 6 | r/AgentSkills | Submit your skill for a demo | Showcase | No low-effort link drops |
| 7 | r/SideProject | Submit your skill for a demo | none | No written rules |
| 8 | r/ChatGPTCoding, r/AI_Agents | A short entry | n/a | Tool posts go in each weekly self-promotion thread |
| 9 | r/coolgithubprojects, r/opensource, r/opencodeCLI | The open-source repositories | Promotional on r/opensource | r/coolgithubprojects takes link posts only. r/opensource requires an OSI license |

## Next week, 12 to 16 Oct 2026

1. **Measure.** Read each post's score, comments, and removal state. Read Reddit referrals in Cloudflare Web Analytics, which the RUM beacon feeds.
2. **Answer.** Record the demos that commenters ask for after the weekly token limit resets. The drafts promised this.
3. **Compare against plain Opus 5.5.** The drafts say some skills did no better than the model alone, and one draft promised benchmarks. Decide how a demo records a run without the skill before anyone publishes a figure.
4. **Post rows 3 to 8,** at most three subreddits a day.
5. **Consider a top 10 trending skills post** for r/cursor and r/AgentSkills. In September 2026, "Top 10 Cursor Skill Repos" got 261 upvotes and "Top 10 Agent Skill Repos" got 204.

## Evidence

- 2026-10-07: Harlan posted to r/ClaudeCode and r/ClaudeAI. The drafts linked `/skills/demos` and the threejs-interaction demo. They said that some skills did no better than plain Opus 5.5. They promised more demos when the weekly token limit resets.
- 2026-10-07: r/ClaudeCode AutoModerator requires post flair. Its reply to a showcase post says the feed needs OP karma above 50, and other qualifying posts go to the megathread.
- 2026-10-07: Subreddit rules, flairs, member counts, and the month's top posts came from Reddit's JSON endpoints. The r/ClaudeCode post "designmd.sh, a public registry for DESIGN.md files for coding agents" had 323 upvotes. Three skill posts that showed their output had 189 to 682 upvotes.
- 2026-10-07: A year-long Reddit search for "skills.sh" found no post that pitched an alternative to it.
- 2026-10-07: About 11 of the 24 demoed skills matched rows on the live trending board.
