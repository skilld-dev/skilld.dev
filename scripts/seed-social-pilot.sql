-- Seed: 242 skill_social_posts rows from 45 sources
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/tdd', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/git-guardrails-claude-code', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/design-an-interface', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/request-refactor-plan', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/setup-pre-commit', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/edit-article', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/migrate-to-shoehorn', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/prd-to-plan', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-prd', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/', '1sw6rss',
  'According_Brief_9970', NULL, NULL,
  'community', 'approved', '\-----

\*\*TL;DR:\*\* Maxed out Claude with skills, including Superpowers. Got slow and incoherent. Deleted most of them. Found mattpocock/skills, which models the opposite philosophy — small, sharp, well-named primitives. Less surface area, more leverage. My setup is faster and I actually understand it again.

\-----

For the past few months I’ve been deep in agent-building — multi-tenant SaaS, agent gateways, the whole circus. And like everyone else in this sub, I went through the “load Claude up with every skill imaginable” phase.

Superpowers. A custom skill for every workflow. Skills that called other skills. Skills that loaded MCP servers that loaded more tools. Methodologies stacked on methodologies. It felt productive — \*look at all this capability\* — and for a few weeks it kind of was.

Then somewhere around skill #30, I realized I’d built a system I didn’t actually want to use.

Every interaction was slow. Not just latency-slow — \*\*cognitively\*\* slow. Claude would start a task by checking 12 things before doing anything. I’d ask a simple question and watch a four-step “let me consult my methodology” preamble unspool before any real thinking happened. Worse: I’d lost track of what was even loaded. When something went sideways, I had no idea which skill was responsible. The system became opaque to me — the guy who built it.

So I started deleting.

First the ones I obviously wasn’t using. Then the “might be useful someday” ones. Then the ones I’d convinced myself were essential but, honestly, were just adding ceremony around things I already knew how to do. The “best practices” skills. The “always do X before Y” skills. The skills that were really just one prompt I could’ve written inline.

