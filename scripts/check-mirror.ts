import { Agent } from '@atproto/api'

const agent = new Agent('https://api.bsky.app')
const profile = await agent.getProfile({ actor: 'garrytan-mirr.selfhosted.social' })
console.log('handle:', profile.data.handle)
console.log('display:', profile.data.displayName)
console.log('did:', profile.data.did)
console.log('description:', profile.data.description)
console.log('followers:', profile.data.followersCount)
console.log('posts:', profile.data.postsCount)
