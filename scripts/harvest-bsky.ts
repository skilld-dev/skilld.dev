#!/usr/bin/env tsx
/**
 * Harvest Bluesky search results for our pilot creators.
 * Outputs candidate posts as JSON for review before seeding.
 *
 * Usage:
 *   npx tsx scripts/harvest-bsky.ts > /tmp/bsky-candidates.json
 */
import { Agent } from '@atproto/api'

interface Candidate {
  query: string
  authorHandle: string
  authorDisplayName: string
  authorDid: string
  text: string
  postUrl: string
  uri: string
  cid: string
  createdAt: string
  // creator-handles whose skills this might attach to
  matchedCreator: string | null
  // bare guess at which skill keyword(s) appear in text
  skillKeywords: string[]
}

const QUERIES: { q: string, creator: string }[] = [
  { q: 'mattpocock skill claude', creator: 'mattpocock' },
  { q: 'mattpocock/skills', creator: 'mattpocock' },
  { q: 'matt pocock claude skill', creator: 'mattpocock' },
  { q: 'obra superpowers', creator: 'obra' },
  { q: 'obra/superpowers', creator: 'obra' },
  { q: 'superpowers brainstorming claude', creator: 'obra' },
  { q: 'systematic-debugging skill', creator: 'obra' },
  { q: 'antfu skills', creator: 'antfu' },
  { q: 'antfu/skills', creator: 'antfu' },
  { q: 'antfu claude skill', creator: 'antfu' },
  { q: 'shadcn claude skill', creator: 'shadcn' },
  { q: 'shadcn/ui skill', creator: 'shadcn' },
]

const SKILL_KEYWORDS: Record<string, string[]> = {
  mattpocock: ['tdd', 'pre-commit', 'refactor', 'prd', 'shoehorn', 'guardrails', 'interface', 'article'],
  obra: ['brainstorm', 'systematic', 'debug', 'plan', 'tdd', 'test-driven', 'review', 'subagent', 'verification', 'worktree', 'superpowers', 'memory'],
  antfu: ['vue', 'vite', 'vitest', 'pinia', 'nuxt', 'unocss', 'vitepress', 'pnpm', 'antfu', 'design', 'vueuse'],
  shadcn: ['shadcn', 'ui'],
}

async function main() {
  const agent = new Agent('https://api.bsky.app')
  const out: Candidate[] = []
  const seen = new Set<string>()

  for (const { q, creator } of QUERIES) {
    let res
    try {
      res = await agent.app.bsky.feed.searchPosts({ q, limit: 25, sort: 'top' })
    }
    catch (err) {
      process.stderr.write(`[err] q="${q}" ${(err as Error).message}\n`)
      continue
    }
    process.stderr.write(`[ok ] q="${q}" → ${res.data.posts.length} posts\n`)

    for (const p of res.data.posts) {
      if (seen.has(p.uri))
        continue
      seen.add(p.uri)

      const text = (p.record as { text?: string, createdAt?: string }).text || ''
      const createdAt = (p.record as { createdAt?: string }).createdAt || ''
      const handle = p.author.handle
      const displayName = p.author.displayName || ''

      // Filter out posts that don't substantively reference the creator
      const lower = `${text} ${displayName}`.toLowerCase()
      const creatorLower = creator.toLowerCase()
      if (!lower.includes(creatorLower) && !lower.includes(`${creatorLower}/skills`) && !lower.includes(`${creatorLower}/superpowers`))
        continue

      // Filter out very short posts (likely noise) unless authored by a high-signal handle
      if (text.length < 30)
        continue

      const matchedKeywords = (SKILL_KEYWORDS[creator] ?? []).filter(k => lower.includes(k))

      const rkey = p.uri.split('/').pop() ?? ''
      out.push({
        query: q,
        authorHandle: handle,
        authorDisplayName: displayName,
        authorDid: p.author.did,
        text,
        postUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
        uri: p.uri,
        cid: p.cid,
        createdAt,
        matchedCreator: creator,
        skillKeywords: matchedKeywords,
      })
    }
  }

  // Sort: posts authored by the creator first, then by keyword count desc
  const CREATOR_HANDLES: Record<string, string[]> = {
    mattpocock: ['mattpocock.com', 'mattpocock.bsky.social', 'mattpocockuk.bsky.social'],
    obra: ['obra.bsky.social', 'obra.com', 'fsck.com'],
    antfu: ['antfu.me', 'antfu.bsky.social'],
    shadcn: ['shadcn.bsky.social', 'shadcn.com'],
  }
  out.sort((a, b) => {
    const aAuthor = (CREATOR_HANDLES[a.matchedCreator ?? ''] ?? []).includes(a.authorHandle) ? 1 : 0
    const bAuthor = (CREATOR_HANDLES[b.matchedCreator ?? ''] ?? []).includes(b.authorHandle) ? 1 : 0
    if (aAuthor !== bAuthor)
      return bAuthor - aAuthor
    return b.skillKeywords.length - a.skillKeywords.length
  })

  process.stdout.write(JSON.stringify(out, null, 2))
}

main().catch(err => process.stderr.write(`${(err as Error).stack ?? err}\n`))
