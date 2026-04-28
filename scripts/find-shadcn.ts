import { Agent } from '@atproto/api'

const agent = new Agent('https://api.bsky.app')

async function main() {
  const queries = [
    'shadcn registry skill',
    'shadcn/ui mcp claude',
    'shadcn skill claude code',
    'shadcn ui agent',
    'shadcn skill.md',
  ]
  const seen = new Set<string>()
  for (const q of queries) {
    const res = await agent.app.bsky.feed.searchPosts({ q, limit: 25, sort: 'top' })
    for (const p of res.data.posts) {
      if (seen.has(p.uri))
        continue
      seen.add(p.uri)
      const text = (p.record as { text?: string }).text ?? ''
      const lower = text.toLowerCase()
      if (!lower.includes('shadcn'))
        continue
      if (text.length < 50)
        continue
      // Require at least one signal that this is about a skill/MCP/claude usage
      if (!/skill|mcp|claude|agent|code/i.test(text))
        continue
      const rkey = p.uri.split('/').pop()
      console.log(`${p.author.handle}\thttps://bsky.app/profile/${p.author.handle}/post/${rkey}\t${text.replace(/\s+/g, ' ').slice(0, 280)}`)
    }
  }
}
main().catch(e => console.error(e))
