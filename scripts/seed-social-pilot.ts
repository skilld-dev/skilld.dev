#!/usr/bin/env tsx
/**
 * Seed curated testimonials for the social-posts pilot.
 * Reddit threads from r/ClaudeAI + Bluesky author/community posts.
 *
 * Usage:
 *   npx tsx scripts/seed-social-pilot.ts > scripts/seed-social-pilot.sql
 *   npx wrangler d1 execute skilld-db --local --file=scripts/seed-social-pilot.sql
 *   npx wrangler d1 execute skilld-db --remote --file=scripts/seed-social-pilot.sql
 */
import { Agent } from '@atproto/api'

interface RedditEntry {
  platform: 'reddit'
  url: string
  skillSlugs: string[]
  role?: 'author' | 'community'
}

interface BskyEntry {
  platform: 'bsky'
  url: string
  skillSlugs: string[]
  role: 'author' | 'community'
}

type Entry = RedditEntry | BskyEntry

// Slugs in skilld registry follow `{owner}/{skill-name}` (no repo segment).
// All obra superpowers skills live under owner=obra (repo=superpowers).
const OBRA_CORE = [
  'obra/brainstorming',
  'obra/writing-plans',
  'obra/executing-plans',
  'obra/systematic-debugging',
  'obra/test-driven-development',
  'obra/using-superpowers',
  'obra/using-git-worktrees',
  'obra/requesting-code-review',
  'obra/receiving-code-review',
  'obra/subagent-driven-development',
  'obra/verification-before-completion',
  'obra/writing-skills',
]

const ANTFU_CORE = [
  'antfu/vite',
  'antfu/vitest',
  'antfu/vue',
  'antfu/vue-best-practices',
  'antfu/vueuse-functions',
  'antfu/pnpm',
  'antfu/pinia',
  'antfu/nuxt',
  'antfu/web-design-guidelines',
  'antfu/antfu',
  'antfu/unocss',
  'antfu/vitepress',
]

// Top-level gstack skills (manual seed in skills table — 42 skills total).
const GSTACK_CORE = [
  'garrytan/qa',
  'garrytan/ship',
  'garrytan/plan-ceo-review',
  'garrytan/plan-eng-review',
  'garrytan/plan-design-review',
  'garrytan/design-review',
  'garrytan/design-html',
  'garrytan/investigate',
  'garrytan/review',
  'garrytan/health',
  'garrytan/office-hours',
  'garrytan/codex',
  'garrytan/autoplan',
  'garrytan/cso',
  'garrytan/devex-review',
  'garrytan/setup-deploy',
  'garrytan/land-and-deploy',
  'garrytan/gstack-upgrade',
]

const MATTPOCOCK_ALL = [
  'mattpocock/tdd',
  'mattpocock/git-guardrails-claude-code',
  'mattpocock/write-a-skill',
  'mattpocock/design-an-interface',
  'mattpocock/request-refactor-plan',
  'mattpocock/setup-pre-commit',
  'mattpocock/edit-article',
  'mattpocock/migrate-to-shoehorn',
  'mattpocock/prd-to-plan',
  'mattpocock/write-a-prd',
]

