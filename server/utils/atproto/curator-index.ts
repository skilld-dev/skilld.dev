/**
 * Curator index stored in D1. Tracks who has published collections via skilld.
 * Includes rebuild capability from network state and handle/profile refresh.
 */

/// <reference types="@cloudflare/workers-types" />
import { getPublicAgent } from './agent'
import { syncCuratorCollections, tombstoneCuratorCollections } from './collection-sync'
import { listCollectionRecords } from './collections'
import { isProfileFlagged } from './moderation'

const REFRESH_INTERVAL = 60 * 60 * 1000 // 1 hour

export type CuratorLabel = 'early-curator' | 'prolific' | 'verified-maintainer'

export interface IndexedCurator {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  collectionCount: number
  firstPublished: string
  lastPublished: string
  labels: CuratorLabel[]
  lastProfileRefresh?: string
}

interface CuratorRow {
  did: string
  handle: string
  display_name: string | null
  avatar: string | null
  collection_count: number
  first_published: string
  last_published: string
  labels: string
  last_profile_refresh: string | null
}

function rowToCurator(row: CuratorRow): IndexedCurator {
  return {
    did: row.did,
    handle: row.handle,
    displayName: row.display_name ?? undefined,
    avatar: row.avatar ?? undefined,
    collectionCount: row.collection_count,
    firstPublished: row.first_published,
    lastPublished: row.last_published,
    labels: JSON.parse(row.labels) as CuratorLabel[],
    lastProfileRefresh: row.last_profile_refresh ?? undefined,
  }
}

