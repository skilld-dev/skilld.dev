export type DuplicateGroupReason = 'duplicate_description' | 'duplicate_title'

export interface DuplicateCandidate {
  owner: string
  repo: string
  name: string
  display_name: string
  description: string | null
  installs: number | null
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
  installs: number
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

export const DUPLICATE_DESCRIPTION_MIN_LENGTH = 80

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

export function normalizeDuplicateText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function duplicateRankingSignals(row: DuplicateCandidate): DuplicateRankingSignals {
  return {
    supportTier: row.support_tier,
    supportTierRank: row.support_tier ? SUPPORT_TIER_RANK[row.support_tier] ?? 0 : 0,
    trustTier: row.trust_tier,
    trustTierRank: row.trust_tier ? TRUST_TIER_RANK[row.trust_tier] ?? 0 : 0,
    installs: row.installs ?? 0,
    stars: row.stars ?? 0,
    pushedAt: row.pushed_at ?? null,
  }
}

export function canonicalDuplicateSort(a: DuplicateCandidate, b: DuplicateCandidate): number {
  const aSignals = duplicateRankingSignals(a)
  const bSignals = duplicateRankingSignals(b)
  return bSignals.installs - aSignals.installs
    || bSignals.supportTierRank - aSignals.supportTierRank
    || bSignals.trustTierRank - aSignals.trustTierRank
    || bSignals.stars - aSignals.stars
    || (bSignals.pushedAt ?? 0) - (aSignals.pushedAt ?? 0)
    || skillSlug(a).localeCompare(skillSlug(b))
}

export function findDuplicateCanonicalGroups<T extends DuplicateCandidate>(
  rows: T[],
): DuplicateGroupRecommendation<T>[] {
  const assigned = new Set<string>()
  const descriptionGroups = collectGroups(
    rows,
    row => normalizeDuplicateText(row.description),
    DUPLICATE_DESCRIPTION_MIN_LENGTH,
    'duplicate_description',
    assigned,
  )

  for (const group of descriptionGroups) {
    for (const row of group.rows)
      assigned.add(skillSlug(row))
  }

  const titleGroups = collectGroups(
    rows.filter(row => !assigned.has(skillSlug(row))),
    row => normalizeDuplicateText(row.display_name),
    2,
    'duplicate_title',
    assigned,
  )

  return [...descriptionGroups, ...titleGroups]
    .sort((a, b) => b.rows.length - a.rows.length || skillSlug(a.canonical).localeCompare(skillSlug(b.canonical)))
}

export function findDuplicateGroupForSlug<T extends DuplicateCandidate>(
  rows: T[],
  slug: string,
): DuplicateGroupRecommendation<T> | null {
  return findDuplicateCanonicalGroups(rows).find(group => group.rows.some(row => skillSlug(row) === slug)) ?? null
}

export function duplicateCanonicalSlugSet(rows: DuplicateCandidate[]): Set<string> {
  return new Set(findDuplicateCanonicalGroups(rows).map(group => skillSlug(group.canonical)))
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
  ignoredSlugs: Set<string>,
): DuplicateGroupRecommendation<T>[] {
  const byKey = new Map<string, T[]>()
  for (const row of rows) {
    const slug = skillSlug(row)
    if (ignoredSlugs.has(slug))
      continue
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
      const ranked = [...group].sort(canonicalDuplicateSort)
      return {
        reason,
        value,
        canonical: ranked[0]!,
        duplicates: ranked.slice(1),
        rows: ranked,
      }
    })
}