Halfway through the purge I stumbled into \[mattpocock/skills\](https://github.com/mattpocock/skills) on GitHub. Most skills repos are kitchen sinks — 40 markdown files, elaborate orchestration diagrams, “agentic workflows.” This one’s different. Tight. Each skill is small. The vocabulary is deliberately narrow.

The thing that hit me hardest was a file called \`LANGUAGE.md\` inside \`improve-codebase-architecture\`. It’s not instructions. It’s just… \*\*vocabulary\*\*. A handful of words — \*module, interface, depth, seam, adapter\* — defined precisely, with an explicit warning at the top: don’t substitute synonyms. Consistency is the whole point.

That was the moment something clicked.

My heavy setup didn’t feel bad because the skills were \*wrong\*. It felt bad because I’d confused \*\*surface area\*\* with \*\*leverage\*\*. I kept adding more, when what I actually needed was fewer, deeper primitives. A small set of concepts I could compose — instead of a large set of pre-baked workflows that fought each other for context budget.

Pocock’s LANGUAGE.md even names this directly. A \*deep\* module is one where a small interface unlocks a lot of behavior. A \*shallow\* one has an interface nearly as complex as its implementation. Most of my skills were shallow. They wrapped things I could’ve just… said.

I’m now down to 5–6 active skills. Claude is faster. More importantly, \*\*I’m\*\* faster — I know what’s loaded, I know what each piece does, I can predict the behavior. The agent feels like a tool again, not a Rube Goldberg machine I’m a hostage to.

If you’re feeling that same drag — the “why is every response now a 400-token preamble” feeling — I’d seriously suggest the same exercise. Delete aggressively. Keep only what survives a week of real use.

And go read mattpocock/skills. Not necessarily to install all of it. To see what restraint looks like.', 'I deleted most of my Claude skills last week. Here’s what I actually learned.', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 0,
  1777208021, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/brainstorming', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ojuqhm/10_claude_skills_that_actually_changed_how_i_work/', '1ojuqhm',
  'geekeek123', NULL, NULL,
  'community', 'approved', 'Okay so Skills dropped last month and I''ve been testing them nonstop. Some are genuinely useful, others are kinda whatever. Here''s what I actually use:

**1. Rube MCP Connector** \- This one''s wild. Connect Claude to like 500 apps (Slack, GitHub, Notion, etc) through ONE server instead of setting up auth for each one separately. Saves so much time if you''re doing automation stuff.

**2. Superpowers** \- obra''s dev toolkit. Has /brainstorm, /write-plan, /execute-plan commands that basically turn Claude into a proper dev workflow instead of just a chatbot. Game changer if you''re coding seriously.

**3. Document Suite** \- Official one. Makes Claude actually good at Word/Excel/PowerPoint/PDF. Not just reading them but ACTUALLY creating proper docs with formatting, formulas, all that. Built-in for Pro users.

**4. Theme Factory** \- Upload your brand guidelines once, every artifact Claude makes follows your colors/fonts automatically. Marketing teams will love this.

**5. Algorithmic Art** \- p5.js generative art but you just describe it. "Blue-purple gradient flow field, 5000 particles, seed 42" and boom, reproducible artwork. Creative coders eating good.

**6. Slack GIF Creator** \- Custom animated GIFs optimized for Slack. Instead of searching Giphy, just tell Claude what you want. Weirdly fun.

**7. Webapp Testing** \- Playwright automation. Tell Claude "test the login flow" and it writes + runs the tests. QA engineers this is for you.

**8. MCP Builder** \- Generates MCP server boilerplate. If you''re building custom integrations, this cuts setup time by like 80%.

**9. Brand Guidelines** \- Similar to Theme Factory but handles multiple brands. Switch between them easily.

**10. Systematic Debugging** \- Makes Claude debug like a senior dev. Root cause → hypotheses → fixes → documentation. No more random stabbing.

**Quick thoughts:**

* Skills are just markdown files with YAML metadata (super easy to make your own)
* Work across [Claude.ai](http://Claude.ai), Claude Code, and API
* Community ones on GitHub are hit or miss, use at your own risk

The Rube connector and Superpowers are my daily drivers now. Document Suite is clutch when clients send weird file formats.

Anyone else trying these? What am I missing?

**Resources:**

* [Claude Skills repo](https://github.com/ComposioHQ/awesome-claude-skills)
* [Superpowers](https://github.com/obra/superpowers)
* [Composio](https://github.com/composiohq/skills)', '10 Claude Skills that actually changed how I work (no fluff)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 897,
  1761815264, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/writing-plans', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ojuqhm/10_claude_skills_that_actually_changed_how_i_work/', '1ojuqhm',
  'geekeek123', NULL, NULL,
  'community', 'approved', 'Okay so Skills dropped last month and I''ve been testing them nonstop. Some are genuinely useful, others are kinda whatever. Here''s what I actually use:

**1. Rube MCP Connector** \- This one''s wild. Connect Claude to like 500 apps (Slack, GitHub, Notion, etc) through ONE server instead of setting up auth for each one separately. Saves so much time if you''re doing automation stuff.

**2. Superpowers** \- obra''s dev toolkit. Has /brainstorm, /write-plan, /execute-plan commands that basically turn Claude into a proper dev workflow instead of just a chatbot. Game changer if you''re coding seriously.

**3. Document Suite** \- Official one. Makes Claude actually good at Word/Excel/PowerPoint/PDF. Not just reading them but ACTUALLY creating proper docs with formatting, formulas, all that. Built-in for Pro users.

**4. Theme Factory** \- Upload your brand guidelines once, every artifact Claude makes follows your colors/fonts automatically. Marketing teams will love this.

**5. Algorithmic Art** \- p5.js generative art but you just describe it. "Blue-purple gradient flow field, 5000 particles, seed 42" and boom, reproducible artwork. Creative coders eating good.

**6. Slack GIF Creator** \- Custom animated GIFs optimized for Slack. Instead of searching Giphy, just tell Claude what you want. Weirdly fun.

**7. Webapp Testing** \- Playwright automation. Tell Claude "test the login flow" and it writes + runs the tests. QA engineers this is for you.

**8. MCP Builder** \- Generates MCP server boilerplate. If you''re building custom integrations, this cuts setup time by like 80%.

**9. Brand Guidelines** \- Similar to Theme Factory but handles multiple brands. Switch between them easily.

**10. Systematic Debugging** \- Makes Claude debug like a senior dev. Root cause → hypotheses → fixes → documentation. No more random stabbing.

**Quick thoughts:**

* Skills are just markdown files with YAML metadata (super easy to make your own)
* Work across [Claude.ai](http://Claude.ai), Claude Code, and API
* Community ones on GitHub are hit or miss, use at your own risk

The Rube connector and Superpowers are my daily drivers now. Document Suite is clutch when clients send weird file formats.

Anyone else trying these? What am I missing?

**Resources:**

* [Claude Skills repo](https://github.com/ComposioHQ/awesome-claude-skills)
* [Superpowers](https://github.com/obra/superpowers)
* [Composio](https://github.com/composiohq/skills)', '10 Claude Skills that actually changed how I work (no fluff)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 897,
  1761815264, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/executing-plans', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ojuqhm/10_claude_skills_that_actually_changed_how_i_work/', '1ojuqhm',
  'geekeek123', NULL, NULL,
  'community', 'approved', 'Okay so Skills dropped last month and I''ve been testing them nonstop. Some are genuinely useful, others are kinda whatever. Here''s what I actually use:

**1. Rube MCP Connector** \- This one''s wild. Connect Claude to like 500 apps (Slack, GitHub, Notion, etc) through ONE server instead of setting up auth for each one separately. Saves so much time if you''re doing automation stuff.

**2. Superpowers** \- obra''s dev toolkit. Has /brainstorm, /write-plan, /execute-plan commands that basically turn Claude into a proper dev workflow instead of just a chatbot. Game changer if you''re coding seriously.

**3. Document Suite** \- Official one. Makes Claude actually good at Word/Excel/PowerPoint/PDF. Not just reading them but ACTUALLY creating proper docs with formatting, formulas, all that. Built-in for Pro users.

**4. Theme Factory** \- Upload your brand guidelines once, every artifact Claude makes follows your colors/fonts automatically. Marketing teams will love this.

**5. Algorithmic Art** \- p5.js generative art but you just describe it. "Blue-purple gradient flow field, 5000 particles, seed 42" and boom, reproducible artwork. Creative coders eating good.

**6. Slack GIF Creator** \- Custom animated GIFs optimized for Slack. Instead of searching Giphy, just tell Claude what you want. Weirdly fun.

**7. Webapp Testing** \- Playwright automation. Tell Claude "test the login flow" and it writes + runs the tests. QA engineers this is for you.

**8. MCP Builder** \- Generates MCP server boilerplate. If you''re building custom integrations, this cuts setup time by like 80%.

**9. Brand Guidelines** \- Similar to Theme Factory but handles multiple brands. Switch between them easily.

**10. Systematic Debugging** \- Makes Claude debug like a senior dev. Root cause → hypotheses → fixes → documentation. No more random stabbing.

**Quick thoughts:**

* Skills are just markdown files with YAML metadata (super easy to make your own)
* Work across [Claude.ai](http://Claude.ai), Claude Code, and API
* Community ones on GitHub are hit or miss, use at your own risk

The Rube connector and Superpowers are my daily drivers now. Document Suite is clutch when clients send weird file formats.

Anyone else trying these? What am I missing?

**Resources:**

* [Claude Skills repo](https://github.com/ComposioHQ/awesome-claude-skills)
* [Superpowers](https://github.com/obra/superpowers)
* [Composio](https://github.com/composiohq/skills)', '10 Claude Skills that actually changed how I work (no fluff)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 897,
  1761815264, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/systematic-debugging', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ojuqhm/10_claude_skills_that_actually_changed_how_i_work/', '1ojuqhm',
  'geekeek123', NULL, NULL,
  'community', 'approved', 'Okay so Skills dropped last month and I''ve been testing them nonstop. Some are genuinely useful, others are kinda whatever. Here''s what I actually use:

**1. Rube MCP Connector** \- This one''s wild. Connect Claude to like 500 apps (Slack, GitHub, Notion, etc) through ONE server instead of setting up auth for each one separately. Saves so much time if you''re doing automation stuff.

**2. Superpowers** \- obra''s dev toolkit. Has /brainstorm, /write-plan, /execute-plan commands that basically turn Claude into a proper dev workflow instead of just a chatbot. Game changer if you''re coding seriously.

**3. Document Suite** \- Official one. Makes Claude actually good at Word/Excel/PowerPoint/PDF. Not just reading them but ACTUALLY creating proper docs with formatting, formulas, all that. Built-in for Pro users.

**4. Theme Factory** \- Upload your brand guidelines once, every artifact Claude makes follows your colors/fonts automatically. Marketing teams will love this.

**5. Algorithmic Art** \- p5.js generative art but you just describe it. "Blue-purple gradient flow field, 5000 particles, seed 42" and boom, reproducible artwork. Creative coders eating good.

**6. Slack GIF Creator** \- Custom animated GIFs optimized for Slack. Instead of searching Giphy, just tell Claude what you want. Weirdly fun.

**7. Webapp Testing** \- Playwright automation. Tell Claude "test the login flow" and it writes + runs the tests. QA engineers this is for you.

**8. MCP Builder** \- Generates MCP server boilerplate. If you''re building custom integrations, this cuts setup time by like 80%.

**9. Brand Guidelines** \- Similar to Theme Factory but handles multiple brands. Switch between them easily.

**10. Systematic Debugging** \- Makes Claude debug like a senior dev. Root cause → hypotheses → fixes → documentation. No more random stabbing.

**Quick thoughts:**

* Skills are just markdown files with YAML metadata (super easy to make your own)
* Work across [Claude.ai](http://Claude.ai), Claude Code, and API
* Community ones on GitHub are hit or miss, use at your own risk

The Rube connector and Superpowers are my daily drivers now. Document Suite is clutch when clients send weird file formats.

Anyone else trying these? What am I missing?

**Resources:**

* [Claude Skills repo](https://github.com/ComposioHQ/awesome-claude-skills)
* [Superpowers](https://github.com/obra/superpowers)
* [Composio](https://github.com/composiohq/skills)', '10 Claude Skills that actually changed how I work (no fluff)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 897,
  1761815264, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/brainstorming', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ok9v3d/i_tested_30_community_claude_skills_for_a_week/', '1ok9v3d',
  'Zestyclose-Ad-9003', NULL, NULL,
  'community', 'approved', '**I spent a week testing every community-built Claude Skill I could find. The official ones? Just scratching the surface.**

So when Skills launched, I did what everyone did - grabbed the official Anthropic ones. Docx, pptx, pdf stuff. They work fine.

Then I kept seeing people on Twitter and GitHub talking about these community-built skills that were supposedly changing their entire workflow.

But I had a week where I was procrastinating on actual work, so… why not test them?

Downloaded like 30+ skills and hooks. Broke stuff. Fixed stuff. Spent too much time reading GitHub READMEs at 2am.

Some were overhyped garbage. But a bunch? Actually game-changing.


**Disclaimer:** *Used LLM to clean up my English and structure this better - the research, testing, and opinions are all mine though.*

-----

**Here’s the thing nobody tells you:**

Official skills are like… a microwave. Does one thing, does it well, everyone gets the same experience.

Community skills are more like that weird kitchen gadget your chef friend swears by. Super specific, kinda weird to learn, but once you get it, you can’t imagine cooking without it.

-----

## **THE ESSENTIALS (Start here)**

**Superpowers** (by obra)

The Swiss Army knife everyone talks about. Brainstorming, debugging, TDD enforcement, execution planning - all with slash commands.

That `/superpowers:execute-plan` command? Saved me SO many hours of “ok Claude now do this… ok now this… wait go back”

Real talk: First day I was lost. Second day it clicked.

Link: <https://github.com/obra/superpowers>

-----

**Superpowers Lab** (by obra)

Experimental/bleeding-edge version of Superpowers. For when you want to try stuff before it’s stable.

Link: <https://github.com/obra/superpowers-lab>

-----

**Skill Seekers** (by yusufkaraaslan)

Point it at ANY documentation site, PDF, or codebase. It auto-generates a Claude Skill.

The moment I got it: We use this internal framework at work that Claude knows nothing about. Normally I’d paste docs into every conversation. Skill Seekers turned the entire docs site into a skill in 10 minutes.

Works with React docs, Django docs, Godot, whatever. Just point and generate.

Link: <https://github.com/yusufkaraaslan/Skill_Seekers>

-----

## **DEVELOPER WORKFLOW SKILLS**

**Test-Driven Development Skill**

Enforces actual TDD workflows. Makes Claude write tests first, not as an afterthought.

Found in: <https://github.com/obra/superpowers> or <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Systematic Debugging Skill**

Stops Claude from just guessing at fixes. Forces root-cause analysis like an experienced dev.

Saved me at 2am once during a production bug. We actually FOUND the issue instead of throwing random fixes at it.

Found in: <https://github.com/obra/superpowers>

-----

**Finishing a Development Branch Skill**

Streamlines that annoying “ok now merge this and clean up and…” workflow.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Using Git Worktrees Skill**

If you work on multiple branches simultaneously, this is a lifesaver. Makes Claude actually understand worktrees.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Pypict Skill**

Generates combinatorial testing cases. For when you need robust QA and don’t want to manually write 500 test cases.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Webapp Testing with Playwright Skill**

Automates web app testing. Claude can test your UI flows end-to-end.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**ffuf_claude_skill**

Security fuzzing and vulnerability analysis. If you’re doing any security work, this is it.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Defense-in-Depth Skill**

Multi-layered security and quality checks for your codebase. Hardens everything.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **RESEARCH & KNOWLEDGE SKILLS**

**Tapestry**

Takes technical docs and creates a navigable knowledge graph. I had 50+ API PDFs. Tapestry turned them into an interconnected wiki I can actually query.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

**YouTube Transcript/Article Extractor Skills**

Scrapes and summarizes YouTube videos or web articles. Great for research without watching 50 hours of content.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Brainstorming Skill**

Turns rough ideas into structured design plans. Less “I have a vague thought” more “here’s the actual plan”

Found in: <https://github.com/obra/superpowers>

-----

**Content Research Writer Skill**

Adds citations, iterates on quality, organizes research automatically. If you write content backed by research, this is huge.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**EPUB & PDF Analyzer**

Summarizes or queries ebooks and academic papers. Academic research people love this one.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **PRODUCTIVITY & AUTOMATION SKILLS**

**Invoice/File Organizer Skills**

Smart categorization for receipts, documents, finance stuff.

Tax season me is SO much happier. Point it at a folder of chaos, get structure back.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Web Asset Generator Skill**

Auto-creates icons, Open Graph tags, PWA assets. Web devs save like an hour per project.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

## **CLAUDE CODE HOOKS (If you use Claude Code)**

Hooks are event-driven triggers. Claude does something → your hook runs. Super powerful if you know what you’re doing.

**johnlindquist/claude-hooks**

The main one. TypeScript framework with auto-completion and typed payloads.

If you’re doing ANYTHING programmatic with Claude Code, this is your foundation.

Warning: You need to know TypeScript. Not beginner-friendly.

Link: <https://github.com/johnlindquist/claude-hooks>

-----

**CCHooks** (by GowayLee)

Python version. Minimal, clean abstraction. Fun to customize if you prefer Python.

Search for “GowayLee CCHooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**claude-code-hooks-sdk** (by beyondcode)

PHP/Laravel-style hooks. For the PHP crowd.

Search “beyondcode claude-code-hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**Claudio** (by Christopher Toth)

Adds OS-native sounds to Claude. Sounds silly but people love the “delightful alerts”

Beep when Claude finishes a task. Ding when errors happen. It’s weirdly satisfying.

Search “Christopher Toth Claudio” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**CC Notify**

Desktop notifications, session reminders, progress alerts. Know when Claude finishes long tasks.

Super useful when Claude’s running something that takes 10 minutes and you’re in another window.

Found in: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**codeinbox/claude-code-discord**

Real-time session activity notifications to Discord or Slack. Great for teams or just keeping a log of what Claude’s doing.

Link: <https://github.com/codeinbox/claude-code-discord>

-----

**fcakyon Code Quality Collection**

Various code quality hooks - TDD enforcement, linting, tool checks. Super comprehensive.

If you want to enforce standards across your team’s Claude usage, this is it.

Search “fcakyon claude” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**TypeScript Quality Hooks** (by bartolli)

Advanced project health for TypeScript. Instant validation and format-fixers.

Catches TypeScript issues before they become problems.

Search “bartolli typescript claude hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

## **What I learned:**

**Works:**

- Skills solving ONE specific problem really well
- Dev-focused skills have highest quality (devs scratching their own itch)
- Hooks are insanely powerful if you invest time learning them
- Documentation-to-skill generators (like Skill Seekers) are secretly the most useful

**Doesn’t work:**

- Vague “makes Claude smarter” skills
- Complicated setup that breaks on every update
- Skills that try to do too much at once

**Who this is for:**

Casual Claude chat? Official skills are fine.

Daily work (coding, research, content)? Community skills are a must.

Claude Code user? Hooks + Superpowers are non-negotiable.

Working with custom/internal tools? Skill Seekers changes everything.

-----

## **How to actually try this:**

**For beginners:**

1. Start at <https://github.com/travisvn/awesome-claude-skills> or <https://github.com/BehiSecc/awesome-claude-skills>
2. Install Superpowers if you code, Skill Seekers if you work with docs
3. Try Invoice Organizer or Tapestry if you’re non-technical
4. Read the README before installing

**For developers:**

1. Get Superpowers + Systematic Debugging immediately
2. Try TDD Skill and Git Worktrees Skill
3. Learn johnlindquist/claude-hooks if you use Claude Code
4. Explore fcakyon’s quality hooks for code standards

**For researchers/writers:**

1. Tapestry for knowledge management
2. Content Research Writer for citations
3. YouTube/Article Extractors for quick research
4. EPUB/PDF Analyzer for academic work

**For Claude Code users:**

1. <https://github.com/johnlindquist/claude-hooks> as foundation
2. CC Notify for task completion alerts
3. fcakyon Code Quality Collection for standards
4. Claudio if you want fun sound effects (you do)

**Main Resource Hubs:**

- <https://github.com/BehiSecc/awesome-claude-skills> (Skills)
- <https://github.com/hesreallyhim/awesome-claude-code> (Hooks)

**When stuff breaks:**

- Check Claude Projects settings - manually enable skills
- Restart Claude Code (fixes 80% of issues)
- Read the GitHub Issues - someone else hit your problem
- Most skills need to be in the right directory structure

-----

## **What are you using?**

I went down this rabbit hole because I was wasting 2 hours daily on repetitive tasks. Now it’s 20 minutes.

Drop links to skills you’ve built or found. Especially:

- Non-dev use cases (most of this is technical)
- Creative/content workflows
- Business automation that actually works

Or if you’ve built something cool with hooks, I want to see it.', 'I tested 30+ community Claude Skills for a week. Here’s what actually works (complete list + GitHub links)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 612,
  1761854034, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/executing-plans', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ok9v3d/i_tested_30_community_claude_skills_for_a_week/', '1ok9v3d',
  'Zestyclose-Ad-9003', NULL, NULL,
  'community', 'approved', '**I spent a week testing every community-built Claude Skill I could find. The official ones? Just scratching the surface.**

So when Skills launched, I did what everyone did - grabbed the official Anthropic ones. Docx, pptx, pdf stuff. They work fine.

Then I kept seeing people on Twitter and GitHub talking about these community-built skills that were supposedly changing their entire workflow.

But I had a week where I was procrastinating on actual work, so… why not test them?

Downloaded like 30+ skills and hooks. Broke stuff. Fixed stuff. Spent too much time reading GitHub READMEs at 2am.

Some were overhyped garbage. But a bunch? Actually game-changing.


**Disclaimer:** *Used LLM to clean up my English and structure this better - the research, testing, and opinions are all mine though.*

-----

**Here’s the thing nobody tells you:**

Official skills are like… a microwave. Does one thing, does it well, everyone gets the same experience.

Community skills are more like that weird kitchen gadget your chef friend swears by. Super specific, kinda weird to learn, but once you get it, you can’t imagine cooking without it.

-----

## **THE ESSENTIALS (Start here)**

**Superpowers** (by obra)

The Swiss Army knife everyone talks about. Brainstorming, debugging, TDD enforcement, execution planning - all with slash commands.

That `/superpowers:execute-plan` command? Saved me SO many hours of “ok Claude now do this… ok now this… wait go back”

Real talk: First day I was lost. Second day it clicked.

Link: <https://github.com/obra/superpowers>

-----

**Superpowers Lab** (by obra)

Experimental/bleeding-edge version of Superpowers. For when you want to try stuff before it’s stable.

Link: <https://github.com/obra/superpowers-lab>

-----

**Skill Seekers** (by yusufkaraaslan)

Point it at ANY documentation site, PDF, or codebase. It auto-generates a Claude Skill.

The moment I got it: We use this internal framework at work that Claude knows nothing about. Normally I’d paste docs into every conversation. Skill Seekers turned the entire docs site into a skill in 10 minutes.

Works with React docs, Django docs, Godot, whatever. Just point and generate.

Link: <https://github.com/yusufkaraaslan/Skill_Seekers>

-----

## **DEVELOPER WORKFLOW SKILLS**

**Test-Driven Development Skill**

Enforces actual TDD workflows. Makes Claude write tests first, not as an afterthought.

Found in: <https://github.com/obra/superpowers> or <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Systematic Debugging Skill**

Stops Claude from just guessing at fixes. Forces root-cause analysis like an experienced dev.

Saved me at 2am once during a production bug. We actually FOUND the issue instead of throwing random fixes at it.

Found in: <https://github.com/obra/superpowers>

-----

**Finishing a Development Branch Skill**

Streamlines that annoying “ok now merge this and clean up and…” workflow.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Using Git Worktrees Skill**

If you work on multiple branches simultaneously, this is a lifesaver. Makes Claude actually understand worktrees.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Pypict Skill**

Generates combinatorial testing cases. For when you need robust QA and don’t want to manually write 500 test cases.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Webapp Testing with Playwright Skill**

Automates web app testing. Claude can test your UI flows end-to-end.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**ffuf_claude_skill**

Security fuzzing and vulnerability analysis. If you’re doing any security work, this is it.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Defense-in-Depth Skill**

Multi-layered security and quality checks for your codebase. Hardens everything.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **RESEARCH & KNOWLEDGE SKILLS**

**Tapestry**

Takes technical docs and creates a navigable knowledge graph. I had 50+ API PDFs. Tapestry turned them into an interconnected wiki I can actually query.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

**YouTube Transcript/Article Extractor Skills**

Scrapes and summarizes YouTube videos or web articles. Great for research without watching 50 hours of content.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Brainstorming Skill**

Turns rough ideas into structured design plans. Less “I have a vague thought” more “here’s the actual plan”

Found in: <https://github.com/obra/superpowers>

-----

**Content Research Writer Skill**

Adds citations, iterates on quality, organizes research automatically. If you write content backed by research, this is huge.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**EPUB & PDF Analyzer**

Summarizes or queries ebooks and academic papers. Academic research people love this one.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **PRODUCTIVITY & AUTOMATION SKILLS**

**Invoice/File Organizer Skills**

Smart categorization for receipts, documents, finance stuff.

Tax season me is SO much happier. Point it at a folder of chaos, get structure back.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Web Asset Generator Skill**

Auto-creates icons, Open Graph tags, PWA assets. Web devs save like an hour per project.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

## **CLAUDE CODE HOOKS (If you use Claude Code)**

Hooks are event-driven triggers. Claude does something → your hook runs. Super powerful if you know what you’re doing.

**johnlindquist/claude-hooks**

The main one. TypeScript framework with auto-completion and typed payloads.

If you’re doing ANYTHING programmatic with Claude Code, this is your foundation.

Warning: You need to know TypeScript. Not beginner-friendly.

Link: <https://github.com/johnlindquist/claude-hooks>

-----

**CCHooks** (by GowayLee)

Python version. Minimal, clean abstraction. Fun to customize if you prefer Python.

Search for “GowayLee CCHooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**claude-code-hooks-sdk** (by beyondcode)

PHP/Laravel-style hooks. For the PHP crowd.

Search “beyondcode claude-code-hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**Claudio** (by Christopher Toth)

Adds OS-native sounds to Claude. Sounds silly but people love the “delightful alerts”

Beep when Claude finishes a task. Ding when errors happen. It’s weirdly satisfying.

Search “Christopher Toth Claudio” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**CC Notify**

Desktop notifications, session reminders, progress alerts. Know when Claude finishes long tasks.

Super useful when Claude’s running something that takes 10 minutes and you’re in another window.

Found in: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**codeinbox/claude-code-discord**

Real-time session activity notifications to Discord or Slack. Great for teams or just keeping a log of what Claude’s doing.

Link: <https://github.com/codeinbox/claude-code-discord>

-----

**fcakyon Code Quality Collection**

Various code quality hooks - TDD enforcement, linting, tool checks. Super comprehensive.

If you want to enforce standards across your team’s Claude usage, this is it.

Search “fcakyon claude” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**TypeScript Quality Hooks** (by bartolli)

Advanced project health for TypeScript. Instant validation and format-fixers.

Catches TypeScript issues before they become problems.

Search “bartolli typescript claude hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

## **What I learned:**

**Works:**

- Skills solving ONE specific problem really well
- Dev-focused skills have highest quality (devs scratching their own itch)
- Hooks are insanely powerful if you invest time learning them
- Documentation-to-skill generators (like Skill Seekers) are secretly the most useful

**Doesn’t work:**

- Vague “makes Claude smarter” skills
- Complicated setup that breaks on every update
- Skills that try to do too much at once

**Who this is for:**

Casual Claude chat? Official skills are fine.

Daily work (coding, research, content)? Community skills are a must.

Claude Code user? Hooks + Superpowers are non-negotiable.

Working with custom/internal tools? Skill Seekers changes everything.

-----

## **How to actually try this:**

**For beginners:**

1. Start at <https://github.com/travisvn/awesome-claude-skills> or <https://github.com/BehiSecc/awesome-claude-skills>
2. Install Superpowers if you code, Skill Seekers if you work with docs
3. Try Invoice Organizer or Tapestry if you’re non-technical
4. Read the README before installing

**For developers:**

1. Get Superpowers + Systematic Debugging immediately
2. Try TDD Skill and Git Worktrees Skill
3. Learn johnlindquist/claude-hooks if you use Claude Code
4. Explore fcakyon’s quality hooks for code standards

**For researchers/writers:**

1. Tapestry for knowledge management
2. Content Research Writer for citations
3. YouTube/Article Extractors for quick research
4. EPUB/PDF Analyzer for academic work

**For Claude Code users:**

1. <https://github.com/johnlindquist/claude-hooks> as foundation
2. CC Notify for task completion alerts
3. fcakyon Code Quality Collection for standards
4. Claudio if you want fun sound effects (you do)

**Main Resource Hubs:**

- <https://github.com/BehiSecc/awesome-claude-skills> (Skills)
- <https://github.com/hesreallyhim/awesome-claude-code> (Hooks)

**When stuff breaks:**

- Check Claude Projects settings - manually enable skills
- Restart Claude Code (fixes 80% of issues)
- Read the GitHub Issues - someone else hit your problem
- Most skills need to be in the right directory structure

-----

## **What are you using?**

I went down this rabbit hole because I was wasting 2 hours daily on repetitive tasks. Now it’s 20 minutes.

Drop links to skills you’ve built or found. Especially:

- Non-dev use cases (most of this is technical)
- Creative/content workflows
- Business automation that actually works

Or if you’ve built something cool with hooks, I want to see it.', 'I tested 30+ community Claude Skills for a week. Here’s what actually works (complete list + GitHub links)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 612,
  1761854034, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/systematic-debugging', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ok9v3d/i_tested_30_community_claude_skills_for_a_week/', '1ok9v3d',
  'Zestyclose-Ad-9003', NULL, NULL,
  'community', 'approved', '**I spent a week testing every community-built Claude Skill I could find. The official ones? Just scratching the surface.**

So when Skills launched, I did what everyone did - grabbed the official Anthropic ones. Docx, pptx, pdf stuff. They work fine.

Then I kept seeing people on Twitter and GitHub talking about these community-built skills that were supposedly changing their entire workflow.

But I had a week where I was procrastinating on actual work, so… why not test them?

Downloaded like 30+ skills and hooks. Broke stuff. Fixed stuff. Spent too much time reading GitHub READMEs at 2am.

Some were overhyped garbage. But a bunch? Actually game-changing.


**Disclaimer:** *Used LLM to clean up my English and structure this better - the research, testing, and opinions are all mine though.*

-----

**Here’s the thing nobody tells you:**

Official skills are like… a microwave. Does one thing, does it well, everyone gets the same experience.

Community skills are more like that weird kitchen gadget your chef friend swears by. Super specific, kinda weird to learn, but once you get it, you can’t imagine cooking without it.

-----

## **THE ESSENTIALS (Start here)**

**Superpowers** (by obra)

The Swiss Army knife everyone talks about. Brainstorming, debugging, TDD enforcement, execution planning - all with slash commands.

That `/superpowers:execute-plan` command? Saved me SO many hours of “ok Claude now do this… ok now this… wait go back”

Real talk: First day I was lost. Second day it clicked.

Link: <https://github.com/obra/superpowers>

-----

**Superpowers Lab** (by obra)

Experimental/bleeding-edge version of Superpowers. For when you want to try stuff before it’s stable.

Link: <https://github.com/obra/superpowers-lab>

-----

**Skill Seekers** (by yusufkaraaslan)

Point it at ANY documentation site, PDF, or codebase. It auto-generates a Claude Skill.

The moment I got it: We use this internal framework at work that Claude knows nothing about. Normally I’d paste docs into every conversation. Skill Seekers turned the entire docs site into a skill in 10 minutes.

Works with React docs, Django docs, Godot, whatever. Just point and generate.

Link: <https://github.com/yusufkaraaslan/Skill_Seekers>

-----

## **DEVELOPER WORKFLOW SKILLS**

**Test-Driven Development Skill**

Enforces actual TDD workflows. Makes Claude write tests first, not as an afterthought.

Found in: <https://github.com/obra/superpowers> or <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Systematic Debugging Skill**

Stops Claude from just guessing at fixes. Forces root-cause analysis like an experienced dev.

Saved me at 2am once during a production bug. We actually FOUND the issue instead of throwing random fixes at it.

Found in: <https://github.com/obra/superpowers>

-----

**Finishing a Development Branch Skill**

Streamlines that annoying “ok now merge this and clean up and…” workflow.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Using Git Worktrees Skill**

If you work on multiple branches simultaneously, this is a lifesaver. Makes Claude actually understand worktrees.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Pypict Skill**

Generates combinatorial testing cases. For when you need robust QA and don’t want to manually write 500 test cases.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Webapp Testing with Playwright Skill**

Automates web app testing. Claude can test your UI flows end-to-end.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**ffuf_claude_skill**

Security fuzzing and vulnerability analysis. If you’re doing any security work, this is it.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Defense-in-Depth Skill**

Multi-layered security and quality checks for your codebase. Hardens everything.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **RESEARCH & KNOWLEDGE SKILLS**

**Tapestry**

Takes technical docs and creates a navigable knowledge graph. I had 50+ API PDFs. Tapestry turned them into an interconnected wiki I can actually query.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

**YouTube Transcript/Article Extractor Skills**

Scrapes and summarizes YouTube videos or web articles. Great for research without watching 50 hours of content.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Brainstorming Skill**

Turns rough ideas into structured design plans. Less “I have a vague thought” more “here’s the actual plan”

Found in: <https://github.com/obra/superpowers>

-----

**Content Research Writer Skill**

Adds citations, iterates on quality, organizes research automatically. If you write content backed by research, this is huge.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**EPUB & PDF Analyzer**

Summarizes or queries ebooks and academic papers. Academic research people love this one.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **PRODUCTIVITY & AUTOMATION SKILLS**

**Invoice/File Organizer Skills**

Smart categorization for receipts, documents, finance stuff.

Tax season me is SO much happier. Point it at a folder of chaos, get structure back.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Web Asset Generator Skill**

Auto-creates icons, Open Graph tags, PWA assets. Web devs save like an hour per project.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

## **CLAUDE CODE HOOKS (If you use Claude Code)**

Hooks are event-driven triggers. Claude does something → your hook runs. Super powerful if you know what you’re doing.

**johnlindquist/claude-hooks**

The main one. TypeScript framework with auto-completion and typed payloads.

If you’re doing ANYTHING programmatic with Claude Code, this is your foundation.

Warning: You need to know TypeScript. Not beginner-friendly.

Link: <https://github.com/johnlindquist/claude-hooks>

-----

**CCHooks** (by GowayLee)

Python version. Minimal, clean abstraction. Fun to customize if you prefer Python.

Search for “GowayLee CCHooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**claude-code-hooks-sdk** (by beyondcode)

PHP/Laravel-style hooks. For the PHP crowd.

Search “beyondcode claude-code-hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**Claudio** (by Christopher Toth)

Adds OS-native sounds to Claude. Sounds silly but people love the “delightful alerts”

Beep when Claude finishes a task. Ding when errors happen. It’s weirdly satisfying.

Search “Christopher Toth Claudio” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**CC Notify**

Desktop notifications, session reminders, progress alerts. Know when Claude finishes long tasks.

Super useful when Claude’s running something that takes 10 minutes and you’re in another window.

Found in: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**codeinbox/claude-code-discord**

Real-time session activity notifications to Discord or Slack. Great for teams or just keeping a log of what Claude’s doing.

Link: <https://github.com/codeinbox/claude-code-discord>

-----

**fcakyon Code Quality Collection**

Various code quality hooks - TDD enforcement, linting, tool checks. Super comprehensive.

If you want to enforce standards across your team’s Claude usage, this is it.

Search “fcakyon claude” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**TypeScript Quality Hooks** (by bartolli)

Advanced project health for TypeScript. Instant validation and format-fixers.

Catches TypeScript issues before they become problems.

Search “bartolli typescript claude hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

## **What I learned:**

**Works:**

- Skills solving ONE specific problem really well
- Dev-focused skills have highest quality (devs scratching their own itch)
- Hooks are insanely powerful if you invest time learning them
- Documentation-to-skill generators (like Skill Seekers) are secretly the most useful

**Doesn’t work:**

- Vague “makes Claude smarter” skills
- Complicated setup that breaks on every update
- Skills that try to do too much at once

**Who this is for:**

Casual Claude chat? Official skills are fine.

Daily work (coding, research, content)? Community skills are a must.

Claude Code user? Hooks + Superpowers are non-negotiable.

Working with custom/internal tools? Skill Seekers changes everything.

-----

## **How to actually try this:**

**For beginners:**

1. Start at <https://github.com/travisvn/awesome-claude-skills> or <https://github.com/BehiSecc/awesome-claude-skills>
2. Install Superpowers if you code, Skill Seekers if you work with docs
3. Try Invoice Organizer or Tapestry if you’re non-technical
4. Read the README before installing

**For developers:**

1. Get Superpowers + Systematic Debugging immediately
2. Try TDD Skill and Git Worktrees Skill
3. Learn johnlindquist/claude-hooks if you use Claude Code
4. Explore fcakyon’s quality hooks for code standards

**For researchers/writers:**

1. Tapestry for knowledge management
2. Content Research Writer for citations
3. YouTube/Article Extractors for quick research
4. EPUB/PDF Analyzer for academic work

**For Claude Code users:**

1. <https://github.com/johnlindquist/claude-hooks> as foundation
2. CC Notify for task completion alerts
3. fcakyon Code Quality Collection for standards
4. Claudio if you want fun sound effects (you do)

**Main Resource Hubs:**

- <https://github.com/BehiSecc/awesome-claude-skills> (Skills)
- <https://github.com/hesreallyhim/awesome-claude-code> (Hooks)

**When stuff breaks:**

- Check Claude Projects settings - manually enable skills
- Restart Claude Code (fixes 80% of issues)
- Read the GitHub Issues - someone else hit your problem
- Most skills need to be in the right directory structure

-----

## **What are you using?**

I went down this rabbit hole because I was wasting 2 hours daily on repetitive tasks. Now it’s 20 minutes.

Drop links to skills you’ve built or found. Especially:

- Non-dev use cases (most of this is technical)
- Creative/content workflows
- Business automation that actually works

Or if you’ve built something cool with hooks, I want to see it.', 'I tested 30+ community Claude Skills for a week. Here’s what actually works (complete list + GitHub links)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 612,
  1761854034, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/test-driven-development', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ok9v3d/i_tested_30_community_claude_skills_for_a_week/', '1ok9v3d',
  'Zestyclose-Ad-9003', NULL, NULL,
  'community', 'approved', '**I spent a week testing every community-built Claude Skill I could find. The official ones? Just scratching the surface.**

So when Skills launched, I did what everyone did - grabbed the official Anthropic ones. Docx, pptx, pdf stuff. They work fine.

Then I kept seeing people on Twitter and GitHub talking about these community-built skills that were supposedly changing their entire workflow.

But I had a week where I was procrastinating on actual work, so… why not test them?

Downloaded like 30+ skills and hooks. Broke stuff. Fixed stuff. Spent too much time reading GitHub READMEs at 2am.

Some were overhyped garbage. But a bunch? Actually game-changing.


**Disclaimer:** *Used LLM to clean up my English and structure this better - the research, testing, and opinions are all mine though.*

-----

**Here’s the thing nobody tells you:**

Official skills are like… a microwave. Does one thing, does it well, everyone gets the same experience.

Community skills are more like that weird kitchen gadget your chef friend swears by. Super specific, kinda weird to learn, but once you get it, you can’t imagine cooking without it.

-----

## **THE ESSENTIALS (Start here)**

**Superpowers** (by obra)

The Swiss Army knife everyone talks about. Brainstorming, debugging, TDD enforcement, execution planning - all with slash commands.

That `/superpowers:execute-plan` command? Saved me SO many hours of “ok Claude now do this… ok now this… wait go back”

Real talk: First day I was lost. Second day it clicked.

Link: <https://github.com/obra/superpowers>

-----

**Superpowers Lab** (by obra)

Experimental/bleeding-edge version of Superpowers. For when you want to try stuff before it’s stable.

Link: <https://github.com/obra/superpowers-lab>

-----

**Skill Seekers** (by yusufkaraaslan)

Point it at ANY documentation site, PDF, or codebase. It auto-generates a Claude Skill.

The moment I got it: We use this internal framework at work that Claude knows nothing about. Normally I’d paste docs into every conversation. Skill Seekers turned the entire docs site into a skill in 10 minutes.

Works with React docs, Django docs, Godot, whatever. Just point and generate.

Link: <https://github.com/yusufkaraaslan/Skill_Seekers>

-----

## **DEVELOPER WORKFLOW SKILLS**

**Test-Driven Development Skill**

Enforces actual TDD workflows. Makes Claude write tests first, not as an afterthought.

Found in: <https://github.com/obra/superpowers> or <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Systematic Debugging Skill**

Stops Claude from just guessing at fixes. Forces root-cause analysis like an experienced dev.

Saved me at 2am once during a production bug. We actually FOUND the issue instead of throwing random fixes at it.

Found in: <https://github.com/obra/superpowers>

-----

**Finishing a Development Branch Skill**

Streamlines that annoying “ok now merge this and clean up and…” workflow.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Using Git Worktrees Skill**

If you work on multiple branches simultaneously, this is a lifesaver. Makes Claude actually understand worktrees.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Pypict Skill**

Generates combinatorial testing cases. For when you need robust QA and don’t want to manually write 500 test cases.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Webapp Testing with Playwright Skill**

Automates web app testing. Claude can test your UI flows end-to-end.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**ffuf_claude_skill**

Security fuzzing and vulnerability analysis. If you’re doing any security work, this is it.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Defense-in-Depth Skill**

Multi-layered security and quality checks for your codebase. Hardens everything.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **RESEARCH & KNOWLEDGE SKILLS**

**Tapestry**

Takes technical docs and creates a navigable knowledge graph. I had 50+ API PDFs. Tapestry turned them into an interconnected wiki I can actually query.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

**YouTube Transcript/Article Extractor Skills**

Scrapes and summarizes YouTube videos or web articles. Great for research without watching 50 hours of content.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Brainstorming Skill**

Turns rough ideas into structured design plans. Less “I have a vague thought” more “here’s the actual plan”

Found in: <https://github.com/obra/superpowers>

-----

**Content Research Writer Skill**

Adds citations, iterates on quality, organizes research automatically. If you write content backed by research, this is huge.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**EPUB & PDF Analyzer**

Summarizes or queries ebooks and academic papers. Academic research people love this one.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **PRODUCTIVITY & AUTOMATION SKILLS**

**Invoice/File Organizer Skills**

Smart categorization for receipts, documents, finance stuff.

Tax season me is SO much happier. Point it at a folder of chaos, get structure back.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Web Asset Generator Skill**

Auto-creates icons, Open Graph tags, PWA assets. Web devs save like an hour per project.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

## **CLAUDE CODE HOOKS (If you use Claude Code)**

Hooks are event-driven triggers. Claude does something → your hook runs. Super powerful if you know what you’re doing.

**johnlindquist/claude-hooks**

The main one. TypeScript framework with auto-completion and typed payloads.

If you’re doing ANYTHING programmatic with Claude Code, this is your foundation.

Warning: You need to know TypeScript. Not beginner-friendly.

Link: <https://github.com/johnlindquist/claude-hooks>

-----

**CCHooks** (by GowayLee)

Python version. Minimal, clean abstraction. Fun to customize if you prefer Python.

Search for “GowayLee CCHooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**claude-code-hooks-sdk** (by beyondcode)

PHP/Laravel-style hooks. For the PHP crowd.

Search “beyondcode claude-code-hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**Claudio** (by Christopher Toth)

Adds OS-native sounds to Claude. Sounds silly but people love the “delightful alerts”

Beep when Claude finishes a task. Ding when errors happen. It’s weirdly satisfying.

Search “Christopher Toth Claudio” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**CC Notify**

Desktop notifications, session reminders, progress alerts. Know when Claude finishes long tasks.

Super useful when Claude’s running something that takes 10 minutes and you’re in another window.

Found in: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**codeinbox/claude-code-discord**

Real-time session activity notifications to Discord or Slack. Great for teams or just keeping a log of what Claude’s doing.

Link: <https://github.com/codeinbox/claude-code-discord>

-----

**fcakyon Code Quality Collection**

Various code quality hooks - TDD enforcement, linting, tool checks. Super comprehensive.

If you want to enforce standards across your team’s Claude usage, this is it.

Search “fcakyon claude” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**TypeScript Quality Hooks** (by bartolli)

Advanced project health for TypeScript. Instant validation and format-fixers.

Catches TypeScript issues before they become problems.

Search “bartolli typescript claude hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

## **What I learned:**

**Works:**

- Skills solving ONE specific problem really well
- Dev-focused skills have highest quality (devs scratching their own itch)
- Hooks are insanely powerful if you invest time learning them
- Documentation-to-skill generators (like Skill Seekers) are secretly the most useful

**Doesn’t work:**

- Vague “makes Claude smarter” skills
- Complicated setup that breaks on every update
- Skills that try to do too much at once

**Who this is for:**

Casual Claude chat? Official skills are fine.

Daily work (coding, research, content)? Community skills are a must.

Claude Code user? Hooks + Superpowers are non-negotiable.

Working with custom/internal tools? Skill Seekers changes everything.

-----

## **How to actually try this:**

**For beginners:**

1. Start at <https://github.com/travisvn/awesome-claude-skills> or <https://github.com/BehiSecc/awesome-claude-skills>
2. Install Superpowers if you code, Skill Seekers if you work with docs
3. Try Invoice Organizer or Tapestry if you’re non-technical
4. Read the README before installing

**For developers:**

1. Get Superpowers + Systematic Debugging immediately
2. Try TDD Skill and Git Worktrees Skill
3. Learn johnlindquist/claude-hooks if you use Claude Code
4. Explore fcakyon’s quality hooks for code standards

**For researchers/writers:**

1. Tapestry for knowledge management
2. Content Research Writer for citations
3. YouTube/Article Extractors for quick research
4. EPUB/PDF Analyzer for academic work

**For Claude Code users:**

1. <https://github.com/johnlindquist/claude-hooks> as foundation
2. CC Notify for task completion alerts
3. fcakyon Code Quality Collection for standards
4. Claudio if you want fun sound effects (you do)

**Main Resource Hubs:**

- <https://github.com/BehiSecc/awesome-claude-skills> (Skills)
- <https://github.com/hesreallyhim/awesome-claude-code> (Hooks)

**When stuff breaks:**

- Check Claude Projects settings - manually enable skills
- Restart Claude Code (fixes 80% of issues)
- Read the GitHub Issues - someone else hit your problem
- Most skills need to be in the right directory structure

-----

## **What are you using?**

I went down this rabbit hole because I was wasting 2 hours daily on repetitive tasks. Now it’s 20 minutes.

Drop links to skills you’ve built or found. Especially:

- Non-dev use cases (most of this is technical)
- Creative/content workflows
- Business automation that actually works

Or if you’ve built something cool with hooks, I want to see it.', 'I tested 30+ community Claude Skills for a week. Here’s what actually works (complete list + GitHub links)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 612,
  1761854034, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-git-worktrees', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1ok9v3d/i_tested_30_community_claude_skills_for_a_week/', '1ok9v3d',
  'Zestyclose-Ad-9003', NULL, NULL,
  'community', 'approved', '**I spent a week testing every community-built Claude Skill I could find. The official ones? Just scratching the surface.**

So when Skills launched, I did what everyone did - grabbed the official Anthropic ones. Docx, pptx, pdf stuff. They work fine.

Then I kept seeing people on Twitter and GitHub talking about these community-built skills that were supposedly changing their entire workflow.

But I had a week where I was procrastinating on actual work, so… why not test them?

Downloaded like 30+ skills and hooks. Broke stuff. Fixed stuff. Spent too much time reading GitHub READMEs at 2am.

Some were overhyped garbage. But a bunch? Actually game-changing.


**Disclaimer:** *Used LLM to clean up my English and structure this better - the research, testing, and opinions are all mine though.*

-----

**Here’s the thing nobody tells you:**

Official skills are like… a microwave. Does one thing, does it well, everyone gets the same experience.

Community skills are more like that weird kitchen gadget your chef friend swears by. Super specific, kinda weird to learn, but once you get it, you can’t imagine cooking without it.

-----

## **THE ESSENTIALS (Start here)**

**Superpowers** (by obra)

The Swiss Army knife everyone talks about. Brainstorming, debugging, TDD enforcement, execution planning - all with slash commands.

That `/superpowers:execute-plan` command? Saved me SO many hours of “ok Claude now do this… ok now this… wait go back”

Real talk: First day I was lost. Second day it clicked.

Link: <https://github.com/obra/superpowers>

-----

**Superpowers Lab** (by obra)

Experimental/bleeding-edge version of Superpowers. For when you want to try stuff before it’s stable.

Link: <https://github.com/obra/superpowers-lab>

-----

**Skill Seekers** (by yusufkaraaslan)

Point it at ANY documentation site, PDF, or codebase. It auto-generates a Claude Skill.

The moment I got it: We use this internal framework at work that Claude knows nothing about. Normally I’d paste docs into every conversation. Skill Seekers turned the entire docs site into a skill in 10 minutes.

Works with React docs, Django docs, Godot, whatever. Just point and generate.

Link: <https://github.com/yusufkaraaslan/Skill_Seekers>

-----

## **DEVELOPER WORKFLOW SKILLS**

**Test-Driven Development Skill**

Enforces actual TDD workflows. Makes Claude write tests first, not as an afterthought.

Found in: <https://github.com/obra/superpowers> or <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Systematic Debugging Skill**

Stops Claude from just guessing at fixes. Forces root-cause analysis like an experienced dev.

Saved me at 2am once during a production bug. We actually FOUND the issue instead of throwing random fixes at it.

Found in: <https://github.com/obra/superpowers>

-----

**Finishing a Development Branch Skill**

Streamlines that annoying “ok now merge this and clean up and…” workflow.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Using Git Worktrees Skill**

If you work on multiple branches simultaneously, this is a lifesaver. Makes Claude actually understand worktrees.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Pypict Skill**

Generates combinatorial testing cases. For when you need robust QA and don’t want to manually write 500 test cases.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Webapp Testing with Playwright Skill**

Automates web app testing. Claude can test your UI flows end-to-end.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**ffuf_claude_skill**

Security fuzzing and vulnerability analysis. If you’re doing any security work, this is it.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Defense-in-Depth Skill**

Multi-layered security and quality checks for your codebase. Hardens everything.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **RESEARCH & KNOWLEDGE SKILLS**

**Tapestry**

Takes technical docs and creates a navigable knowledge graph. I had 50+ API PDFs. Tapestry turned them into an interconnected wiki I can actually query.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

**YouTube Transcript/Article Extractor Skills**

Scrapes and summarizes YouTube videos or web articles. Great for research without watching 50 hours of content.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Brainstorming Skill**

Turns rough ideas into structured design plans. Less “I have a vague thought” more “here’s the actual plan”

Found in: <https://github.com/obra/superpowers>

-----

**Content Research Writer Skill**

Adds citations, iterates on quality, organizes research automatically. If you write content backed by research, this is huge.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**EPUB & PDF Analyzer**

Summarizes or queries ebooks and academic papers. Academic research people love this one.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

## **PRODUCTIVITY & AUTOMATION SKILLS**

**Invoice/File Organizer Skills**

Smart categorization for receipts, documents, finance stuff.

Tax season me is SO much happier. Point it at a folder of chaos, get structure back.

Found in: <https://github.com/BehiSecc/awesome-claude-skills>

-----

**Web Asset Generator Skill**

Auto-creates icons, Open Graph tags, PWA assets. Web devs save like an hour per project.

Found in: <https://github.com/BehiSecc/awesome-claude-skills> or <https://github.com/travisvn/awesome-claude-skills>

-----

## **CLAUDE CODE HOOKS (If you use Claude Code)**

Hooks are event-driven triggers. Claude does something → your hook runs. Super powerful if you know what you’re doing.

**johnlindquist/claude-hooks**

The main one. TypeScript framework with auto-completion and typed payloads.

If you’re doing ANYTHING programmatic with Claude Code, this is your foundation.

Warning: You need to know TypeScript. Not beginner-friendly.

Link: <https://github.com/johnlindquist/claude-hooks>

-----

**CCHooks** (by GowayLee)

Python version. Minimal, clean abstraction. Fun to customize if you prefer Python.

Search for “GowayLee CCHooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**claude-code-hooks-sdk** (by beyondcode)

PHP/Laravel-style hooks. For the PHP crowd.

Search “beyondcode claude-code-hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**Claudio** (by Christopher Toth)

Adds OS-native sounds to Claude. Sounds silly but people love the “delightful alerts”

Beep when Claude finishes a task. Ding when errors happen. It’s weirdly satisfying.

Search “Christopher Toth Claudio” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**CC Notify**

Desktop notifications, session reminders, progress alerts. Know when Claude finishes long tasks.

Super useful when Claude’s running something that takes 10 minutes and you’re in another window.

Found in: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**codeinbox/claude-code-discord**

Real-time session activity notifications to Discord or Slack. Great for teams or just keeping a log of what Claude’s doing.

Link: <https://github.com/codeinbox/claude-code-discord>

-----

**fcakyon Code Quality Collection**

Various code quality hooks - TDD enforcement, linting, tool checks. Super comprehensive.

If you want to enforce standards across your team’s Claude usage, this is it.

Search “fcakyon claude” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

**TypeScript Quality Hooks** (by bartolli)

Advanced project health for TypeScript. Instant validation and format-fixers.

Catches TypeScript issues before they become problems.

Search “bartolli typescript claude hooks” on GitHub or check: <https://github.com/hesreallyhim/awesome-claude-code>

-----

## **What I learned:**

**Works:**

- Skills solving ONE specific problem really well
- Dev-focused skills have highest quality (devs scratching their own itch)
- Hooks are insanely powerful if you invest time learning them
- Documentation-to-skill generators (like Skill Seekers) are secretly the most useful

**Doesn’t work:**

- Vague “makes Claude smarter” skills
- Complicated setup that breaks on every update
- Skills that try to do too much at once

**Who this is for:**

Casual Claude chat? Official skills are fine.

Daily work (coding, research, content)? Community skills are a must.

Claude Code user? Hooks + Superpowers are non-negotiable.

Working with custom/internal tools? Skill Seekers changes everything.

-----

## **How to actually try this:**

**For beginners:**

1. Start at <https://github.com/travisvn/awesome-claude-skills> or <https://github.com/BehiSecc/awesome-claude-skills>
2. Install Superpowers if you code, Skill Seekers if you work with docs
3. Try Invoice Organizer or Tapestry if you’re non-technical
4. Read the README before installing

**For developers:**

1. Get Superpowers + Systematic Debugging immediately
2. Try TDD Skill and Git Worktrees Skill
3. Learn johnlindquist/claude-hooks if you use Claude Code
4. Explore fcakyon’s quality hooks for code standards

**For researchers/writers:**

1. Tapestry for knowledge management
2. Content Research Writer for citations
3. YouTube/Article Extractors for quick research
4. EPUB/PDF Analyzer for academic work

**For Claude Code users:**

1. <https://github.com/johnlindquist/claude-hooks> as foundation
2. CC Notify for task completion alerts
3. fcakyon Code Quality Collection for standards
4. Claudio if you want fun sound effects (you do)

**Main Resource Hubs:**

- <https://github.com/BehiSecc/awesome-claude-skills> (Skills)
- <https://github.com/hesreallyhim/awesome-claude-code> (Hooks)

**When stuff breaks:**

- Check Claude Projects settings - manually enable skills
- Restart Claude Code (fixes 80% of issues)
- Read the GitHub Issues - someone else hit your problem
- Most skills need to be in the right directory structure

-----

## **What are you using?**

I went down this rabbit hole because I was wasting 2 hours daily on repetitive tasks. Now it’s 20 minutes.

Drop links to skills you’ve built or found. Especially:

- Non-dev use cases (most of this is technical)
- Creative/content workflows
- Business automation that actually works

Or if you’ve built something cool with hooks, I want to see it.', 'I tested 30+ community Claude Skills for a week. Here’s what actually works (complete list + GitHub links)', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 612,
  1761854034, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1sepwfc/obrasuperpowers_yeachanheoohmyclaudecode_or_else/', '1sepwfc',
  'WatchMySixWillYa', NULL, NULL,
  'community', 'approved', 'At first, I was relying mostly on MCP''s like Context7, Serena, Playwright, GitHub.

Then, I moved to rely on skills and had over 100 of them (I know, I know, way too many!).

I want to further refine how new features are planned, requirements discussed, implemented, and tested. I know it can be more automated, and I''m currently underutilizing Claude Code, but there are multiple options currently.

From the more popular ones I have taken closer look at [https://github.com/yeachan-heo/oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) and https://github.com/obra/superpowers. Which one do you use and why?', 'obra/superpowers, yeachan-heo/oh-my-claudecode, or else? What''s y''all using?', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 5,
  1775549736, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1qj1zjg/using_claude_code_obrasuperpowers_how_do_you/', '1qj1zjg',
  'silveroff', NULL, NULL,
  'community', 'approved', 'I''ve been using the Claude Code plugin (obra/superpowers) and I''m curious how others manage the review and iteration cycle. The plugin works by creating git worktrees for each task and generating a PR when done - this is the default workflow.

Here''s where I''m struggling:

**Long-running tasks with limited visibility**

The plugin often works for a long time - sometimes an hour or more for larger tasks. During that time, the only way to see what''s happening is to watch commits appear in the worktree. If I notice the code going in a wrong direction, is ctrl+c the right move? Or is there a better way to course-correct mid-task?

Also, the plugin asks for permissions *a lot*. Feels like it really expects to run in some kind of auto-approve/insecure mode to be practical. Is that how most people use it?

**The PR comes at the wrong time**

My ideal workflow would be: Claude does work → I review → I iterate/polish → I test (not in a sense of running unit tests) →*then* create PR when I''m satisfied. But superpowers inverts this - the PR is created when Claude finishes, before I''ve had a chance to review properly.

The irony is that PRs are actually great for reviewing what changed - you get a clean diff of everything. But when Claude finishes work, I have a series of commits in the worktree and it''s hard to see the full picture of what was actually modified. I essentially *need* the PR view to understand what to review, but by then it already exists on GitHub.

**Context switching is painful**

My IDE (PyCharm) stays open on the main branch where I started the task. Claude''s work lives in the worktree. When I want to give feedback or ask Claude to iterate:

* I need to explicitly tell Claude which worktree I''m reviewing, otherwise it tries to "fix" my main branch
* If I open the worktree in PyCharm, I lose all my IDE settings (`.idea` isn''t tracked)
* If I want to actually run/test the code, I need to create a new venv in the worktree

Partially manageable by tracking some `.idea` files in git, but that creates friction with team projects.

**Mental model is unclear**

When Claude''s work isn''t quite right, what''s the intended flow? Should I:

* Give feedback from my main checkout and specify the worktree path?
* Open Claude Code inside the worktree itself?

**My question**: How do you actually work with this plugin day-to-day? Do you run it in auto-approve mode? Do you ctrl+c when things go sideways? Is there a way to review and iterate *before* the PR gets created? Would love to hear what workflow others have settled on.', 'Using Claude Code (obra/superpowers) - how do you handle the review workflow?', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 6,
  1769011672, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-git-worktrees', 'reddit', 'https://www.reddit.com/r/ClaudeAI/comments/1qj1zjg/using_claude_code_obrasuperpowers_how_do_you/', '1qj1zjg',
  'silveroff', NULL, NULL,
  'community', 'approved', 'I''ve been using the Claude Code plugin (obra/superpowers) and I''m curious how others manage the review and iteration cycle. The plugin works by creating git worktrees for each task and generating a PR when done - this is the default workflow.

Here''s where I''m struggling:

**Long-running tasks with limited visibility**

The plugin often works for a long time - sometimes an hour or more for larger tasks. During that time, the only way to see what''s happening is to watch commits appear in the worktree. If I notice the code going in a wrong direction, is ctrl+c the right move? Or is there a better way to course-correct mid-task?

Also, the plugin asks for permissions *a lot*. Feels like it really expects to run in some kind of auto-approve/insecure mode to be practical. Is that how most people use it?

**The PR comes at the wrong time**

My ideal workflow would be: Claude does work → I review → I iterate/polish → I test (not in a sense of running unit tests) →*then* create PR when I''m satisfied. But superpowers inverts this - the PR is created when Claude finishes, before I''ve had a chance to review properly.

The irony is that PRs are actually great for reviewing what changed - you get a clean diff of everything. But when Claude finishes work, I have a series of commits in the worktree and it''s hard to see the full picture of what was actually modified. I essentially *need* the PR view to understand what to review, but by then it already exists on GitHub.

**Context switching is painful**

My IDE (PyCharm) stays open on the main branch where I started the task. Claude''s work lives in the worktree. When I want to give feedback or ask Claude to iterate:

* I need to explicitly tell Claude which worktree I''m reviewing, otherwise it tries to "fix" my main branch
* If I open the worktree in PyCharm, I lose all my IDE settings (`.idea` isn''t tracked)
* If I want to actually run/test the code, I need to create a new venv in the worktree

Partially manageable by tracking some `.idea` files in git, but that creates friction with team projects.

**Mental model is unclear**

When Claude''s work isn''t quite right, what''s the intended flow? Should I:

* Give feedback from my main checkout and specify the worktree path?
* Open Claude Code inside the worktree itself?

**My question**: How do you actually work with this plugin day-to-day? Do you run it in auto-approve mode? Do you ctrl+c when things go sideways? Is there a way to review and iterate *before* the PR gets created? Would love to hear what workflow others have settled on.', 'Using Claude Code (obra/superpowers) - how do you handle the review workflow?', NULL,
  NULL, NULL, 'ClaudeAI', 'post', 6,
  1769011672, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/brainstorming', 'bsky', 'https://bsky.app/profile/s.ly/post/3mgnwznd7ok2l', '3mgnwznd7ok2l',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'Superpowers 5 is out today: blog.fsck.com/2026/03/09/s...

There are a bunch of improvements inside, but my favorite new feature is the new ''visual brainstorming'' workflow that uses your browser to help talk through anything where ASCII art might not be high enough fidelity.', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3mgnwznd7ok2l', 'bafyreiauplqs533yv6epetttushbxv4nxndycntgzsemq5hmcr6lez5u4i', NULL, NULL, NULL,
  1773096704, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/s.ly/post/3mgnwznd7ok2l', '3mgnwznd7ok2l',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'Superpowers 5 is out today: blog.fsck.com/2026/03/09/s...

There are a bunch of improvements inside, but my favorite new feature is the new ''visual brainstorming'' workflow that uses your browser to help talk through anything where ASCII art might not be high enough fidelity.', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3mgnwznd7ok2l', 'bafyreiauplqs533yv6epetttushbxv4nxndycntgzsemq5hmcr6lez5u4i', NULL, NULL, NULL,
  1773096704, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/s.ly/post/3miewiorsyk2z', '3miewiorsyk2z',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'Superpowers 5.0.7 is out now. The exciting new thing here: Native support for GitHub Copilot CLI.

blog.fsck.com/releases/202...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3miewiorsyk2z', 'bafyreif6a3gkrb5bggiwm5hpwcq6q62jb42ehvpkrdk5quntxz3c5ynulm', NULL, NULL, NULL,
  1774985920, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/s.ly/post/3mac7ksty2s2w', '3mac7ksty2s2w',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I''m happy to announce the release of Superpowers 4. The coolest new thing in this release is an additional "spec compliance review" agent that runs separately from the existing code review agents. blog.fsck.com/2025/12/18/s...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3mac7ksty2s2w', 'bafyreiej2obrwpuwt6ln4hzj2db6yhfjlqaegl2jv2cakkmwfcau2jpqrm', NULL, NULL, NULL,
  1766096483, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/requesting-code-review', 'bsky', 'https://bsky.app/profile/s.ly/post/3mac7ksty2s2w', '3mac7ksty2s2w',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I''m happy to announce the release of Superpowers 4. The coolest new thing in this release is an additional "spec compliance review" agent that runs separately from the existing code review agents. blog.fsck.com/2025/12/18/s...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3mac7ksty2s2w', 'bafyreiej2obrwpuwt6ln4hzj2db6yhfjlqaegl2jv2cakkmwfcau2jpqrm', NULL, NULL, NULL,
  1766096483, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/receiving-code-review', 'bsky', 'https://bsky.app/profile/s.ly/post/3mac7ksty2s2w', '3mac7ksty2s2w',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I''m happy to announce the release of Superpowers 4. The coolest new thing in this release is an additional "spec compliance review" agent that runs separately from the existing code review agents. blog.fsck.com/2025/12/18/s...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3mac7ksty2s2w', 'bafyreiej2obrwpuwt6ln4hzj2db6yhfjlqaegl2jv2cakkmwfcau2jpqrm', NULL, NULL, NULL,
  1766096483, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/s.ly/post/3m6fr7rbp2c22', '3m6fr7rbp2c22',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I''m happy to announce the release of Superpowers 3.5, now with a full skills system for OpenCode (in addition to Claude Code and Codex.)

blog.fsck.com/2025/11/24/S...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3m6fr7rbp2c22', 'bafyreieoh3cjm3tuqs6f6n4lgsy5bvedespiflo6oqu3k5h7pdy7fvc7pu', NULL, NULL, NULL,
  1764019496, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/s.ly/post/3m3d65nqfnc26', '3m3d65nqfnc26',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'blog.fsck.com/2025/10/16/s...

Anthropic just announced their official skills system across all of Claude. Superpowers is now a Skills plugin.', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3m3d65nqfnc26', 'bafyreiceicdfacnrzmpgvbrhqjzwlcyki2gkaxunbv2pezijsybdrjll6a', NULL, NULL, NULL,
  1760631770, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/s.ly/post/3m2x4wr4iv22h', '3m2x4wr4iv22h',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I just pushed the first major update for Superpowers for Claude Code. This update extracts skills into a standalone git repository that you can fork and manage locally to add, customize skills, and share skills.

Claude decided this was big enough to become 2.0 github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3m2x4wr4iv22h', 'bafyreibauxhdbxwfveyvol2iwaxdxj5no7vaoxugy3fuyibphshouusepq', NULL, NULL, NULL,
  1760218148, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/writing-skills', 'bsky', 'https://bsky.app/profile/s.ly/post/3m2x4wr4iv22h', '3m2x4wr4iv22h',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I just pushed the first major update for Superpowers for Claude Code. This update extracts skills into a standalone git repository that you can fork and manage locally to add, customize skills, and share skills.

Claude decided this was big enough to become 2.0 github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3m2x4wr4iv22h', 'bafyreibauxhdbxwfveyvol2iwaxdxj5no7vaoxugy3fuyibphshouusepq', NULL, NULL, NULL,
  1760218148, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/remembering-conversations', 'bsky', 'https://bsky.app/profile/s.ly/post/3m3v53vlmrc23', '3m3v53vlmrc23',
  's.ly', 'Jesse Vincent', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kbjet2membeuramtzua3vd7w/bafkreih2asn7idbhps54jlbm7el73rthtgxnk7odsxmfedh3eqdle2xwde',
  'author', 'approved', 'I''ve just released the first version of a new Claude Code plugin that helps it remember what it was doing yesterday, why it changed direction, and every conversation it has with you.
blog.fsck.com/2025/10/23/e...', NULL, NULL,
  'at://did:plc:kbjet2membeuramtzua3vd7w/app.bsky.feed.post/3m3v53vlmrc23', 'bafyreieihfwnrgqsgg3ulnmpck2ngq7i7bsrv2dltryz3c6tbv2vv2fysi', NULL, NULL, NULL,
  1761249112, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vite', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vitest', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vue', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vue-best-practices', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vueuse-functions', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/pnpm', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/pinia', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/nuxt', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/web-design-guidelines', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/antfu', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/unocss', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vitepress', 'bsky', 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u', '3mdhoqd7hds2u',
  'antfu.me', 'Anthony Fu', 'https://cdn.bsky.app/img/avatar/plain/did:plc:2pdiyh6lip2aomv7kia3f2jo/bafkreidhcyovthsjjrmh34glopiixwi6fkzp4br7es4osfduux4ajvk7vy',
  'author', 'approved', 'late to the party. I have finally been convinced by multiple awesome developers to give agents another try. 

this is my first premature contribution:
github.com/antfu/skills', NULL, NULL,
  'at://did:plc:2pdiyh6lip2aomv7kia3f2jo/app.bsky.feed.post/3mdhoqd7hds2u', 'bafyreidosttrkexpdttdrdwopdlw4qijzhgxtgg5da75bafafjftnpfxdy', NULL, NULL, NULL,
  1769583108, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/brainstorming', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhqnorehgt2i', '3mhqnorehgt2i',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'Superpowers might be the best thing to happen to coding agents since CLAUDE.md. enforces brainstorming before coding, test-driven development, git worktree isolation, sub-agents with code review. 107k stars and works across Claude Code, Cursor, Codex, Gemini CLI https://github.com/obra/superpowers', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhqnorehgt2i', 'bafyreiajjtjyuct3qogmzvfs7di2iuwmm63x3utdfsecyxs4hhfgehea3a', NULL, NULL, NULL,
  1774289266, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/test-driven-development', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhqnorehgt2i', '3mhqnorehgt2i',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'Superpowers might be the best thing to happen to coding agents since CLAUDE.md. enforces brainstorming before coding, test-driven development, git worktree isolation, sub-agents with code review. 107k stars and works across Claude Code, Cursor, Codex, Gemini CLI https://github.com/obra/superpowers', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhqnorehgt2i', 'bafyreiajjtjyuct3qogmzvfs7di2iuwmm63x3utdfsecyxs4hhfgehea3a', NULL, NULL, NULL,
  1774289266, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-git-worktrees', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhqnorehgt2i', '3mhqnorehgt2i',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'Superpowers might be the best thing to happen to coding agents since CLAUDE.md. enforces brainstorming before coding, test-driven development, git worktree isolation, sub-agents with code review. 107k stars and works across Claude Code, Cursor, Codex, Gemini CLI https://github.com/obra/superpowers', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhqnorehgt2i', 'bafyreiajjtjyuct3qogmzvfs7di2iuwmm63x3utdfsecyxs4hhfgehea3a', NULL, NULL, NULL,
  1774289266, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhqnorehgt2i', '3mhqnorehgt2i',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'Superpowers might be the best thing to happen to coding agents since CLAUDE.md. enforces brainstorming before coding, test-driven development, git worktree isolation, sub-agents with code review. 107k stars and works across Claude Code, Cursor, Codex, Gemini CLI https://github.com/obra/superpowers', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhqnorehgt2i', 'bafyreiajjtjyuct3qogmzvfs7di2iuwmm63x3utdfsecyxs4hhfgehea3a', NULL, NULL, NULL,
  1774289266, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/subagent-driven-development', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhqnorehgt2i', '3mhqnorehgt2i',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'Superpowers might be the best thing to happen to coding agents since CLAUDE.md. enforces brainstorming before coding, test-driven development, git worktree isolation, sub-agents with code review. 107k stars and works across Claude Code, Cursor, Codex, Gemini CLI https://github.com/obra/superpowers', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhqnorehgt2i', 'bafyreiajjtjyuct3qogmzvfs7di2iuwmm63x3utdfsecyxs4hhfgehea3a', NULL, NULL, NULL,
  1774289266, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/timjreynolds.bsky.social/post/3m3rjbb4fe52w', '3m3rjbb4fe52w',
  'timjreynolds.bsky.social', 'Tim Reynolds', 'https://cdn.bsky.app/img/avatar/plain/did:plc:drujo4ts4mpnadbdo5sq4tb4/bafkreiaan5egczc2dcjnurldh4easvoxaaqewavp6pdwxvtih27lfz4nwq',
  'community', 'approved', 'Started playing with obra/superpowers yesterday and my first impression is it''s a step forward when working with Claude Code. Requires you to interact with the agent more but having a clear planning phase with specific outputs at each step really helps.', NULL, NULL,
  'at://did:plc:drujo4ts4mpnadbdo5sq4tb4/app.bsky.feed.post/3m3rjbb4fe52w', 'bafyreigolsgzma7f3utx2qqtsdpsbximvr5fsr3ecvnffnr4tnmrtyoscu', NULL, NULL, NULL,
  1761124738, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/kurtthorn.bsky.social/post/3mbysbnvwsc2e', '3mbysbnvwsc2e',
  'kurtthorn.bsky.social', 'Kurt Thorn', 'https://cdn.bsky.app/img/avatar/plain/did:plc:lgyu4rtnk64c5srb5q6ctc74/bafkreifbuov2n4jxc7mbyw6rtfsqhef3mcnxqt4n2my4z3gam3ukllm36u',
  'community', 'approved', 'I use the superpowers skills (github.com/obra/superpo...) and the Claude code-review and frontend-dev skills but no other specialized tooling.', NULL, NULL,
  'at://did:plc:lgyu4rtnk64c5srb5q6ctc74/app.bsky.feed.post/3mbysbnvwsc2e', 'bafyreidzjlo5mhz6bhl3qf4fhxryzftdjow7xk3kldleold54bf56ghopu', NULL, NULL, NULL,
  1767972003, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/test-driven-development', 'bsky', 'https://bsky.app/profile/msuarz.bsky.social/post/3miwj6atk5c2d', '3miwj6atk5c2d',
  'msuarz.bsky.social', 'mike suarez', 'https://cdn.bsky.app/img/avatar/plain/did:plc:h7hqqj7vcec6lkcrjglddprs/bafkreif4qfv6awgcw75ro2cxtsqehvdestak3s5cyi6y2gkaafjrxyvxka',
  'community', 'approved', 'hey check out some superpowers obra stuff ... it''s semi-official tdd skill approach ... i hope urs is better :) cos comes from tdd world fo reals lol  ... github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:h7hqqj7vcec6lkcrjglddprs/app.bsky.feed.post/3miwj6atk5c2d', 'bafyreidjeyjxnm5bcysoxpinmxos7tjuvx6gnde76c7xt7kugrrzss7z4e', NULL, NULL, NULL,
  1775590087, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/systematic-debugging', 'bsky', 'https://bsky.app/profile/faithfinder.bsky.social/post/3mhgok3zisk2h', '3mhgok3zisk2h',
  'faithfinder.bsky.social', 'Dmitrii Kartashev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f5nzj3rgf4u646dcm5lxk774/bafkreiejn6jvm74mugiu2oewftvgbsgrprs2mnluhdgmffx4viqiadesxi',
  'community', 'approved', 'There is "systematic debugging" skill from @s.ly 
github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:f5nzj3rgf4u646dcm5lxk774/app.bsky.feed.post/3mhgok3zisk2h', 'bafyreia7v53smxpddkuwgegavs5etofumtiylyosbjavool57yfauwrvfm', NULL, NULL, NULL,
  1773946586, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/masnick.com/post/3mgvdh2yrkk2x', '3mgvdh2yrkk2x',
  'masnick.com', 'Mike Masnick', 'https://cdn.bsky.app/img/avatar/plain/did:plc:cak4klqoj3bqgk5rj6b4f5do/bafkreifrr5n5p2ixfbupo3eocykh5jzd67dy2tohi7pzllacainjgkkq5e',
  'community', 'approved', 'Ok. I realize I''m late to the game, but earlier this week I *finally* installed @s.ly''s superpowers to my Claude Code setup and, dang, it really does add superpowers to what already felt like superpowers. I feel like I need to go back and redo everything I''ve done before.

github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:cak4klqoj3bqgk5rj6b4f5do/app.bsky.feed.post/3mgvdh2yrkk2x', 'bafyreih22owksc6cncqvijoa5l7hpdohlmg57ylq7mepvafku5c3ujto5i', NULL, NULL, NULL,
  1773350557, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/brainstorming', 'bsky', 'https://bsky.app/profile/josusanz.bsky.social/post/3mjrsou2fzx2x', '3mjrsou2fzx2x',
  'josusanz.bsky.social', 'Josu Sanz', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kvle2en7cfxritycs4hzm43x/bafkreibnuqjznnysbe2o4bi3ir6izfozuzryfreucom7ea6wxbusepc224',
  'community', 'approved', '14 skills que cambian el flujo completo. Brainstorming socrático, planificación por micro-tareas, TDD real. Claude escribe tests primero, verifica después.

Está aceptado oficialmente en el marketplace de Anthropic.

Se instala así:

claude install-github-tool obra/superpowers', NULL, NULL,
  'at://did:plc:kvle2en7cfxritycs4hzm43x/app.bsky.feed.post/3mjrsou2fzx2x', 'bafyreigs3z33kevzz4b5npvi4xant25nudv62uryhbtbaqf7quveaodmfm', NULL, NULL, NULL,
  1776528020, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/writing-plans', 'bsky', 'https://bsky.app/profile/josusanz.bsky.social/post/3mjrsou2fzx2x', '3mjrsou2fzx2x',
  'josusanz.bsky.social', 'Josu Sanz', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kvle2en7cfxritycs4hzm43x/bafkreibnuqjznnysbe2o4bi3ir6izfozuzryfreucom7ea6wxbusepc224',
  'community', 'approved', '14 skills que cambian el flujo completo. Brainstorming socrático, planificación por micro-tareas, TDD real. Claude escribe tests primero, verifica después.

Está aceptado oficialmente en el marketplace de Anthropic.

Se instala así:

claude install-github-tool obra/superpowers', NULL, NULL,
  'at://did:plc:kvle2en7cfxritycs4hzm43x/app.bsky.feed.post/3mjrsou2fzx2x', 'bafyreigs3z33kevzz4b5npvi4xant25nudv62uryhbtbaqf7quveaodmfm', NULL, NULL, NULL,
  1776528020, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/test-driven-development', 'bsky', 'https://bsky.app/profile/josusanz.bsky.social/post/3mjrsou2fzx2x', '3mjrsou2fzx2x',
  'josusanz.bsky.social', 'Josu Sanz', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kvle2en7cfxritycs4hzm43x/bafkreibnuqjznnysbe2o4bi3ir6izfozuzryfreucom7ea6wxbusepc224',
  'community', 'approved', '14 skills que cambian el flujo completo. Brainstorming socrático, planificación por micro-tareas, TDD real. Claude escribe tests primero, verifica después.

Está aceptado oficialmente en el marketplace de Anthropic.

Se instala así:

claude install-github-tool obra/superpowers', NULL, NULL,
  'at://did:plc:kvle2en7cfxritycs4hzm43x/app.bsky.feed.post/3mjrsou2fzx2x', 'bafyreigs3z33kevzz4b5npvi4xant25nudv62uryhbtbaqf7quveaodmfm', NULL, NULL, NULL,
  1776528020, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/josusanz.bsky.social/post/3mjrsou2fzx2x', '3mjrsou2fzx2x',
  'josusanz.bsky.social', 'Josu Sanz', 'https://cdn.bsky.app/img/avatar/plain/did:plc:kvle2en7cfxritycs4hzm43x/bafkreibnuqjznnysbe2o4bi3ir6izfozuzryfreucom7ea6wxbusepc224',
  'community', 'approved', '14 skills que cambian el flujo completo. Brainstorming socrático, planificación por micro-tareas, TDD real. Claude escribe tests primero, verifica después.

Está aceptado oficialmente en el marketplace de Anthropic.

Se instala así:

claude install-github-tool obra/superpowers', NULL, NULL,
  'at://did:plc:kvle2en7cfxritycs4hzm43x/app.bsky.feed.post/3mjrsou2fzx2x', 'bafyreigs3z33kevzz4b5npvi4xant25nudv62uryhbtbaqf7quveaodmfm', NULL, NULL, NULL,
  1776528020, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/tdd', 'bsky', 'https://bsky.app/profile/nearestnabors.com/post/3mji4ba3mqx2b', '3mji4ba3mqx2b',
  'nearestnabors.com', 'R "Nearest" Nabors', 'https://cdn.bsky.app/img/avatar/plain/did:plc:vcwm64x6kyej6yz4cpemuch6/bafkreigaxcfajm7etxmxga7t6qku6d4nbndnymlqcgtcqcsruw2bsdkm6u',
  'community', 'approved', '@Pocock.com''s skills repo is such an asset for loop engineers: github.com/mattpocock/s... 

Check out grill-me, ubiquitous-language, tdd, improve-codebase-architecture. Get the full rundown on how to use in your agentic coding flow: www.youtube.com/watch?v=O_IM...', NULL, NULL,
  'at://did:plc:vcwm64x6kyej6yz4cpemuch6/app.bsky.feed.post/3mji4ba3mqx2b', 'bafyreicrlnkarnsifzvjkrdb7dlu24jaselfrub63kjv4qdg3hueghk3qi', NULL, NULL, NULL,
  1776194703, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'bsky', 'https://bsky.app/profile/nearestnabors.com/post/3mji4ba3mqx2b', '3mji4ba3mqx2b',
  'nearestnabors.com', 'R "Nearest" Nabors', 'https://cdn.bsky.app/img/avatar/plain/did:plc:vcwm64x6kyej6yz4cpemuch6/bafkreigaxcfajm7etxmxga7t6qku6d4nbndnymlqcgtcqcsruw2bsdkm6u',
  'community', 'approved', '@Pocock.com''s skills repo is such an asset for loop engineers: github.com/mattpocock/s... 

Check out grill-me, ubiquitous-language, tdd, improve-codebase-architecture. Get the full rundown on how to use in your agentic coding flow: www.youtube.com/watch?v=O_IM...', NULL, NULL,
  'at://did:plc:vcwm64x6kyej6yz4cpemuch6/app.bsky.feed.post/3mji4ba3mqx2b', 'bafyreicrlnkarnsifzvjkrdb7dlu24jaselfrub63kjv4qdg3hueghk3qi', NULL, NULL, NULL,
  1776194703, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/request-refactor-plan', 'bsky', 'https://bsky.app/profile/nearestnabors.com/post/3mji4ba3mqx2b', '3mji4ba3mqx2b',
  'nearestnabors.com', 'R "Nearest" Nabors', 'https://cdn.bsky.app/img/avatar/plain/did:plc:vcwm64x6kyej6yz4cpemuch6/bafkreigaxcfajm7etxmxga7t6qku6d4nbndnymlqcgtcqcsruw2bsdkm6u',
  'community', 'approved', '@Pocock.com''s skills repo is such an asset for loop engineers: github.com/mattpocock/s... 

Check out grill-me, ubiquitous-language, tdd, improve-codebase-architecture. Get the full rundown on how to use in your agentic coding flow: www.youtube.com/watch?v=O_IM...', NULL, NULL,
  'at://did:plc:vcwm64x6kyej6yz4cpemuch6/app.bsky.feed.post/3mji4ba3mqx2b', 'bafyreicrlnkarnsifzvjkrdb7dlu24jaselfrub63kjv4qdg3hueghk3qi', NULL, NULL, NULL,
  1776194703, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-prd', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedrvq7f23', '3mkbedrvq7f23',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', 'npx skills@latest add mattpocock/skills/grill-me
npx skills@latest add mattpocock/skills/write-a-prd
🌐 github.com/mattpocock/...', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedrvq7f23', 'bafyreif5twg4wonfmy6ecsounqpsvzvw2rpgphelmmztlibbak4h562sgy', NULL, NULL, NULL,
  1777062372, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/tdd', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/git-guardrails-claude-code', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/design-an-interface', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/request-refactor-plan', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/setup-pre-commit', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/edit-article', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/migrate-to-shoehorn', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/prd-to-plan', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-prd', 'bsky', 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b', '3mkbedpbqxr2b',
  'michabbb.bsky.social', 'Micha the DevOp', 'https://cdn.bsky.app/img/avatar/plain/did:plc:i34vxgn34hwh3ocvbjxh7j4k/bafkreigool3rte5r72kopkeep7ajgwejawu22pkfigpcguxsrndetoouxq',
  'community', 'approved', '#MattPocock open-sourced his personal #ClaudeCode skills — 17 structured AI workflow definitions. Not prompts. Real dev processes encoded as runbooks for your AI coding agent.

 #AI #TypeScript #developer
🧵 👇', NULL, NULL,
  'at://did:plc:i34vxgn34hwh3ocvbjxh7j4k/app.bsky.feed.post/3mkbedpbqxr2b', 'bafyreiawzuynayj2jgofd2yojomdrq3m4xroywskm7woixh6ompesdt5mm', NULL, NULL, NULL,
  1777062370, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vue', 'bsky', 'https://bsky.app/profile/shun91.bsky.social/post/3mdm7rukrzz24', '3mdm7rukrzz24',
  'shun91.bsky.social', 'Shun KWHR', 'https://cdn.bsky.app/img/avatar/plain/did:plc:sixp2ws2zjciyqvlaruyvitu/bafkreibhhsudhk2lsrfeo7zder66j5oa2hugq2cbxtvv44mhj72sapd6qe',
  'community', 'approved', 'これは気になる👀

"このコレクションは、主にVite/Nuxtを扱っている方のためのワンストップコレクションとなることを目指しています。様々なソースから、様々な範囲のスキルを網羅しています。"

antfu/skills: Anthony Fu''s curated collection of agent skills. https://github.com/antfu/skills', NULL, NULL,
  'at://did:plc:sixp2ws2zjciyqvlaruyvitu/app.bsky.feed.post/3mdm7rukrzz24', 'bafyreiehcqbtajsgirunmb4bfzevkxmvorndn5dy6554mpbbnxp2hib4v4', NULL, NULL, NULL,
  1769738852, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/nuxt', 'bsky', 'https://bsky.app/profile/shun91.bsky.social/post/3mdm7rukrzz24', '3mdm7rukrzz24',
  'shun91.bsky.social', 'Shun KWHR', 'https://cdn.bsky.app/img/avatar/plain/did:plc:sixp2ws2zjciyqvlaruyvitu/bafkreibhhsudhk2lsrfeo7zder66j5oa2hugq2cbxtvv44mhj72sapd6qe',
  'community', 'approved', 'これは気になる👀

"このコレクションは、主にVite/Nuxtを扱っている方のためのワンストップコレクションとなることを目指しています。様々なソースから、様々な範囲のスキルを網羅しています。"

antfu/skills: Anthony Fu''s curated collection of agent skills. https://github.com/antfu/skills', NULL, NULL,
  'at://did:plc:sixp2ws2zjciyqvlaruyvitu/app.bsky.feed.post/3mdm7rukrzz24', 'bafyreiehcqbtajsgirunmb4bfzevkxmvorndn5dy6554mpbbnxp2hib4v4', NULL, NULL, NULL,
  1769738852, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vite', 'bsky', 'https://bsky.app/profile/shun91.bsky.social/post/3mdm7rukrzz24', '3mdm7rukrzz24',
  'shun91.bsky.social', 'Shun KWHR', 'https://cdn.bsky.app/img/avatar/plain/did:plc:sixp2ws2zjciyqvlaruyvitu/bafkreibhhsudhk2lsrfeo7zder66j5oa2hugq2cbxtvv44mhj72sapd6qe',
  'community', 'approved', 'これは気になる👀

"このコレクションは、主にVite/Nuxtを扱っている方のためのワンストップコレクションとなることを目指しています。様々なソースから、様々な範囲のスキルを網羅しています。"

antfu/skills: Anthony Fu''s curated collection of agent skills. https://github.com/antfu/skills', NULL, NULL,
  'at://did:plc:sixp2ws2zjciyqvlaruyvitu/app.bsky.feed.post/3mdm7rukrzz24', 'bafyreiehcqbtajsgirunmb4bfzevkxmvorndn5dy6554mpbbnxp2hib4v4', NULL, NULL, NULL,
  1769738852, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/vitest', 'bsky', 'https://bsky.app/profile/shun91.bsky.social/post/3mdm7rukrzz24', '3mdm7rukrzz24',
  'shun91.bsky.social', 'Shun KWHR', 'https://cdn.bsky.app/img/avatar/plain/did:plc:sixp2ws2zjciyqvlaruyvitu/bafkreibhhsudhk2lsrfeo7zder66j5oa2hugq2cbxtvv44mhj72sapd6qe',
  'community', 'approved', 'これは気になる👀

"このコレクションは、主にVite/Nuxtを扱っている方のためのワンストップコレクションとなることを目指しています。様々なソースから、様々な範囲のスキルを網羅しています。"

antfu/skills: Anthony Fu''s curated collection of agent skills. https://github.com/antfu/skills', NULL, NULL,
  'at://did:plc:sixp2ws2zjciyqvlaruyvitu/app.bsky.feed.post/3mdm7rukrzz24', 'bafyreiehcqbtajsgirunmb4bfzevkxmvorndn5dy6554mpbbnxp2hib4v4', NULL, NULL, NULL,
  1769738852, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'antfu/pnpm', 'bsky', 'https://bsky.app/profile/shun91.bsky.social/post/3mdm7rukrzz24', '3mdm7rukrzz24',
  'shun91.bsky.social', 'Shun KWHR', 'https://cdn.bsky.app/img/avatar/plain/did:plc:sixp2ws2zjciyqvlaruyvitu/bafkreibhhsudhk2lsrfeo7zder66j5oa2hugq2cbxtvv44mhj72sapd6qe',
  'community', 'approved', 'これは気になる👀

"このコレクションは、主にVite/Nuxtを扱っている方のためのワンストップコレクションとなることを目指しています。様々なソースから、様々な範囲のスキルを網羅しています。"

antfu/skills: Anthony Fu''s curated collection of agent skills. https://github.com/antfu/skills', NULL, NULL,
  'at://did:plc:sixp2ws2zjciyqvlaruyvitu/app.bsky.feed.post/3mdm7rukrzz24', 'bafyreiehcqbtajsgirunmb4bfzevkxmvorndn5dy6554mpbbnxp2hib4v4', NULL, NULL, NULL,
  1769738852, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/simon.fedi.simonwillison.net.ap.brid.gy/post/3m2utitb6kx52', '3m2utitb6kx52',
  'simon.fedi.simonwillison.net.ap.brid.gy', 'Simon Willison', 'https://cdn.bsky.app/img/avatar/plain/did:plc:mro7axagquvjt63foaqzddjx/bafkreigtu7mgutjjn5uyghivylwfak6s2ivbzsoe55mkfhkewzkqmuuqwq',
  'community', 'approved', 'This is a wildly creative set of customizations for Claude Code, using the new plugin system they just released. There are SO many fascinating ideas in this! Strongly recommend reading it and then spending some time exploring the accompanying repo: https://github.com/obra/superpowers […]', NULL, NULL,
  'at://did:plc:mro7axagquvjt63foaqzddjx/app.bsky.feed.post/3m2utitb6kx52', 'bafyreial4zu2h6pkyf253iku323txt7swafiz4nnji5btebyz3empxulpe', NULL, NULL, NULL,
  1760139259, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/kevinverre.bsky.social/post/3mewdrzf5n22a', '3mewdrzf5n22a',
  'kevinverre.bsky.social', 'Kevin Verre', 'https://cdn.bsky.app/img/avatar/plain/did:plc:xqggtuh7ll6z4yffzqjjtslj/bafkreia4od4i25i35pemi3nptpguxgmtvdy3zby3ewnzjwlulsi5rbrvtu',
  'community', 'approved', 'Shout out to Jesse Vincent. I really like the open source Obra Superpowers plugin w/ Claude Code. It guides the AI to write code more effectively. It''s far from perfect. But it has a lot of good ideas. I hope people continue to build cool stuff like that. github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:xqggtuh7ll6z4yffzqjjtslj/app.bsky.feed.post/3mewdrzf5n22a', 'bafyreib4b7zpqtnedrszjznlynskjvacqrgxjsapdgfoko6mzxbiwryrdq', NULL, NULL, NULL,
  1771186261, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/markphelps.github.io/post/3maf4k42k3g2n', '3maf4k42k3g2n',
  'markphelps.github.io', 'Mark Phelps', 'https://cdn.bsky.app/img/avatar/plain/did:plc:jkbv5vwg2uhmr6rfnuvs2ntz/bafkreiafmghlunfvtc6bxibfwx4jube36iomnm7z7avtss55si7cxpqb5i',
  'community', 'approved', 'Really digging these superpowers Claude skills a co-worker showed me today

https://github.com/obra/superpowers

what Claude code skills or plugins are you using?', NULL, NULL,
  'at://did:plc:jkbv5vwg2uhmr6rfnuvs2ntz/app.bsky.feed.post/3maf4k42k3g2n', 'bafyreibb46cwuly6v4dj3ao5u7ex4qr3xtw55kmgbv3bntklsoww5t6qmu', NULL, NULL, NULL,
  1766196317, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/writing-plans', 'bsky', 'https://bsky.app/profile/markphelps.github.io/post/3mbcdwdle5u2u', '3mbcdwdle5u2u',
  'markphelps.github.io', 'Mark Phelps', 'https://cdn.bsky.app/img/avatar/plain/did:plc:jkbv5vwg2uhmr6rfnuvs2ntz/bafkreiafmghlunfvtc6bxibfwx4jube36iomnm7z7avtss55si7cxpqb5i',
  'community', 'approved', 'create subplans for large feature work before touching any code. this one for Claude Code is a game-changer: https://github.com/obra/superpowers

Add a task tracking system like https://github.com/steveyegge/beads to track bugs, future enhancements, etc.

You can now ship like a team of 5+', NULL, NULL,
  'at://did:plc:jkbv5vwg2uhmr6rfnuvs2ntz/app.bsky.feed.post/3mbcdwdle5u2u', 'bafyreiag3qtayixikb2qq2cqsr6mczn6iqlee2pkt33vh7nfialhztewwu', NULL, NULL, NULL,
  1767200676, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/executing-plans', 'bsky', 'https://bsky.app/profile/markphelps.github.io/post/3mbcdwdle5u2u', '3mbcdwdle5u2u',
  'markphelps.github.io', 'Mark Phelps', 'https://cdn.bsky.app/img/avatar/plain/did:plc:jkbv5vwg2uhmr6rfnuvs2ntz/bafkreiafmghlunfvtc6bxibfwx4jube36iomnm7z7avtss55si7cxpqb5i',
  'community', 'approved', 'create subplans for large feature work before touching any code. this one for Claude Code is a game-changer: https://github.com/obra/superpowers

Add a task tracking system like https://github.com/steveyegge/beads to track bugs, future enhancements, etc.

You can now ship like a team of 5+', NULL, NULL,
  'at://did:plc:jkbv5vwg2uhmr6rfnuvs2ntz/app.bsky.feed.post/3mbcdwdle5u2u', 'bafyreiag3qtayixikb2qq2cqsr6mczn6iqlee2pkt33vh7nfialhztewwu', NULL, NULL, NULL,
  1767200676, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/brainstorming', 'bsky', 'https://bsky.app/profile/whisk.bsky.social/post/3mc2gplemec2i', '3mc2gplemec2i',
  'whisk.bsky.social', 'Cargo Occultist', 'https://cdn.bsky.app/img/avatar/plain/did:plc:viplyyrs47ewnkkrm4edvefn/bafkreigoqrduxpnymtv3fawg72eck64q5btvrwfqwdpwisqksfc5hoqitm',
  'community', 'approved', 'the superpowers ”brainstorming“ skill has been nice as a structured approach to challenge/shape initial planning github.com/obra/superpo...', NULL, NULL,
  'at://did:plc:viplyyrs47ewnkkrm4edvefn/app.bsky.feed.post/3mc2gplemec2i', 'bafyreifgxdsf3niwd3yzf4f4dgapthbiofzmurzoe6hpbahvdpivxyosau', NULL, NULL, NULL,
  1768028305, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'obra/using-superpowers', 'bsky', 'https://bsky.app/profile/projectautonomy.substack.com/post/3mdxnsfyky22a', '3mdxnsfyky22a',
  'projectautonomy.substack.com', 'Luke Wilson', 'https://cdn.bsky.app/img/avatar/plain/did:plc:mx7cubrbsqkrzdc72xkg4onp/bafkreiffzbnwcnmprkvbic3b72qtyumzpcagiv76odhkg6fwu7nbidlvkm',
  'community', 'approved', 'You have to try Superpowers for Claude Code: github.com/obra/superpo...

This is doing SO WELL for my latest project.', NULL, NULL,
  'at://did:plc:mx7cubrbsqkrzdc72xkg4onp/app.bsky.feed.post/3mdxnsfyky22a', 'bafyreieohpi25653vhfya5sfcasak7t565llrze3ot4nu7p65b6wxzijme', NULL, NULL, NULL,
  1770131860, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/tdd', 'bsky', 'https://bsky.app/profile/sergdort.bsky.social/post/3mj5dle2qn22l', '3mj5dle2qn22l',
  'sergdort.bsky.social', 'Serg Dort', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ms6ratljyjjgglxyq2r4p4gq/bafkreih2o73m6yqh6qwuvfruxru4wxrndg5tptcs7el755p6sjut7yoyha',
  'community', 'approved', 'Just wanna share two skills that were very impressive for me in the pre planning session so the agent can get the quality context. Credits to @mattpocock.com  for the OG idea and his video youtu.be/EJyuu6zlQCg very insightful.

github.com/sergdort/dot...', NULL, NULL,
  'at://did:plc:ms6ratljyjjgglxyq2r4p4gq/app.bsky.feed.post/3mj5dle2qn22l', 'bafyreiep3b2suqpzqirar6dajrf26iui5faryxcjqgc44tgemz2b2basyu', NULL, NULL, NULL,
  1775824602, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'bsky', 'https://bsky.app/profile/sergdort.bsky.social/post/3mj5dle2qn22l', '3mj5dle2qn22l',
  'sergdort.bsky.social', 'Serg Dort', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ms6ratljyjjgglxyq2r4p4gq/bafkreih2o73m6yqh6qwuvfruxru4wxrndg5tptcs7el755p6sjut7yoyha',
  'community', 'approved', 'Just wanna share two skills that were very impressive for me in the pre planning session so the agent can get the quality context. Credits to @mattpocock.com  for the OG idea and his video youtu.be/EJyuu6zlQCg very insightful.

github.com/sergdort/dot...', NULL, NULL,
  'at://did:plc:ms6ratljyjjgglxyq2r4p4gq/app.bsky.feed.post/3mj5dle2qn22l', 'bafyreiep3b2suqpzqirar6dajrf26iui5faryxcjqgc44tgemz2b2basyu', NULL, NULL, NULL,
  1775824602, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/design-an-interface', 'bsky', 'https://bsky.app/profile/sergdort.bsky.social/post/3mj5dle2qn22l', '3mj5dle2qn22l',
  'sergdort.bsky.social', 'Serg Dort', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ms6ratljyjjgglxyq2r4p4gq/bafkreih2o73m6yqh6qwuvfruxru4wxrndg5tptcs7el755p6sjut7yoyha',
  'community', 'approved', 'Just wanna share two skills that were very impressive for me in the pre planning session so the agent can get the quality context. Credits to @mattpocock.com  for the OG idea and his video youtu.be/EJyuu6zlQCg very insightful.

github.com/sergdort/dot...', NULL, NULL,
  'at://did:plc:ms6ratljyjjgglxyq2r4p4gq/app.bsky.feed.post/3mj5dle2qn22l', 'bafyreiep3b2suqpzqirar6dajrf26iui5faryxcjqgc44tgemz2b2basyu', NULL, NULL, NULL,
  1775824602, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/tdd', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/git-guardrails-claude-code', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/design-an-interface', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/request-refactor-plan', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/setup-pre-commit', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/edit-article', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/migrate-to-shoehorn', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/prd-to-plan', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-prd', 'bsky', 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23', '3mjcytclxxc23',
  'ianpatterson.com', 'Ian', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qog6nsef4qorna5p2gphot37/bafkreih4fy34npwaatvck42dmm2l6z7lvjwhvmqxpuhdwpimwxmofuocva',
  'community', 'approved', 'Sometimes with AI reporting comes across other peoples ''skills'' theyre using with Claude/whatever. 
Two sets today that I really want to take a look through 
- gstack - two weeks old, making waves: github.com/garrytan/gst...
- Matt Pocock''s skills - Oxford Typescript guy
 github.com/mattpocock/s...', NULL, NULL,
  'at://did:plc:qog6nsef4qorna5p2gphot37/app.bsky.feed.post/3mjcytclxxc23', 'bafyreicp3oftiu2gzzb3de3npfgvbm5hqqzrbatzchh6nhw45dkhbatdnm', NULL, NULL, NULL,
  1776019216, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/request-refactor-plan', 'bsky', 'https://bsky.app/profile/timo.social.hetzel.net.ap.brid.gy/post/3mhqngfkdppp2', '3mhqngfkdppp2',
  'timo.social.hetzel.net.ap.brid.gy', 'Timo Hetzel', 'https://cdn.bsky.app/img/avatar/plain/did:plc:vdcz7h6ig36ejktinroof2ni/bafkreiatglcwe5tzvvfcm2wrphjnvr5nlevo7gjuji2ol27uzzdrq33uim',
  'community', 'approved', 'Diese /grill-me Skill ist nicht blöd. Vor dem Turn alle offenen Fragen klären spart Zeit und Tokens.

Der Kollege hat auch ein paar interessante Videos zu seinem Workflow auf YouTube. https://github.com/mattpocock/skills/blob/main/grill-me/SKILL.md', NULL, NULL,
  'at://did:plc:vdcz7h6ig36ejktinroof2ni/app.bsky.feed.post/3mhqngfkdppp2', 'bafyreigyn2jzpja2undypyvjenjj5mowleqf3eellzl4hh3egltkaw3pc4', NULL, NULL, NULL,
  1774288966, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'bsky', 'https://bsky.app/profile/timo.social.hetzel.net.ap.brid.gy/post/3mhqngfkdppp2', '3mhqngfkdppp2',
  'timo.social.hetzel.net.ap.brid.gy', 'Timo Hetzel', 'https://cdn.bsky.app/img/avatar/plain/did:plc:vdcz7h6ig36ejktinroof2ni/bafkreiatglcwe5tzvvfcm2wrphjnvr5nlevo7gjuji2ol27uzzdrq33uim',
  'community', 'approved', 'Diese /grill-me Skill ist nicht blöd. Vor dem Turn alle offenen Fragen klären spart Zeit und Tokens.

Der Kollege hat auch ein paar interessante Videos zu seinem Workflow auf YouTube. https://github.com/mattpocock/skills/blob/main/grill-me/SKILL.md', NULL, NULL,
  'at://did:plc:vdcz7h6ig36ejktinroof2ni/app.bsky.feed.post/3mhqngfkdppp2', 'bafyreigyn2jzpja2undypyvjenjj5mowleqf3eellzl4hh3egltkaw3pc4', NULL, NULL, NULL,
  1774288966, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/tdd', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/git-guardrails-claude-code', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-skill', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/design-an-interface', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/request-refactor-plan', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/setup-pre-commit', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/edit-article', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/migrate-to-shoehorn', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/prd-to-plan', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'mattpocock/write-a-prd', 'bsky', 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23', '3mk6mfnxghc23',
  'ilya.cyborgs.work', 'Ilya Vasilyev', 'https://cdn.bsky.app/img/avatar/plain/did:plc:pim3q33wdeqll45hmq2neenc/bafkreib7cbzhuqakriqdrrb2k6lauj2sjcxz2q5ajs5bb4cyjrmb5w6leq',
  'community', 'approved', 'while engineers are crafting their systems of agent skills to find better human-machine collaboration patterns, and the best of them push humans to do more work (like @mattpocock.com showed at @aidotengineer.bsky.social ), what can other knowledge workers do today to progress in the same way?', NULL, NULL,
  'at://did:plc:pim3q33wdeqll45hmq2neenc/app.bsky.feed.post/3mk6mfnxghc23', 'bafyreiheti4jrue3tfn2fcpzvzfebgh3jh27jx4mocapul4mdmrij6onmi', NULL, NULL, NULL,
  1776967946, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t', '3mhcfu7gyca2t',
  'ai-nerd.bsky.social', 'ai-nerd.bsky.social', 'https://cdn.bsky.app/img/avatar/plain/did:plc:qw3rlslzugmkitgpr5p4nned/bafkreiamk4evpl7xalvnxcqdrxkpaupoanbs572vkaqomcf5run2ag2h7q',
  'community', 'approved', 'the YC CEO open-sourced his Claude Code setup and half the internet called it god mode while the other half said it is just prompt files in a repo https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:qw3rlslzugmkitgpr5p4nned/app.bsky.feed.post/3mhcfu7gyca2t', 'bafyreifbveriu7jtgttm7yiddploksx4ipa44h2nzua6ak3pmn5z4uaevm', NULL, NULL, NULL,
  1773799822, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/camilleroux.com/post/3mgyxjunpgh2n', '3mgyxjunpgh2n',
  'camilleroux.com', 'Camille Roux', 'https://cdn.bsky.app/img/avatar/plain/did:plc:5aumv6xsxxacaerhrubj322g/bafkreihuqgim6n2nysuyjqawgqrzipdjsw5bpqi2biufkltrjlud2wxahu',
  'community', 'approved', 'Garry Tan (CEO de Y Combinator) vient de publier gstack : des commandes pour transformer Claude Code en équipe spécialisée. 
/plan-ceo-review challenge le produit, /plan-eng-review l''archi, /qa teste l''app...
https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:5aumv6xsxxacaerhrubj322g/app.bsky.feed.post/3mgyxjunpgh2n', 'bafyreiebes7g4ov2uthl7hhevbs52q2scflwjk5ypbano67bcoyghpdnjq', NULL, NULL, NULL,
  1773475205, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/camilleroux.com/post/3mgyxjunpgh2n', '3mgyxjunpgh2n',
  'camilleroux.com', 'Camille Roux', 'https://cdn.bsky.app/img/avatar/plain/did:plc:5aumv6xsxxacaerhrubj322g/bafkreihuqgim6n2nysuyjqawgqrzipdjsw5bpqi2biufkltrjlud2wxahu',
  'community', 'approved', 'Garry Tan (CEO de Y Combinator) vient de publier gstack : des commandes pour transformer Claude Code en équipe spécialisée. 
/plan-ceo-review challenge le produit, /plan-eng-review l''archi, /qa teste l''app...
https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:5aumv6xsxxacaerhrubj322g/app.bsky.feed.post/3mgyxjunpgh2n', 'bafyreiebes7g4ov2uthl7hhevbs52q2scflwjk5ypbano67bcoyghpdnjq', NULL, NULL, NULL,
  1773475205, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/camilleroux.com/post/3mgyxjunpgh2n', '3mgyxjunpgh2n',
  'camilleroux.com', 'Camille Roux', 'https://cdn.bsky.app/img/avatar/plain/did:plc:5aumv6xsxxacaerhrubj322g/bafkreihuqgim6n2nysuyjqawgqrzipdjsw5bpqi2biufkltrjlud2wxahu',
  'community', 'approved', 'Garry Tan (CEO de Y Combinator) vient de publier gstack : des commandes pour transformer Claude Code en équipe spécialisée. 
/plan-ceo-review challenge le produit, /plan-eng-review l''archi, /qa teste l''app...
https://github.com/garrytan/gstack', NULL, NULL,
  'at://did:plc:5aumv6xsxxacaerhrubj322g/app.bsky.feed.post/3mgyxjunpgh2n', 'bafyreiebes7g4ov2uthl7hhevbs52q2scflwjk5ypbano67bcoyghpdnjq', NULL, NULL, NULL,
  1773475205, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f', '3mhxplferhc2f',
  'mayankvora.bsky.social', 'MadAIMan', 'https://cdn.bsky.app/img/avatar/plain/did:plc:tsoxawbdtpzzr54pdbquw3zo/bafkreicwynrg6zhogec6tjiobfedvw252w46xe2baiima5kx5dbxt7i3n4',
  'community', 'approved', 'It''s called gstack, and it turns Claude Code into a full virtual engineering team a CEO who rethinks the product, an eng manager who locks architecture, a designer who catches AI slop, a QA lead who opens a real browser, and a security officer who runs OWASP audits.', NULL, NULL,
  'at://did:plc:tsoxawbdtpzzr54pdbquw3zo/app.bsky.feed.post/3mhxplferhc2f', 'bafyreifhcu2t5fkbn54pez7sj5dzd3vxd5ah3u4h7rr6zesxncwbt33kba', NULL, NULL, NULL,
  1774531818, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s', '3mjqmwhj6272s',
  'theo-t3gg.bsky.social', 'Theo - t3.gg {bot}', 'https://cdn.bsky.app/img/avatar/plain/did:plc:bvsrpph72nmygfwlrzb5xkfm/bafkreifwtmfzdhegxkz375i4ker4sabdq4a4ok7jacgswsiltfwmwsfryu',
  'community', 'approved', '00:02:50 - Is Mythos legit?
00:24:20 - Post-AI Uncle Bob @unclebobmartin 
00:36:23 - Praising Claude Code a bit
00:40:49 - GStack is actually good @garrytan 
00:51:07 - Everything should be a md file

Video: https://twitter.com/theo/status/2045362303525355652 (2/2)', NULL, NULL,
  'at://did:plc:bvsrpph72nmygfwlrzb5xkfm/app.bsky.feed.post/3mjqmwhj6272s', 'bafyreic3j75yh4xrdd4usezody3wvay546i33cvj3o56d2ss64iqwhlx7y', NULL, NULL, NULL,
  1776487349, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v', '3mhdd4byna22v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', 'Garry Tan, CEO of Y Combinator, has open-sourced his Claude Code setup, called gstack. This setup allows him to write over 10,000 lines of production code per day, with the help of 13 virtual specialists.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4byna22v', 'bafyreifsmpecpdpattzytktm6qkj277revycljlpgbjpw6vfs7ju2dsege', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v', '3mhdd4bz2vk2v',
  'rasitds.bsky.social', 'Rasit', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f6pkmahjixp6jrzz2g7iu6uw/bafkreifeflpauiedy76u7fsdqda7q5bo5dpfhdpxgechwgc4ioppxki7ym',
  'community', 'approved', '* gstack is a set of 13 opinionated tools that serve as CEO, Eng Manager, Release Manager, Doc Engineer, and QA.
* It uses Claude Code to automate tasks such as planning, designing, reviewing, and shipping code.', NULL, NULL,
  'at://did:plc:f6pkmahjixp6jrzz2g7iu6uw/app.bsky.feed.post/3mhdd4bz2vk2v', 'bafyreigl3pl4oxhdgvadwex6oowltpakcfxyfvr7qphozadzuc3nokdnlu', NULL, NULL, NULL,
  1773831232, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x', '3mhcsxe7gbf2x',
  'rankednews.bsky.social', 'Ranked News', 'https://cdn.bsky.app/img/avatar/plain/did:plc:42han5exrxyrgdsbwosrp7sy/bafkreibydrolhjhccnpmgvspus4cymmpc7rzzhiqisefvw6v5ehqbjeee4',
  'community', 'approved', 'Why Garry Tan’s Claude Code setup has gotten so much love, and hate: Y Combinator CEO Garry Tan has garnered significant attention, both positive and negative, for his "gstack" setup, a collection of six "opinionated" Claude Code skills designed to enhance AI agent pr… https://ranked.news/340748?u=b', NULL, NULL,
  'at://did:plc:42han5exrxyrgdsbwosrp7sy/app.bsky.feed.post/3mhcsxe7gbf2x', 'bafyreicqoopewbluwwr4yu5ibaiyiljbs6zxscrmpx2ayu3x53ymr5jcee', NULL, NULL, NULL,
  1773813886, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/qa', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/ship', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-ceo-review', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-eng-review', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/plan-design-review', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-review', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/design-html', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/investigate', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/review', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/health', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/office-hours', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/codex', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/autoplan', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/cso', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/devex-review', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/setup-deploy', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/land-and-deploy', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'garrytan/gstack-upgrade', 'bsky', 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b', '3mifm65zrt52b',
  'genticnews.bsky.social', '', 'https://cdn.bsky.app/img/avatar/plain/did:plc:ydqfebgkofkzvkl6k33m7bmy/bafkreiffdr6u4o6kio6gcxeajgt7ti5rukfmaydfbcupjw2k4ejsth72bm',
  'community', 'approved', 'Garry Tan''s gstack: Install This 56k-Star ''Virtual Team'' for Claude Code

YC CEO Garry Tan open-sourced gstack, a pack of slash commands that turns Claude Code into a structured team of specialists, claiming it helps ship 10k-20k lin...

https://gentic.news/article/garry-tan-s-gstack-install-this', NULL, NULL,
  'at://did:plc:ydqfebgkofkzvkl6k33m7bmy/app.bsky.feed.post/3mifm65zrt52b', 'bafyreigkpzki6ll6unb4keug72j5w335vyb323vxijdur2b4qvbn26jc7m', NULL, NULL, NULL,
  1775009190, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'shadcn/shadcn', 'bsky', 'https://bsky.app/profile/andypeacock.bsky.social/post/3m5ywmp5sqf26', '3m5ywmp5sqf26',
  'andypeacock.bsky.social', 'Andy Peacock', 'https://cdn.bsky.app/img/avatar/plain/did:plc:f33tkwdeuh4vym46vzcnphhv/bafkreiagrbja72wbbfxw2oz5kddowfnl4h3bnv5or7w2idha6slosknrhm',
  'community', 'approved', 'Wrote a skill for Claude Code for working with shadcn, as there are a few things that it just keeps getting wrong.

Couldn''t get it to recognise the skill.

Turn out that SKILL.md and SKILLL.md are not the same thing :-)', NULL, NULL,
  'at://did:plc:f33tkwdeuh4vym46vzcnphhv/app.bsky.feed.post/3m5ywmp5sqf26', 'bafyreicctovvg7tzu3erjtmns7v52mpqujgpjejcqfareap3dixrawc5ni', NULL, NULL, NULL,
  1763578622, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'shadcn/shadcn', 'bsky', 'https://bsky.app/profile/jefferyharrell.bsky.social/post/3lxpa2zpbwc2b', '3lxpa2zpbwc2b',
  'jefferyharrell.bsky.social', 'jeffery --dangerously-skip-permissions', 'https://cdn.bsky.app/img/avatar/plain/did:plc:h6tcd37yr7vk33uuisbidqvw/bafkreifbs4e2s3mtcrsajoxi547ozkpm3i274buddyg7kzvefm523b22aq',
  'community', 'approved', 'In advance of the birthday celebration, work continues on Penpal Redux. Did you guys know there''s a shadcn/ui MCP? There''s one for assistant-ui too. They plug right in to Claude Code. This is gonna make doing the hateful frontend much easier. I hope.', NULL, NULL,
  'at://did:plc:h6tcd37yr7vk33uuisbidqvw/app.bsky.feed.post/3lxpa2zpbwc2b', 'bafyreig3apokqaaof4nk3bik3aggho2f4mahgms4fg3j4d7w2c4q6ehwje', NULL, NULL, NULL,
  1756648099, 1777386963, 'seed-script', 1777386963
);
INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  'shadcn/shadcn', 'bsky', 'https://bsky.app/profile/mxkaske.dev/post/3mh4kpcpo5c2i', '3mh4kpcpo5c2i',
  'mxkaske.dev', 'Maximilian Kaske', 'https://cdn.bsky.app/img/avatar/plain/did:plc:lyvb2atiu6loowce2rdkspqy/bafkreig4gk4sm6pe3jqt4ho3u3dfg3jcfiskdysoq3bxkr6texdjoyuuya',
  'community', 'approved', 'Stop hand-coding data tables. 

We''ve refactored the code base to make it easier. Including a shadcn registry and an agent SKILL[.]md.

→ logs.run/docs

It''s not a library. It''s a playbook.', NULL, NULL,
  'at://did:plc:lyvb2atiu6loowce2rdkspqy/app.bsky.feed.post/3mh4kpcpo5c2i', 'bafyreicspyp6xb622mehx46jneuygjo35msiyorvevep6kjn4fjca4k5oy', NULL, NULL, NULL,
  1773598868, 1777386963, 'seed-script', 1777386963
);
