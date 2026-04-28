#!/usr/bin/env tsx
/**
 * Search Bluesky for posts that link directly to a skill repo.
 * These tend to be the highest-quality testimonials because the post had to
 * call out the repo URL rather than tangentially mention a name.
 */
import { Agent } from '@atproto/api'

const TARGETS = [
  // Each entry: search query (passed as `url:` filter), creator label, default skill slugs to attach
  { q: 'github.com/mattpocock/skills', creator: 'mattpocock' },
  { q: 'github.com/obra/superpowers', creator: 'obra' },
  { q: 'github.com/obra/episodic-memory', creator: 'obra' },
  { q: 'github.com/antfu/skills', creator: 'antfu' },
  { q: 'mattpocock.com/skills', creator: 'mattpocock' },
  { q: 'aihero.dev', creator: 'mattpocock' },
]

async function main() {
  const agent = new Agent('https://api.bsky.app')
  for (const t of TARGETS) {
    let res
    try {
      res = await agent.app.bsky.feed.searchPosts({ q: t.q, limit: 25, sort: 'top' })
    }
    catch (err) {
      process.stderr.write(`[err] q="${t.q}" ${(err as Error).message}\n`)
      continue
    }
    process.stderr.write(`[ok ] q="${t.q}" → ${res.data.posts.length} posts\n`)
    for (const p of res.data.posts) {
      const text = (p.record as { text?: string }).text ?? ''
      if (text.length < 30)
        continue
      const rkey = p.uri.split('/').pop()
      const url = `https://bsky.app/profile/${p.author.handle}/post/${rkey}`
      process.stdout.write(`${t.creator}\t@${p.author.handle}\t${url}\t${text.replace(/\s+/g, ' ').slice(0, 280)}\n`)
    }
  }
}

main().catch(err => process.stderr.write(`${err}\n`))
