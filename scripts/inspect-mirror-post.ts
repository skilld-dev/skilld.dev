import { Agent } from '@atproto/api'

const agent = new Agent('https://api.bsky.app')

async function main() {
  const post = await agent.getPosts({ uris: ['at://did:plc:ivep2atikg2cr2tawlzatfqn/app.bsky.feed.post/3mgtzqjartt26'] })
  const p = post.data.posts[0]
  if (!p) {
    console.log('No post')
    return
  }
  console.log('record:', JSON.stringify(p.record, null, 2).slice(0, 2000))
}
main().catch(e => console.error(e))
