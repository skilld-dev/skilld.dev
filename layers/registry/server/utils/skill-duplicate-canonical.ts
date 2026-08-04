export type DuplicateGroupReason = 'duplicate_content'

export interface DuplicateCandidate {
  owner: string
  repo: string
  name: string
  display_name: string
  description: string | null
  rendered_raw_sha256: string | null
  stars: number | null
  pushed_at: number | null
  support_tier: string | null
  trust_tier: string | null
}

export interface DuplicateRankingSignals {
  supportTier: string | null
  supportTierRank: number
  trustTier: string | null
  trustTierRank: number
  stars: number
  pushedAt: number | null
}

export interface DuplicateGroupRecommendation<T extends DuplicateCandidate = DuplicateCandidate> {
  reason: DuplicateGroupReason
  value: string
  canonical: T
  duplicates: T[]
  rows: T[]
}

const SHA256_HEX_LENGTH = 64

const SUPPORT_TIER_RANK: Record<string, number> = {
  'core-official': 4,
  'trusted-author': 3,
  'curated': 2,
  'candidate': 1,
}

const TRUST_TIER_RANK: Record<string, number> = {
  'official': 5,
  'trusted-author': 4,
  'trusted-curator': 3,
  'candidate': 2,
  'untrusted': 1,
  'quarantined': 0,
  // Legacy names from older audits.
  'trusted': 4,
  'curated': 3,
  'discovered': 2,
}

export function skillSlug(row: Pick<DuplicateCandidate, 'owner' | 'repo' | 'name'>): string {
  return `${row.owner}/${row.repo}/${row.name}`
}

export function duplicateRankingSignals(row: DuplicateCandidate): DuplicateRankingSignals {
  return {
    supportTier: row.support_tier,
    supportTierRank: row.support_tier ? SUPPORT_TIER_RANK[row.support_tier] ?? 0 : 0,
    trustTier: row.trust_tier,
    trustTierRank: row.trust_tier ? TRUST_TIER_RANK[row.trust_tier] ?? 0 : 0,
    stars: row.stars ?? 0,
    pushedAt: row.pushed_at ?? null,
  }
}

export type CanonicalSort = (a: DuplicateCandidate, b: DuplicateCandidate) => number

export function canonicalDuplicateSort(a: DuplicateCandidate, b: DuplicateCandidate): number {
  const aSignals = duplicateRankingSignals(a)
  const bSignals = duplicateRankingSignals(b)
  return bSignals.supportTierRank - aSignals.supportTierRank
    || bSignals.trustTierRank - aSignals.trustTierRank
    || bSignals.stars - aSignals.stars
    || (bSignals.pushedAt ?? 0) - (aSignals.pushedAt ?? 0)
    || skillSlug(a).localeCompare(skillSlug(b))
}

/**
 * Canonical pick for user-facing discovery. Trust and support tier lead,
 * GitHub stars only break provenance ties.
 *
 * VISION anti-scope 4: the mirrored copy we show is the one with the strongest
 * provenance. Canonical GitHub stars are supporting evidence only.
 */
export function canonicalTrustFirstSort(a: DuplicateCandidate, b: DuplicateCandidate): number {
  const aSignals = duplicateRankingSignals(a)
  const bSignals = duplicateRankingSignals(b)
  return bSignals.supportTierRank - aSignals.supportTierRank
    || bSignals.trustTierRank - aSignals.trustTierRank
    || bSignals.stars - aSignals.stars
    || (bSignals.pushedAt ?? 0) - (aSignals.pushedAt ?? 0)
    || skillSlug(a).localeCompare(skillSlug(b))
}

export function findDuplicateCanonicalGroups<T extends DuplicateCandidate>(
  rows: T[],
  canonicalSort: CanonicalSort = canonicalDuplicateSort,
): DuplicateGroupRecommendation<T>[] {
  return collectGroups(
    rows,
    row => (row.rendered_raw_sha256 ?? '').trim().toLowerCase(),
    SHA256_HEX_LENGTH,
    'duplicate_content',
    canonicalSort,
  )
    .sort((a, b) => b.rows.length - a.rows.length || skillSlug(a.canonical).localeCompare(skillSlug(b.canonical)))
}

export function findDuplicateGroupForSlug<T extends DuplicateCandidate>(
  rows: T[],
  slug: string,
): DuplicateGroupRecommendation<T> | null {
  return findDuplicateCanonicalGroups(rows).find(group => group.rows.some(row => skillSlug(row) === slug)) ?? null
}

export function duplicateWeakerSlugSet(rows: DuplicateCandidate[]): Set<string> {
  const weaker = new Set<string>()
  for (const group of findDuplicateCanonicalGroups(rows)) {
    for (const row of group.duplicates)
      weaker.add(skillSlug(row))
  }
  return weaker
}

function collectGroups<T extends DuplicateCandidate>(
  rows: T[],
  key: (row: T) => string,
  minLength: number,
  reason: DuplicateGroupReason,
  canonicalSort: CanonicalSort,
): DuplicateGroupRecommendation<T>[] {
  const byKey = new Map<string, T[]>()
  for (const row of rows) {
    const value = key(row)
    if (value.length < minLength)
      continue
    const group = byKey.get(value) ?? []
    group.push(row)
    byKey.set(value, group)
  }

  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([value, group]) => {
      const ranked = [...group].sort(canonicalSort)
      return {
        reason,
        value,
        canonical: ranked[0]!,
        duplicates: ranked.slice(1),
        rows: ranked,
      }
    })
}
