/**
 * Shared helpers for listing, caching, and syncing collection records.
 */

/// <reference types="@cloudflare/workers-types" />
import type { Agent } from '@atproto/api'
import type { CollectionRecord } from './lexicons/collection'
import { getPdsAgent } from './agent'
import { COLLECTION_NSID, parseCollectionRecord } from './lexicons/collection'

const CACHE_PREFIX = 'collections'
const CACHE_TTL = 60 * 5 // 5 minutes

export interface ParsedCollectionRecord {
  uri: string
  rkey: string
  record: CollectionRecord
}

interface CachedCollections {
  collections: ParsedCollectionRecord[]
  fetchedAt: string
}

/** Extract the rkey (last segment) from an AT URI. */
export function rkeyFromUri(uri: string): string {
  return uri.split('/').pop()!
}

/** List and parse all collection records for a DID. Resolves the user's PDS automatically. */
export async function listCollectionRecords(did: string, limit = 100): Promise<ParsedCollectionRecord[]> {
  const agent = await getPdsAgent(did)

  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: COLLECTION_NSID,
    limit,
  })

  return res.data.records
    .map((r) => {
      const record = parseCollectionRecord(r.value)
      if (!record)
        return null
      return { uri: r.uri, rkey: rkeyFromUri(r.uri), record }
    })
    .filter((c): c is ParsedCollectionRecord => c !== null)
}

/** Get cached collections for a curator, or fetch and cache them. */
export async function getCachedCollections(did: string): Promise<CachedCollections> {
  const cacheKey = `${CACHE_PREFIX}:${did}`
  const cached = await useStorage('cache').getItem<CachedCollections>(cacheKey)
  if (cached)
    return cached

  const collections = await listCollectionRecords(did)
  const result: CachedCollections = {
    collections,
    fetchedAt: new Date().toISOString(),
  }

  await useStorage('cache').setItem(cacheKey, result, { ttl: CACHE_TTL })
  return result
}

/** Bust the collections cache for a curator. */
export async function bustCollectionsCache(did: string) {
  await useStorage('cache').removeItem(`${CACHE_PREFIX}:${did}`)
}

/**
 * Sync curator index after a collection change (create, update, or delete).
 * Fetches profile + remaining collection count, then upserts or removes the curator.
 */
export async function syncCuratorAfterChange(db: D1Database, agent: Agent, did: string) {
  const [profileRes, collections] = await Promise.allSettled([
    agent.getProfile({ actor: did }),
    listCollectionRecords(did),
  ])

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null
  const count = collections.status === 'fulfilled' ? collections.value.length : 0

  if (count > 0) {
    await upsertCurator(db, {
      did,
      handle: profile?.data.handle ?? did,
      displayName: profile?.data.displayName,
      avatar: profile?.data.avatar,
      collectionCount: count,
    })
  }
  else {
    await removeCuratorIfEmpty(db, did)
  }

  return { handle: profile?.data.handle ?? did, collectionCount: count }
}
