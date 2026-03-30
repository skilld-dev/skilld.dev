import type { PostReference } from '../../utils/atproto/lexicons/collection'
// @ts-expect-error virtual file from oauth module
import { clientUri } from '#oauth/config'
import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { upsertCurator } from '../../utils/atproto/curator-index'
import { COLLECTION_NSID, toCollectionRecord, validateCollectionInput } from '../../utils/atproto/lexicons/collection'

const CACHE_PREFIX = 'collections'

export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const body = await readBody(event)
  const input = validateCollectionInput(body)
  const shareOnBluesky = body?.shareOnBluesky === true

  // Check if record exists to preserve createdAt and postRef
  let existingCreatedAt: string | undefined
  let existingPostRef: PostReference | undefined
  const isUpdate = !!(await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: COLLECTION_NSID,
    rkey: input.slug,
  }).then((r) => {
    const val = r.data.value as Record<string, unknown>
    existingCreatedAt = val.createdAt as string
    if (val.postRef && typeof val.postRef === 'object') {
      const ref = val.postRef as Record<string, unknown>
      if (typeof ref.uri === 'string' && typeof ref.cid === 'string')
        existingPostRef = { uri: ref.uri, cid: ref.cid }
    }
    return r
  }).catch(() => null))

  // Build initial record (postRef added after post creation if needed)
  const record = toCollectionRecord(input, {
    existingCreatedAt,
    postRef: existingPostRef,
  })

  // Fetch profile and collections in parallel for curator index
  const [profile, allCollections] = await Promise.all([
    agent.getProfile({ actor: did }).catch(() => null),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: COLLECTION_NSID,
      limit: 100,
    }).catch(() => null),
  ])

  // Post to Bluesky: new collection gets a fresh post, updates reply to the original
  let postRef: PostReference | undefined
  if (shareOnBluesky) {
    const handle = profile?.data.handle ?? did
    const collectionUrl = `${clientUri}/people/${handle}/${input.slug}`
    const skillCount = input.skills.length

    if (isUpdate && existingPostRef) {
      // Reply to the original post with an update
      const text = `Updated "${input.name}" on skilld.dev. Now ${skillCount} skill${skillCount === 1 ? '' : 's'}.\n\n${collectionUrl}`
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
      }).catch(() => null)
      // Keep original postRef
      postRef = existingPostRef
    }
    else {
      // New post for new collection
      const text = `Published "${input.name}" on skilld.dev. ${skillCount} skill${skillCount === 1 ? '' : 's'} you can install with one command.\n\n${collectionUrl}`
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
      }).catch(() => null)

      if (post)
        postRef = { uri: post.uri, cid: post.cid }
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

  // Bust cache for this curator
  await useStorage('data').removeItem(`${CACHE_PREFIX}:${did}`)

  // Update curator index
  await upsertCurator({
    did,
    handle: profile?.data.handle ?? did,
    displayName: profile?.data.displayName,
    avatar: profile?.data.avatar,
    collectionCount: (allCollections?.data.records.length ?? 0) + (isUpdate ? 0 : 1),
  })

  return {
    uri: result.data.uri,
    cid: result.data.cid,
    record,
    postUri: postRef?.uri,
  }
})
