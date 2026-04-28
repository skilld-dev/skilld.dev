#!/usr/bin/env tsx
/**
 * Deep author-feed scan: find posts where the creator themselves talks about
 * their own skills repo (not generic AI musings).
 *
 * Strategy: scan their last ~500 posts and require the post text to reference
 * EITHER their skill repo path OR a specific skill keyword from our registry.
 */
import { Agent } from '@atproto/api'

interface Target {
  handle: string
  creator: string
  // Patterns that prove this post is about THIS creator's skills
  patterns: RegExp[]
}

const TARGETS: Target[] = [
  {
    handle: 'garrytan.bsky.social',
    creator: 'garrytan',
    patterns: [/\bgstack\b/i, /\bgbrain\b/i, /github\.com\/garrytan/i, /\bclaude\s+code\s+skill/i],
  },
  {
    handle: 'mattpocock.com',
    creator: 'mattpocock',
    patterns: [
      /\bmattpocock\/skills\b/i,
      /\bmy skills repo\b/i,
      /\bclaude\s+code\s+skill/i,
      /\bgithub\.com\/mattpocock\/skills/i,
      /\bgrill-me\b/i,
      /\bgrill-with-docs\b/i,
      /\bimprove-codebase-architecture\b/i,
      /\bgit-guardrails\b/i,
      /\bwrite-a-skill\b/i,
      /\bwrite-a-prd\b/i,
      /\bprd-to-plan\b/i,
      /\brefactor.*plan\b/i,
      /\bsetup-pre-commit\b/i,
      /\bmigrate-to-shoehorn\b/i,
      /\bdesign-an-interface\b/i,
      /\bedit-article\b/i,
      /\bzoom-out\b/i,
      /\bto-issues\b/i,
      /\bto-prd\b/i,
      /\bdiagnose\b/i,
      /\bDOMAIN-AWARENESS\.md\b/i,
      /\bLANGUAGE\.md\b/i,
      /\bubiquitous-language\b/i,
    ],
  },
  {
    handle: 's.ly',
    creator: 'obra',
    patterns: [
      /\bsuperpowers\b/i,
      /\bobra\/superpowers\b/i,
      /\bgithub\.com\/obra\//i,
      /\bbrainstorm/i,
      /\bsystematic.debug/i,
      /\bwriting.plans?\b/i,
      /\bexecuting.plans?\b/i,
      /\bsubagent/i,
      /\bskill\.md\b/i,
      /\bcode.review\b/i,
      /\bworktree/i,
      /\btdd\b/i,
      /\btest.driven\b/i,
      /\bepisodic.memory\b/i,
      /\bremembering.conversations\b/i,
      /\bfsck\.com\b/i,
    ],
  },
  {
    handle: 'antfu.me',
    creator: 'antfu',
    patterns: [
      /\bantfu\/skills\b/i,
      /\bgithub\.com\/antfu\/skills/i,
      /\bclaude\s+code\b/i,
      /\bagent.*skill/i,
      /\bskill.*claude/i,
    ],
  },
  {
    handle: 'shadcn.com',
    creator: 'shadcn',
    patterns: [
      /\bshadcn.*claude\b/i,
      /\bshadcn.*skill\b/i,
      /\bclaude.*shadcn\b/i,
      /\bshadcn\/ui.*claude\b/i,
      /\bagent.*shadcn\b/i,
    ],
  },
]

async function scanCreator(agent: Agent, target: Target) {
  let did: string
  try {
    const r = await agent.resolveHandle({ handle: target.handle })
    did = r.data.did
  }
  catch (err) {
    process.stderr.write(`[skip] ${target.handle}: ${(err as Error).message}\n`)
    return
  }

  let cursor: string | undefined
  let scanned = 0
  let matched = 0
  process.stderr.write(`\n=== @${target.handle} (creator=${target.creator}) ===\n`)

  for (let page = 0; page < 6; page++) {
    let res
    try {
      res = await agent.app.bsky.feed.getAuthorFeed({ actor: did, limit: 100, cursor, filter: 'posts_no_replies' })
    }
    catch (err) {
      process.stderr.write(`  page ${page} failed: ${(err as Error).message}\n`)
      break
    }

    for (const item of res.data.feed) {
      const post = item.post
      if (post.author.did !== did)
        continue
      const text = (post.record as { text?: string }).text ?? ''
      scanned++
      const matches = target.patterns.filter(re => re.test(text))
      if (!matches.length)
        continue
      if (text.length < 30)
        continue
      matched++
      const rkey = post.uri.split('/').pop()
      const url = `https://bsky.app/profile/${post.author.handle}/post/${rkey}`
      const matchedNames = matches.map(re => re.source).join(',')
      process.stdout.write(`${target.creator}\t${url}\t${matchedNames}\t${text.replace(/\s+/g, ' ').slice(0, 400)}\n`)
    }
    if (!res.data.cursor)
      break
    cursor = res.data.cursor
  }
  process.stderr.write(`  scanned=${scanned} matched=${matched}\n`)
}

async function main() {
  const agent = new Agent('https://api.bsky.app')
  for (const t of TARGETS)
    await scanCreator(agent, t)
}

main().catch(err => process.stderr.write(`${err}\n`))