const SEED: Entry[] = [
  // ---------------- REDDIT (community) ----------------
  {
    platform: 'reddit',
    url: 'https://www.reddit.com/r/ClaudeAI/comments/1sw6rss/i_deleted_most_of_my_claude_skills_last_week/',
    skillSlugs: MATTPOCOCK_ALL,
  },
  {
    platform: 'reddit',
    url: 'https://www.reddit.com/r/ClaudeAI/comments/1ojuqhm/10_claude_skills_that_actually_changed_how_i_work/',
    skillSlugs: ['obra/brainstorming', 'obra/writing-plans', 'obra/executing-plans', 'obra/systematic-debugging'],
  },
  {
    platform: 'reddit',
    url: 'https://www.reddit.com/r/ClaudeAI/comments/1ok9v3d/i_tested_30_community_claude_skills_for_a_week/',
    skillSlugs: ['obra/brainstorming', 'obra/executing-plans', 'obra/systematic-debugging', 'obra/test-driven-development', 'obra/using-git-worktrees'],
  },
  {
    platform: 'reddit',
    url: 'https://www.reddit.com/r/ClaudeAI/comments/1sepwfc/obrasuperpowers_yeachanheoohmyclaudecode_or_else/',
    skillSlugs: ['obra/using-superpowers'],
  },
  {
    platform: 'reddit',
    url: 'https://www.reddit.com/r/ClaudeAI/comments/1qj1zjg/using_claude_code_obrasuperpowers_how_do_you/',
    skillSlugs: ['obra/using-superpowers', 'obra/using-git-worktrees'],
  },

  // ---------------- BLUESKY: obra author posts ----------------
  // Each is a release announcement from @s.ly (Jesse Vincent / obra) himself.
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3mgnwznd7ok2l',
    skillSlugs: ['obra/brainstorming', 'obra/using-superpowers'],
    role: 'author',
  }, // Superpowers 5 + visual brainstorming
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3miewiorsyk2z',
    skillSlugs: ['obra/using-superpowers'],
    role: 'author',
  }, // Superpowers 5.0.7 + GitHub Copilot CLI
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3mac7ksty2s2w',
    skillSlugs: ['obra/using-superpowers', 'obra/requesting-code-review', 'obra/receiving-code-review'],
    role: 'author',
  }, // Superpowers 4 + spec compliance review agent
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3m6fr7rbp2c22',
    skillSlugs: ['obra/using-superpowers'],
    role: 'author',
  }, // Superpowers 3.5 with skills system for OpenCode
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3m3d65nqfnc26',
    skillSlugs: ['obra/using-superpowers'],
    role: 'author',
  }, // "Anthropic just announced... Superpowers is now a Skills plugin"
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3m2x4wr4iv22h',
    skillSlugs: ['obra/using-superpowers', 'obra/writing-skills'],
    role: 'author',
  }, // First major update; extracts skills into standalone git repo
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/s.ly/post/3m3v53vlmrc23',
    skillSlugs: ['obra/remembering-conversations'],
    role: 'author',
  }, // Episodic memory plugin

  // ---------------- BLUESKY: antfu author post ----------------
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/antfu.me/post/3mdhoqd7hds2u',
    skillSlugs: ANTFU_CORE,
    role: 'author',
  }, // "first premature contribution: github.com/antfu/skills"

  // ---------------- BLUESKY: community ----------------
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhqnorehgt2i',
    skillSlugs: ['obra/brainstorming', 'obra/test-driven-development', 'obra/using-git-worktrees', 'obra/using-superpowers', 'obra/subagent-driven-development'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/timjreynolds.bsky.social/post/3m3rjbb4fe52w',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/kurtthorn.bsky.social/post/3mbysbnvwsc2e',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/msuarz.bsky.social/post/3miwj6atk5c2d',
    skillSlugs: ['obra/test-driven-development'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/faithfinder.bsky.social/post/3mhgok3zisk2h',
    skillSlugs: ['obra/systematic-debugging'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/masnick.com/post/3mgvdh2yrkk2x',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/josusanz.bsky.social/post/3mjrsou2fzx2x',
    skillSlugs: ['obra/brainstorming', 'obra/writing-plans', 'obra/test-driven-development', 'obra/using-superpowers'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/nearestnabors.com/post/3mji4ba3mqx2b',
    skillSlugs: ['mattpocock/tdd', 'mattpocock/write-a-skill', 'mattpocock/request-refactor-plan'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedrvq7f23',
    skillSlugs: ['mattpocock/write-a-prd'],
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/michabbb.bsky.social/post/3mkbedpbqxr2b',
    skillSlugs: MATTPOCOCK_ALL,
    role: 'community',
  },
  {
    platform: 'bsky',
    url: 'https://bsky.app/profile/shun91.bsky.social/post/3mdm7rukrzz24',
    skillSlugs: ['antfu/vue', 'antfu/nuxt', 'antfu/vite', 'antfu/vitest', 'antfu/pnpm'],
    role: 'community',
  },

  // ---------------- BLUESKY: high-authority community (new finds) ----------------
  {
    // Simon Willison via fedi bridge — high domain authority
    platform: 'bsky',
    url: 'https://bsky.app/profile/simon.fedi.simonwillison.net.ap.brid.gy/post/3m2utitb6kx52',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    // @kevinverre — explicit attribution to Jesse Vincent
    platform: 'bsky',
    url: 'https://bsky.app/profile/kevinverre.bsky.social/post/3mewdrzf5n22a',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    // @markphelps — "really digging these superpowers Claude skills"
    platform: 'bsky',
    url: 'https://bsky.app/profile/markphelps.github.io/post/3maf4k42k3g2n',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    // @markphelps — sub-plans game-changer
    platform: 'bsky',
    url: 'https://bsky.app/profile/markphelps.github.io/post/3mbcdwdle5u2u',
    skillSlugs: ['obra/writing-plans', 'obra/executing-plans'],
    role: 'community',
  },
  {
    // @whisk — specifically about brainstorming skill
    platform: 'bsky',
    url: 'https://bsky.app/profile/whisk.bsky.social/post/3mc2gplemec2i',
    skillSlugs: ['obra/brainstorming'],
    role: 'community',
  },
  {
    // @projectautonomy — "doing SO WELL for my latest project"
    platform: 'bsky',
    url: 'https://bsky.app/profile/projectautonomy.substack.com/post/3mdxnsfyky22a',
    skillSlugs: ['obra/using-superpowers'],
    role: 'community',
  },
  {
    // @sergdort — strong workflow testimonial crediting mattpocock
    platform: 'bsky',
    url: 'https://bsky.app/profile/sergdort.bsky.social/post/3mj5dle2qn22l',
    skillSlugs: ['mattpocock/tdd', 'mattpocock/write-a-skill', 'mattpocock/design-an-interface'],
    role: 'community',
  },
  {
    // @ianpatterson — "Matt Pocock's skills - Oxford Typescript guy"
    platform: 'bsky',
    url: 'https://bsky.app/profile/ianpatterson.com/post/3mjcytclxxc23',
    skillSlugs: MATTPOCOCK_ALL,
    role: 'community',
  },
  {
    // @timo (German) — specifically about /grill-me workflow value (closest registry match: write-a-skill / request-refactor-plan)
    platform: 'bsky',
    url: 'https://bsky.app/profile/timo.social.hetzel.net.ap.brid.gy/post/3mhqngfkdppp2',
    skillSlugs: ['mattpocock/request-refactor-plan', 'mattpocock/write-a-skill'],
    role: 'community',
  },
  {
    // @ilya.cyborgs.work — references his AI Engineer talk
    platform: 'bsky',
    url: 'https://bsky.app/profile/ilya.cyborgs.work/post/3mk6mfnxghc23',
    skillSlugs: MATTPOCOCK_ALL,
    role: 'community',
  },

  // ---------------- BLUESKY: gstack (Garry Tan) community ----------------
  // Garry himself posts on X, only via an unofficial mirror on Bluesky which
  // we skip so the embed doesn't render "[UNOFFICIAL]". Community signal is
  // strong on its own: ai-nerd, theo, mayankvora, etc. analyzing gstack.
  {
    // @ai-nerd — "the YC CEO open-sourced his Claude Code setup and half the internet called it god mode"
    platform: 'bsky',
    url: 'https://bsky.app/profile/ai-nerd.bsky.social/post/3mhcfu7gyca2t',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },
  {
    // @camilleroux (French) — explicit /plan-ceo-review, /plan-eng-review, /qa breakdown
    platform: 'bsky',
    url: 'https://bsky.app/profile/camilleroux.com/post/3mgyxjunpgh2n',
    skillSlugs: ['garrytan/plan-ceo-review', 'garrytan/plan-eng-review', 'garrytan/qa'],
    role: 'community',
  },
  {
    // @mayankvora — "turns Claude Code into a full virtual engineering team"
    platform: 'bsky',
    url: 'https://bsky.app/profile/mayankvora.bsky.social/post/3mhxplferhc2f',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },
  {
    // @theo-t3gg (Theo Brown) — "GStack is actually good"
    platform: 'bsky',
    url: 'https://bsky.app/profile/theo-t3gg.bsky.social/post/3mjqmwhj6272s',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },
  {
    // @rasitds — explainer #1
    platform: 'bsky',
    url: 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4byna22v',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },
  {
    // @rasitds — explainer #2 with skill list
    platform: 'bsky',
    url: 'https://bsky.app/profile/rasitds.bsky.social/post/3mhdd4bz2vk2v',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },
  {
    // @rankednews — "why Garry Tan's Claude Code setup has gotten so much love"
    platform: 'bsky',
    url: 'https://bsky.app/profile/rankednews.bsky.social/post/3mhcsxe7gbf2x',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },
  {
    // @genticnews — "Install This 56k-Star Virtual Team for Claude Code"
    platform: 'bsky',
    url: 'https://bsky.app/profile/genticnews.bsky.social/post/3mifm65zrt52b',
    skillSlugs: GSTACK_CORE,
    role: 'community',
  },

  // ---------------- BLUESKY: shadcn community ----------------
  {
    // @andypeacock — wrote his own skill for shadcn
    platform: 'bsky',
    url: 'https://bsky.app/profile/andypeacock.bsky.social/post/3m5ywmp5sqf26',
    skillSlugs: ['shadcn/shadcn'],
    role: 'community',
  },
  {
    // @jefferyharrell — shadcn/ui MCP + Claude Code
    platform: 'bsky',
    url: 'https://bsky.app/profile/jefferyharrell.bsky.social/post/3lxpa2zpbwc2b',
    skillSlugs: ['shadcn/shadcn'],
    role: 'community',
  },
  {
    // @mxkaske — shadcn registry + agent SKILL.md
    platform: 'bsky',
    url: 'https://bsky.app/profile/mxkaske.dev/post/3mh4kpcpo5c2i',
    skillSlugs: ['shadcn/shadcn'],
    role: 'community',
  },
]

const TWITTER_RE = /^https?:\/\/(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i
const BSKY_RE = /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i

interface RedditPost {
  id: string
  subreddit: string
  author: string
  title: string
  selftext: string
  permalink: string
  score: number
  created_utc: number
}
interface RedditChild { kind: string, data: RedditPost }
interface RedditListing { data: { children: RedditChild[] } }

function sqlEscape(value: string | number | null): string {
  if (value === null)
    return 'NULL'
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${value.replace(/'/g, '\'\'')}'`
}

interface FetchedPost {
  platform: 'reddit' | 'bsky'
  postId: string
  postUrl: string
  authorHandle: string
  authorDisplayName: string | null
  authorAvatar: string | null
  textExtract: string
  title: string | null
  bskyUri: string | null
  bskyCid: string | null
  subreddit: string | null
  redditKind: 'post' | 'comment' | null
  score: number | null
  postedAt: number | null
}

async function fetchReddit(url: string): Promise<FetchedPost> {
  const normalized = url.replace(/[?#].*$/, '').replace(/\/+$/, '')
  const jsonUrl = `${normalized.replace(/^https?:\/\/(?:old|new|www)?\.?reddit\.com/, 'https://www.reddit.com')}.json?raw_json=1`
  const res = await fetch(jsonUrl, {
    headers: { 'user-agent': 'skilld.dev social ingest (+https://skilld.dev)' },
  })
  if (!res.ok)
    throw new Error(`reddit ${res.status} for ${url}`)
  const data = await res.json() as RedditListing[]
  const post = data[0]?.data?.children?.[0]?.data
  if (!post)
    throw new Error(`no post in ${url}`)
  return {
    platform: 'reddit',
    postId: post.id,
    postUrl: `https://www.reddit.com${post.permalink}`,
    authorHandle: post.author,
    authorDisplayName: null,
    authorAvatar: null,
    textExtract: (post.selftext || post.title).trim(),
    title: post.title,
    bskyUri: null,
    bskyCid: null,
    subreddit: post.subreddit,
    redditKind: 'post',
    score: post.score,
    postedAt: post.created_utc,
  }
}

async function fetchBsky(url: string, agent: Agent): Promise<FetchedPost> {
  const m = url.match(BSKY_RE)
  if (!m)
    throw new Error(`bad bsky url: ${url}`)
  const [, handle, rkey] = m as [string, string, string]
  const profile = await agent.getProfile({ actor: handle })
  const did = profile.data.did
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`
  const posts = await agent.getPosts({ uris: [uri] })
  const post = posts.data.posts[0]
  if (!post)
    throw new Error(`bsky post not found: ${url}`)
  const record = post.record as { text?: string, createdAt?: string }
  return {
    platform: 'bsky',
    postId: rkey,
    postUrl: url,
    authorHandle: profile.data.handle,
    authorDisplayName: profile.data.displayName ?? null,
    authorAvatar: profile.data.avatar ?? null,
    textExtract: (record.text ?? '').trim(),
    title: null,
    bskyUri: uri,
    bskyCid: post.cid,
    subreddit: null,
    redditKind: null,
    score: null,
    postedAt: record.createdAt ? Math.floor(new Date(record.createdAt).getTime() / 1000) : null,
  }
}

async function main() {
  const agent = new Agent('https://api.bsky.app')
  const now = Math.floor(Date.now() / 1000)
  const inserts: string[] = []

  for (const entry of SEED) {
    let post: FetchedPost
    try {
      post = entry.platform === 'reddit'
        ? await fetchReddit(entry.url)
        : await fetchBsky(entry.url, agent)
    }
    catch (err) {
      process.stderr.write(`[FAIL] ${entry.url}: ${(err as Error).message}\n`)
      continue
    }
    const role = entry.role ?? 'community'
    process.stderr.write(`[ok] ${entry.platform}:${role} @${post.authorHandle} → ${entry.skillSlugs.length} skill(s)\n`)

    for (const slug of entry.skillSlugs) {
      inserts.push(`INSERT OR IGNORE INTO skill_social_posts (
  skill_slug, platform, post_url, post_id,
  author_handle, author_display_name, author_avatar,
  role, status, text_extract, title, oembed_html,
  bsky_uri, bsky_cid, subreddit, reddit_kind, score,
  posted_at, fetched_at, approved_by, approved_at
) VALUES (
  ${sqlEscape(slug)}, ${sqlEscape(post.platform)}, ${sqlEscape(post.postUrl)}, ${sqlEscape(post.postId)},
  ${sqlEscape(post.authorHandle)}, ${sqlEscape(post.authorDisplayName)}, ${sqlEscape(post.authorAvatar)},
  ${sqlEscape(role)}, 'approved', ${sqlEscape(post.textExtract)}, ${sqlEscape(post.title)}, NULL,
  ${sqlEscape(post.bskyUri)}, ${sqlEscape(post.bskyCid)}, ${sqlEscape(post.subreddit)}, ${sqlEscape(post.redditKind)}, ${sqlEscape(post.score)},
  ${sqlEscape(post.postedAt)}, ${sqlEscape(now)}, 'seed-script', ${sqlEscape(now)}
);`)
    }
  }

  process.stdout.write(`-- Seed: ${inserts.length} skill_social_posts rows from ${SEED.length} sources\n`)
  process.stdout.write(`${inserts.join('\n')}\n`)
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err}\n`)
  process.exit(1)
})

// suppress lint for unused regex helper
void TWITTER_RE
