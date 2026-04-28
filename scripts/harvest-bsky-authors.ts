#!/usr/bin/env tsx
/**
 * Probe each pilot creator's own bsky feed for posts about their skills.
 * These become 'author' role rows.
 */
import { Agent } from '@atproto/api'

const HANDLES = [
  { handle: 'mattpocock.com', creator: 'mattpocock' },
  { handle: 's.ly', creator: 'obra' }, // jesse vincent
  { handle: 'antfu.me', creator: 'antfu' },
  { handle: 'shadcn.com', creator: 'shadcn' },
]

// Tighter filter: require either a creator-namespaced reference OR an exact skill keyword
// to avoid generic "AI agent" musings polluting the seed.
const STRONG_PATTERNS = [
  /\bsuperpowers\b/i,
  /\bobra\/\S+/i,
  /\bantfu\/\S+/i,
  /\bmattpocock\/\S+/i,
  /\bshadcn\/\S+/i,
  /\bclaude\s+code\b/i,
  /\bclaude\s+skill/i,
  /\bagent\s+skill/i,
  /\bskill\.md\b/i,
  /github\.com\/(antfu|obra|mattpocock|shadcn)/i,
]

async function main() {
  const agent = new Agent('https://api.bsky.app')

  for (const { handle, creator } of HANDLES) {
    let did: string
    try {
      const r = await agent.resolveHandle({ handle })
      did = r.data.did
    }
    catch (err) {
      process.stderr.write(`[skip] ${handle}: ${(err as Error).message}\n`)
      continue
    }

    let cursor: string | undefined
    let totalChecked = 0
    let matches = 0
    process.stderr.write(`\n=== @${handle} (creator=${creator}, did=${did}) ===\n`)

    // Walk last ~3 pages (300 posts max)
    for (let page = 0; page < 3; page++) {
      let res
      try {
        res = await agent.app.bsky.feed.getAuthorFeed({ actor: did, limit: 100, cursor })
      }
      catch (err) {
        process.stderr.write(`  page ${page} failed: ${(err as Error).message}\n`)
        break
      }

      for (const item of res.data.feed) {
        const post = item.post
        if (post.author.did !== did)
          continue // skip reposts of others
        const text = (post.record as { text?: string }).text ?? ''
        totalChecked++
        if (!STRONG_PATTERNS.some(re => re.test(text)))
          continue
        if (text.length < 40)
          continue
        matches++

        const rkey = post.uri.split('/').pop()
        const url = `https://bsky.app/profile/${post.author.handle}/post/${rkey}`
        process.stdout.write(`${creator}\t${url}\t${post.uri}\t${post.cid}\t${(post.record as { createdAt?: string }).createdAt}\t${text.replace(/\s+/g, ' ').slice(0, 300)}\n`)
      }

      if (!res.data.cursor)
        break
      cursor = res.data.cursor
    }
    process.stderr.write(`  scanned ${totalChecked} posts, matched ${matches}\n`)
  }
}

main().catch(err => process.stderr.write(`${err}\n`))