/** Register or update a curator after they publish a collection. */
export async function upsertCurator(db: D1Database, curator: {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  collectionCount: number
}) {
  const [countRes, existingRes] = await db.batch([
    db.prepare('SELECT COUNT(*) as total FROM curators'),
    db.prepare('SELECT labels FROM curators WHERE did = ?').bind(curator.did),
  ]) as [D1Result<{ total: number }>, D1Result<{ labels: string }>]

  const isEarlyAdopter = (countRes.results[0]?.total ?? 0) < 50
  const existingLabels = existingRes.results[0]
    ? JSON.parse(existingRes.results[0].labels) as CuratorLabel[]
    : undefined

  const labels = computeLabels({
    collectionCount: curator.collectionCount,
    isEarlyAdopter,
    existingLabels,
  })

  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO curators (did, handle, display_name, avatar, collection_count, first_published, last_published, labels)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(did) DO UPDATE SET
      handle = excluded.handle,
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      collection_count = excluded.collection_count,
      last_published = excluded.last_published,
      labels = excluded.labels
  `).bind(
    curator.did,
    curator.handle,
    curator.displayName ?? null,
    curator.avatar ?? null,
    curator.collectionCount,
    now,
    now,
    JSON.stringify(labels),
  ).run()
}

/** Remove a curator if they have no remaining collections. */
export async function removeCuratorIfEmpty(db: D1Database, did: string) {
  await db.prepare('DELETE FROM curators WHERE did = ? AND collection_count = 0')
    .bind(did)
    .run()
}

/** Get all known curators. */
export async function getAllCurators(db: D1Database): Promise<IndexedCurator[]> {
  const res = await db.prepare('SELECT * FROM curators').all<CuratorRow>()
  return (res.results ?? []).map(rowToCurator)
}

/** Get curators matching a set of DIDs. Chunked to stay under D1's bind-parameter limit. */
export async function getCuratorsByDids(db: D1Database, dids: string[]): Promise<IndexedCurator[]> {
  if (!dids.length)
    return []
  const CHUNK = 80
  const uniqueDids = [...new Set(dids)]
  const chunks: string[][] = []
  for (let i = 0; i < uniqueDids.length; i += CHUNK)
    chunks.push(uniqueDids.slice(i, i + CHUNK))

  const results = await Promise.all(chunks.map((chunk) => {
    const placeholders = chunk.map(() => '?').join(',')
    return db.prepare(`SELECT * FROM curators WHERE did IN (${placeholders})`)
      .bind(...chunk)
      .all<CuratorRow>()
  }))

  return results.flatMap(r => (r.results ?? []).map(rowToCurator))
}

/** Manually add a label to a curator (admin operation). */
export async function addCuratorLabel(db: D1Database, did: string, label: CuratorLabel) {
  const row = await db.prepare('SELECT labels FROM curators WHERE did = ?')
    .bind(did)
    .first<{ labels: string }>()
  if (!row)
    return
  const labels: CuratorLabel[] = JSON.parse(row.labels)
  if (labels.includes(label))
    return
  labels.push(label)
  await db.prepare('UPDATE curators SET labels = ? WHERE did = ?')
    .bind(JSON.stringify(labels), did)
    .run()
}

/** Manually remove a label from a curator (admin operation). */
export async function removeCuratorLabel(db: D1Database, did: string, label: CuratorLabel) {
  const row = await db.prepare('SELECT labels FROM curators WHERE did = ?')
    .bind(did)
    .first<{ labels: string }>()
  if (!row)
    return
  const labels: CuratorLabel[] = JSON.parse(row.labels)
  const filtered = labels.filter(l => l !== label)
  if (filtered.length === labels.length)
    return
  await db.prepare('UPDATE curators SET labels = ? WHERE did = ?')
    .bind(JSON.stringify(filtered), did)
    .run()
}

/** Compute labels based on curator activity. */
function computeLabels(opts: {
  collectionCount: number
  isEarlyAdopter: boolean
  existingLabels?: CuratorLabel[]
}): CuratorLabel[] {
  const labels = new Set<CuratorLabel>(opts.existingLabels ?? [])

  if (opts.isEarlyAdopter)
    labels.add('early-curator')

  if (opts.collectionCount >= 5)
    labels.add('prolific')
  else labels.delete('prolific')

  // verified-maintainer is manually assigned, never auto-removed
  return [...labels]
}

type SyncResult = 'refreshed' | 'removed' | 'skipped'

/**
 * Sync a single curator against network state.
 * Returns what happened so callers can aggregate results.
 */
async function syncCurator(
  db: D1Database,
  agent: ReturnType<typeof getPublicAgent>,
  curator: IndexedCurator,
): Promise<SyncResult> {
  const [profileRes, collectionsRes] = await Promise.allSettled([
    agent.getProfile({ actor: curator.did }),
    listCollectionRecords(curator.did),
  ])

  // Never delete on transient fetch failures
  if (collectionsRes.status === 'rejected') {
    console.warn(`[syncCurator] Collection fetch failed for ${curator.did}, skipping:`, collectionsRes.reason)
    return 'skipped'
  }

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null
  const count = collectionsRes.value.length

  // Remove flagged profiles immediately and tombstone their collections.
  if (profile?.data && isProfileFlagged(profile.data)) {
    await tombstoneCuratorCollections(db, curator.did)
    await db.prepare('DELETE FROM curators WHERE did = ?').bind(curator.did).run()
    return 'removed'
  }

  // If AT Protocol returns 0 but curator previously had collections, skip.
  // PDS outages or rate limits can return empty success responses.
  // Only remove if the curator was already at 0 (confirmed empty).
  if (count === 0) {
    if (curator.collectionCount === 0) {
      await tombstoneCuratorCollections(db, curator.did)
      await db.prepare('DELETE FROM curators WHERE did = ?').bind(curator.did).run()
      return 'removed'
    }
    console.warn(`[syncCurator] ${curator.did} returned 0 collections but had ${curator.collectionCount}, skipping removal`)
    return 'skipped'
  }

  const labels = computeLabels({
    collectionCount: count,
    isEarlyAdopter: curator.labels.includes('early-curator'),
    existingLabels: curator.labels,
  })

  await db.prepare(`
    UPDATE curators SET
      handle = ?,
      display_name = ?,
      avatar = ?,
      collection_count = ?,
      labels = ?,
      last_profile_refresh = ?
    WHERE did = ?
  `).bind(
    profile?.data.handle ?? curator.handle,
    profile?.data.displayName ?? null,
    profile?.data.avatar ?? null,
    count,
    JSON.stringify(labels),
    new Date().toISOString(),
    curator.did,
  ).run()

  // Project the curator's collection records into the D1 index. Failures here
  // are non-fatal — the curator row update has already succeeded.
  await syncCuratorCollections(db, curator.did).catch((err) => {
    console.warn(`[syncCurator] Collection index sync failed for ${curator.did}:`, err)
  })

  return 'refreshed'
}

function countResults(results: PromiseSettledResult<SyncResult>[]) {
  const counts = { refreshed: 0, removed: 0, skipped: 0, errored: 0 }
  for (const r of results) {
    if (r.status === 'rejected') {
      counts.errored++
      console.warn('[curator-index] Unexpected sync error:', r.reason)
    }
    else {
      counts[r.value]++
    }
  }
  return counts
}

/**
 * Rebuild the full curator index from network state.
 * Re-fetches all profiles and collection counts. Skips curators
 * whose data can't be fetched (never deletes on transient errors).
 */
export async function rebuildIndex(db: D1Database) {
  const curators = await getAllCurators(db)
  const agent = getPublicAgent()
  const results = await Promise.allSettled(
    curators.map(c => syncCurator(db, agent, c)),
  )
  return countResults(results)
}

/**
 * Refresh curators whose profile data is older than the refresh interval.
 * Batched to 25 at a time to avoid rate limits.
 */
export async function refreshStaleCurators(db: D1Database) {
  const staleThreshold = new Date(Date.now() - REFRESH_INTERVAL).toISOString()
  const res = await db.prepare(
    'SELECT * FROM curators WHERE last_profile_refresh IS NULL OR last_profile_refresh < ? LIMIT 25',
  ).bind(staleThreshold).all<CuratorRow>()

  const stale = (res.results ?? []).map(rowToCurator)
  if (!stale.length)
    return countResults([])

  const agent = getPublicAgent()
  const results = await Promise.allSettled(
    stale.map(c => syncCurator(db, agent, c)),
  )
  return countResults(results)
}
