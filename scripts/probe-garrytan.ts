import { Agent } from '@atproto/api'

const agent = new Agent('https://api.bsky.app')

async function main() {
  for (const h of ['garrytan.bsky.social', 'garrytan.com', 'garry.bsky.social', 'gtan.com']) {
    try {
      const r = await agent.resolveHandle({ handle: h })
      const p = await agent.getProfile({ actor: r.data.did })
      console.log(`@${h} → ${p.data.displayName} (${p.data.did}) followers=${p.data.followersCount}`)
    }
    catch (e) {
      console.log(`@${h} fail: ${(e as Error).message}`)
    }
  }
  console.log('---\nSearch link mentions:')
  for (const q of ['github.com/garrytan/gstack', 'garrytan/gstack', 'gstack claude']) {
    const res = await agent.app.bsky.feed.searchPosts({ q, limit: 30, sort: 'top' })
    console.log(`q="${q}" → ${res.data.posts.length} posts`)
    for (const p of res.data.posts) {
      const text = (p.record as { text?: string }).text ?? ''
      if (text.length < 30)
        continue
      const rkey = p.uri.split('/').pop()
      console.log(`  @${p.author.handle}\thttps://bsky.app/profile/${p.author.handle}/post/${rkey}\t${text.replace(/\s+/g, ' ').slice(0, 220)}`)
    }
  }
}
main().catch(e => console.error(e))
