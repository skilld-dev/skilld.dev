/**
 * Curator index stored in Nitro storage. Tracks who has published collections via skilld.
 * Includes rebuild capability from network state and handle/profile refresh.
 */

import { getPublicAgent } from './agent'
import { COLLECTION_NSID } from './lexicons/collection'
import { isProfileFlagged } from './moderation'

const STORAGE_KEY = 'skilld:curators'
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

interface CuratorIndex {
  curators: Record<string, IndexedCurator>
  updatedAt: string
}

async function getIndex(): Promise<CuratorIndex> {
  return await useStorage('data').getItem<CuratorIndex>(STORAGE_KEY) ?? {
    curators: {},
    updatedAt: new Date().toISOString(),
  }
}

async function saveIndex(index: CuratorIndex) {
  index.updatedAt = new Date().toISOString()
  await useStorage('data').setItem(STORAGE_KEY, index)
}

/** Register or update a curator after they publish a collection. */
export async function upsertCurator(curator: {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  collectionCount: number
}) {
  const index = await getIndex()
  const existing = index.curators[curator.did]
  const now = new Date().toISOString()

  const labels = computeLabels({
    collectionCount: curator.collectionCount,
    isEarlyAdopter: Object.keys(index.curators).length < 50,
    existingLabels: existing?.labels,
  })

  index.curators[curator.did] = {
    did: curator.did,
    handle: curator.handle,
    displayName: curator.displayName,
    avatar: curator.avatar,
    collectionCount: curator.collectionCount,
    firstPublished: existing?.firstPublished ?? now,
    lastPublished: now,
    labels,
  }

  await saveIndex(index)
}

/** Remove a curator if they have no remaining collections. */
export async function removeCuratorIfEmpty(did: string) {
  const index = await getIndex()
  if (index.curators[did]?.collectionCount === 0) {
    delete index.curators[did]
    await saveIndex(index)
  }
}

/** Get all known curators. */
export async function getAllCurators(): Promise<IndexedCurator[]> {
  const index = await getIndex()
  return Object.values(index.curators)
}

/** Compute labels based on curator activity. */
function computeLabels(opts: {
  collectionCount: number
  isEarlyAdopter: boolean
  existingLabels?: CuratorLabel[]
}): CuratorLabel[] {
  const labels = new Set<CuratorLabel>(opts.existingLabels ?? [])

  // Early curator: one of the first 50 curators to publish
  if (opts.isEarlyAdopter)
    labels.add('early-curator')

  // Prolific: 5+ collections
  if (opts.collectionCount >= 5)
    labels.add('prolific')
  else labels.delete('prolific')

  // verified-maintainer is manually assigned, never auto-removed
  return [...labels]
}

/** Manually add a label to a curator (admin operation). */
export async function addCuratorLabel(did: string, label: CuratorLabel) {
  const index = await getIndex()
  const curator = index.curators[did]
  if (!curator)
    return
  if (!curator.labels.includes(label)) {
    curator.labels.push(label)
    await saveIndex(index)
  }
}

/** Manually remove a label from a curator (admin operation). */
export async function removeCuratorLabel(did: string, label: CuratorLabel) {
  const index = await getIndex()
  const curator = index.curators[did]
  if (!curator)
    return
  curator.labels = curator.labels.filter(l => l !== label)
  await saveIndex(index)
}

/** Get curators matching a set of DIDs. */
export async function getCuratorsByDids(dids: string[]): Promise<IndexedCurator[]> {
  const index = await getIndex()
  const didSet = new Set(dids)
  return Object.values(index.curators).filter(c => didSet.has(c.did))
}

/**
 * Rebuild the curator index from network state.
 * Re-fetches profiles and collection counts for all known curators.
 * Removes curators with zero collections or flagged profiles.
 */
export async function rebuildIndex(): Promise<{ refreshed: number, removed: number }> {
  const index = await getIndex()
  const agent = getPublicAgent()
  const dids = Object.keys(index.curators)
  let removed = 0

  await Promise.all(dids.map(async (did) => {
    const [profile, collections] = await Promise.all([
      agent.getProfile({ actor: did }).catch(() => null),
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: COLLECTION_NSID,
        limit: 100,
      }).catch(() => null),
    ])

    const count = collections?.data.records.length ?? 0

    // Remove curators with no collections or flagged profiles
    if (count === 0 || (profile?.data && isProfileFlagged(profile.data))) {
      delete index.curators[did]
      removed++
      return
    }

    const existing = index.curators[did]!
    existing.handle = profile?.data.handle ?? existing.handle
    existing.displayName = profile?.data.displayName
    existing.avatar = profile?.data.avatar
    existing.collectionCount = count
    existing.lastProfileRefresh = new Date().toISOString()
    existing.labels = computeLabels({
      collectionCount: count,
      isEarlyAdopter: existing.labels.includes('early-curator'),
      existingLabels: existing.labels,
    })
  }))

  await saveIndex(index)
  return { refreshed: dids.length - removed, removed }
}

/**
 * Refresh stale curator profiles (handle changes, avatar updates, moderation flags).
 * Only refreshes curators whose profile data is older than the refresh interval.
 */
export async function refreshStaleCurators(): Promise<number> {
  const index = await getIndex()
  const agent = getPublicAgent()
  const now = Date.now()
  let refreshed = 0

  const stale = Object.values(index.curators).filter((c) => {
    const lastRefresh = c.lastProfileRefresh ? new Date(c.lastProfileRefresh).getTime() : 0
    return now - lastRefresh > REFRESH_INTERVAL
  })

  // Batch refresh up to 25 at a time to avoid overwhelming the AppView
  const batch = stale.slice(0, 25)

  await Promise.all(batch.map(async (curator) => {
    const profile = await agent.getProfile({ actor: curator.did }).catch(() => null)
    if (!profile?.data)
      return

    // Remove flagged curators
    if (isProfileFlagged(profile.data)) {
      delete index.curators[curator.did]
      refreshed++
      return
    }

    // Update if handle or profile data changed
    curator.handle = profile.data.handle
    curator.displayName = profile.data.displayName
    curator.avatar = profile.data.avatar
    curator.lastProfileRefresh = new Date().toISOString()
    refreshed++
  }))

  if (refreshed > 0)
    await saveIndex(index)

  return refreshed
}
