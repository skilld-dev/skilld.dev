/**
 * Shared helpers for listing, caching, and syncing collection records.
 */

/// <reference types="@cloudflare/workers-types" />
import type { Agent } from '@atproto/api'
import type { CollectionRecord } from './lexicons/collection'
import { getPdsAgent } from './agent'
import { syncCuratorCollections, tombstoneCuratorCollections } from './collection-sync'
import { getAllCurators } from './curator-index'
import { COLLECTION_NSID, parseCollectionRecord } from './lexicons/collection'

const CACHE_PREFIX = 'collections'
const CACHE_TTL = 60 * 5 // 5 minutes
const INDEX_CACHE_KEY = 'collections:index'

export interface IndexCollection {
  name: string
  slug: string
  description: string
  preambleExcerpt?: string
  skillCount: number
  skills: string[]
  stacks: string[]
  updatedAt: string
  curator: { did: string, handle: string, displayName?: string, avatar?: string }
}

export interface CollectionsIndex {
  featured: IndexCollection[]
  recent: IndexCollection[]
  total: number
  fetchedAt: string
}

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

/** Build (or read from cache) the cross-curator collections index. */
export async function getCollectionsIndex(db: D1Database): Promise<CollectionsIndex> {
  const cached = await useStorage('cache').getItem<CollectionsIndex>(INDEX_CACHE_KEY)
  if (cached)
    return cached

  const curators = await getAllCurators(db)

  const collections: IndexCollection[] = []
  const results = await Promise.allSettled(curators.map(async (curator) => {
    const records = await listCollectionRecords(curator.did, 20)
    for (const { record } of records) {
      if (record.slug === 'skills')
        continue
      collections.push({
        name: record.name,
        slug: record.slug,
        description: record.description,
        ...(record.preamble ? { preambleExcerpt: excerpt(record.preamble) } : {}),
        skillCount: record.skills.length,
        skills: record.skills.map(s => s.packageName),
        stacks: record.stacks,
        updatedAt: record.updatedAt,
        curator: {
          did: curator.did,
          handle: curator.handle,
          displayName: curator.displayName,
          avatar: curator.avatar,
        },
      })
    }
  }))

  for (const result of results) {
    if (result.status === 'rejected')
      console.warn('[collections:index] Failed to fetch curator collections:', result.reason)
  }

  collections.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const curatorScore = new Map<string, number>()
  for (const c of curators) {
    const labelBoost = c.labels.includes('verified-maintainer')
      ? 1000
      : c.labels.includes('prolific')
        ? 100
        : c.labels.includes('early-curator')
          ? 10
          : 0
    curatorScore.set(c.did, labelBoost + c.collectionCount)
  }

  const featured = [...collections]
    .sort((a, b) => {
      const sa = curatorScore.get(a.curator.did) ?? 0
      const sb = curatorScore.get(b.curator.did) ?? 0
      if (sa !== sb)
        return sb - sa
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, 4)

  const featuredSlugs = new Set(featured.map(c => `${c.curator.did}/${c.slug}`))
  const recent = collections.filter(c => !featuredSlugs.has(`${c.curator.did}/${c.slug}`))

  const result: CollectionsIndex = {
    featured,
    recent,
    total: collections.length,
    fetchedAt: new Date().toISOString(),
  }

  await useStorage('cache').setItem(INDEX_CACHE_KEY, result, { ttl: CACHE_TTL })
  return result
}

/** Bust the homepage API cache and Nitro's SWR route cache for /. */
export async function bustHomepageCache() {
  const cache = useStorage('cache')
  await cache.removeItem('homepage:data')
  // Clear Nitro's SWR cached response for the index route
  const handlerKeys = await cache.getKeys('nitro:handlers')
  await Promise.all(
    handlerKeys
      .filter(k => k.includes('index') || k.includes('__'))
      .map(k => cache.removeItem(k)),
  )
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

  // Never treat a failed fetch as zero collections — skip the update entirely
  if (collections.status === 'rejected') {
    console.warn(`[syncCuratorAfterChange] Collection fetch failed for ${did}, skipping:`, collections.reason)
    return { handle: profile?.data.handle ?? did, collectionCount: -1 }
  }

  const count = collections.value.length

  if (count > 0) {
    await upsertCurator(db, {
      did,
      handle: profile?.data.handle ?? did,
      displayName: profile?.data.displayName,
      avatar: profile?.data.avatar,
      collectionCount: count,
    })
    // Project freshly-written records into the D1 index so the network feed
    // sees them immediately instead of waiting for the next cron tick.
    await syncCuratorCollections(db, did).catch((err) => {
      console.warn(`[syncCuratorAfterChange] Collection index sync failed for ${did}:`, err)
    })
  }
  else {
    await tombstoneCuratorCollections(db, did)
    await removeCuratorIfEmpty(db, did)
  }

  return { handle: profile?.data.handle ?? did, collectionCount: count }
}
