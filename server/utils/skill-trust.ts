import { officialRepos } from '../data/official-repos'

export type SkillTrustTier = 'official' | 'trusted-author' | 'trusted-curator' | 'candidate' | 'untrusted' | 'quarantined'
export type SkillTrustSource = 'manual' | 'official-list' | 'curator-reason' | 'downloads' | 'social-proof' | 'repo-scale' | 'computed'

export const TRUST_DOWNLOADS_CANDIDATE = 1_000
export const TRUST_SOCIAL_CANDIDATE = 1
export const TRUST_LARGE_REPO_SKILL_COUNT = 300

export interface SkillTrustInput {
  owner: string
  repo: string
  sourceResolved: boolean
  installs: number
  curatorReasonCount: number
  approvedSocialCount: number
  repoSkillCount: number
  overrideTier?: SkillTrustTier | null
  overrideReason?: string | null
}

export interface SkillTrustResult {
  tier: SkillTrustTier
  source: SkillTrustSource
  score: number
  reasons: string[]
}

const officialRepoKeys = new Set(officialRepos.map(r => `${r.owner}/${r.repo}`))

export function isOfficialRepo(owner: string, repo: string): boolean {
  return officialRepoKeys.has(`${owner}/${repo}`)
}

export function resolveSkillTrust(input: SkillTrustInput): SkillTrustResult {
  const reasons: string[] = []
  let score = 0

  if (input.overrideTier) {
    score += input.overrideTier === 'quarantined' ? -100 : 100
    reasons.push('manual_override')
    if (input.overrideReason?.trim())
      reasons.push('manual_reason')
    return {
      tier: input.overrideTier,
      source: 'manual',
      score,
      reasons,
    }
  }

  if (!input.sourceResolved) {
    return {
      tier: 'quarantined',
      source: 'computed',
      score: -50,
      reasons: ['source_missing'],
    }
  }

  if (isOfficialRepo(input.owner, input.repo)) {
    return {
      tier: 'official',
      source: 'official-list',
      score: 90,
      reasons: ['official_repo'],
    }
  }

  if (input.curatorReasonCount > 0) {
    score += 70 + Math.min(input.curatorReasonCount, 10)
    reasons.push('curator_reason')
    return {
      tier: 'trusted-curator',
      source: 'curator-reason',
      score,
      reasons,
    }
  }

  if (input.repoSkillCount >= TRUST_LARGE_REPO_SKILL_COUNT) {
    score -= 20
    reasons.push('large_repo')
  }

  if (input.installs >= TRUST_DOWNLOADS_CANDIDATE) {
    score += 40
    reasons.push('high_downloads')
  }

  if (input.approvedSocialCount >= TRUST_SOCIAL_CANDIDATE) {
    score += 20
    reasons.push('social_proof')
  }

  if (score >= 40) {
    return {
      tier: 'candidate',
      source: input.installs >= TRUST_DOWNLOADS_CANDIDATE ? 'downloads' : 'social-proof',
      score,
      reasons,
    }
  }

  return {
    tier: 'untrusted',
    source: input.repoSkillCount >= TRUST_LARGE_REPO_SKILL_COUNT ? 'repo-scale' : 'computed',
    score,
    reasons: reasons.length ? reasons : ['no_trust_signal'],
  }
}
