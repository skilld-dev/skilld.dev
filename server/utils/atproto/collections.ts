/**
 * Shared helpers for listing, caching, and syncing collection records.
 */

/// <reference types="@cloudflare/workers-types" />
import type { Agent } from '@atproto/api'
import type { CollectionRecord } from './lexicons/collection'
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

/** List and parse all collection records for a DID. */
export async function listCollectionRecords(agent: Agent, did: string, limit = 100): Promise<ParsedCollectionRecord[]> {
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
export async function getCachedCollections(agent: Agent, did: string): Promise<CachedCollections> {
  const cacheKey = `${CACHE_PREFIX}:${did}`
  const cached = await useStorage('cache').getItem<CachedCollections>(cacheKey)
  if (cached)
    return cached

  const collections = await listCollectionRecords(agent, did)
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
  const [profile, collections] = await Promise.all([
    agent.getProfile({ actor: did }).catch(() => null),
    listCollectionRecords(agent, did).catch(() => []),
  ])

  const count = collections.length

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
