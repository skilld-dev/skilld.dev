import { Agent } from '@atproto/api'

const agent = new Agent('https://api.bsky.app')

async function main() {
  for (const h of ['s.ly', 'jsl.ly', 'obra.com', 'jesse.fsck.com', 'fsck.com', 'obra.dev', 'jesseventures.com', 'obra.us', 'jrv.org']) {
    try {
      const r = await agent.resolveHandle({ handle: h })
      const p = await agent.getProfile({ actor: r.data.did })
      console.log(`@${h} → ${p.data.displayName} (${p.data.did}) followers=${p.data.followersCount}`)
    }
    catch (e) {
      console.log(`@${h} fail: ${(e as Error).message}`)
    }
  }
}
main()
