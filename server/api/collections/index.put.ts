import type { PostReference } from '../../utils/atproto/lexicons/collection'
// @ts-expect-error virtual file from oauth module
import { clientUri } from '#oauth/config'
import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { bustCollectionsCache, bustHomepageCache, syncCuratorAfterChange } from '../../utils/atproto/collections'
import { COLLECTION_NSID, toCollectionRecord, validateCollectionInput } from '../../utils/atproto/lexicons/collection'

export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const body = await readBody(event)
  const input = validateCollectionInput(body)
  const shareOnBluesky = body?.shareOnBluesky === true

  // Check if record exists to preserve createdAt and postRef
  let existingCreatedAt: string | undefined
  let existingPostRef: PostReference | undefined
  let isUpdate = false

  try {
    const existing = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: COLLECTION_NSID,
      rkey: input.slug,
    })
    isUpdate = true
    const val = existing.data.value as Record<string, unknown>
    existingCreatedAt = val.createdAt as string
    if (val.postRef && typeof val.postRef === 'object') {
      const ref = val.postRef as Record<string, unknown>
      if (typeof ref.uri === 'string' && typeof ref.cid === 'string')
        existingPostRef = { uri: ref.uri, cid: ref.cid }
    }
  }
  catch {
    // Record doesn't exist yet, this is a new collection
  }

  // Build initial record (postRef added after post creation if needed)
  const record = toCollectionRecord(input, {
    existingCreatedAt,
    postRef: existingPostRef,
  })

  // Fetch profile for Bluesky post URL
  let handle = did
  try {
    const profile = await agent.getProfile({ actor: did })
    handle = profile.data.handle ?? did
  }
  catch (err) {
    console.warn('[collections:put] Failed to fetch profile for post URL:', err)
  }

  // Post to Bluesky: new collection gets a fresh post, updates reply to the original
  let postRef: PostReference | undefined
  if (shareOnBluesky) {
    const collectionUrl = `${clientUri}/people/${handle}/${input.slug}`
    const skillCount = input.skills.length

    if (isUpdate && existingPostRef) {
      // Reply to the original post with an update
      const text = `Updated "${input.name}" on skilld.dev. Now ${skillCount} skill${skillCount === 1 ? '' : 's'}.\n\n${collectionUrl}`
      try {
        await agent.post({
          text,
          reply: {
            root: { uri: existingPostRef.uri, cid: existingPostRef.cid },
            parent: { uri: existingPostRef.uri, cid: existingPostRef.cid },
          },
          embed: {
            $type: 'app.bsky.embed.external',
            external: {
              uri: collectionUrl,
              title: input.name,
              description: input.description || `A collection of ${skillCount} curated agent skills.`,
            },
          },
        })
      }
      catch (err) {
        console.warn('[collections:put] Failed to post Bluesky update reply:', err)
      }
      // Keep original postRef
      postRef = existingPostRef
    }
    else {
      // New post for new collection
      const text = `Published "${input.name}" on skilld.dev. ${skillCount} skill${skillCount === 1 ? '' : 's'} you can install with one command.\n\n${collectionUrl}`
      try {
        const post = await agent.post({
          text,
          embed: {
            $type: 'app.bsky.embed.external',
            external: {
              uri: collectionUrl,
              title: input.name,
              description: input.description || `A collection of ${skillCount} curated agent skills.`,
            },
          },
        })
        postRef = { uri: post.uri, cid: post.cid }
      }
      catch (err) {
        console.warn('[collections:put] Failed to post to Bluesky:', err)
      }
    }
  }

  // Update record with postRef if we have one
  if (postRef)
    record.postRef = postRef

  const result = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION_NSID,
    rkey: input.slug,
    record: record as unknown as Record<string, unknown>,
  })

  await bustCollectionsCache(did)
  await syncCuratorAfterChange(getDB(event), agent, did)
  await bustHomepageCache()

  return {
    uri: result.data.uri,
    cid: result.data.cid,
    record,
    postUri: postRef?.uri,
  }
})
