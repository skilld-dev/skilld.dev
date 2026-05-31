import type { SkillTrustTier } from './skill-trust'
import { officialRepos } from '#layers/registry/server/data/official-repos'

export const SEO_INDEXABLE_MIN_SCORE = 4
export const SEO_INSTALLS_STRONG = 1_000
export const SEO_INSTALLS_SOME = 100
export const SEO_RECENT_SECONDS = 180 * 86400
export const SEO_STARS_STRONG = 500
export const SEO_REPO_BROAD_SKILL_COUNT = 100

export interface SkillIndexabilityInput {
  isOfficial: boolean
  /** Skill imported by an authenticated GitHub user from a repo they own. */
  ownerVerified: boolean
  sourceResolved: boolean
  trustTier: SkillTrustTier
  curatorCount: number
  curatorReasonCount: number
  approvedSocialCount: number
  authorSocialCount: number
  installs: number
  stars: number
  pushedAt: number | null
  referencesCount: number
  description: string | null
  repoSkillCount: number
}

export interface SkillIndexabilityResult {
  score: number
  indexable: boolean
  reasons: string[]
}

export const officialRepoKeys = new Set(officialRepos.map(r => `${r.owner}/${r.repo}`))

export function isOfficialSkillRepo(owner: string, repo: string): boolean {
  return officialRepoKeys.has(`${owner}/${repo}`)
}

function scoreAllowsIndexing(input: SkillIndexabilityInput): boolean {
  return input.sourceResolved
    && input.description?.trim() !== ''
    && input.description !== null
}

export function scoreSkillIndexability(input: SkillIndexabilityInput, now = Math.floor(Date.now() / 1000)): SkillIndexabilityResult {
  let score = 0
  const reasons: string[] = []

  if (input.curatorReasonCount > 0) {
    score += 3
    reasons.push('curator_reason')
  }
  else if (input.curatorCount > 0) {
    score += 1
    reasons.push('curator_saved')
  }

  if (input.repoSkillCount >= SEO_REPO_BROAD_SKILL_COUNT) {
    score -= 2
    reasons.push('broad_repo')
  }

  if (input.isOfficial) {
    score += 2
    reasons.push('official_source')
  }

  if (input.ownerVerified) {
    score += 3
    reasons.push('owner_verified')
  }

  if (input.sourceResolved) {
    score += 2
    reasons.push('source_resolved')
  }
  else {
    score -= 3
    reasons.push('source_missing')
  }

  if (input.authorSocialCount > 0) {
    score += 1
    reasons.push('author_social_proof')
  }
  else if (input.approvedSocialCount > 0) {
    score += 1
    reasons.push('community_social_proof')
  }

  if (input.installs >= SEO_INSTALLS_STRONG) {
    score += 2
    reasons.push('strong_installs')
  }
  else if (input.installs >= SEO_INSTALLS_SOME) {
    score += 1
    reasons.push('some_installs')
  }

  if (input.stars >= SEO_STARS_STRONG) {
    score += 1
    reasons.push('strong_github_stars')
  }

  if (input.pushedAt && input.pushedAt >= now - SEO_RECENT_SECONDS) {
    score += 1
    reasons.push('recent_source_activity')
  }

  if (input.referencesCount > 0) {
    score += 1
    reasons.push('has_references')
  }

  if (input.description?.trim()) {
    score += 1
    reasons.push('has_description')
  }

  const hasPrimaryTrustSignal = input.curatorReasonCount > 0
    || input.isOfficial
    || input.ownerVerified
    || input.authorSocialCount > 0
    || input.approvedSocialCount > 0
    || input.installs >= SEO_INSTALLS_STRONG

  if (!hasPrimaryTrustSignal)
    reasons.push('no_primary_trust_signal')

  reasons.push(`trust_${input.trustTier}`)

  return {
    score,
    indexable: score >= SEO_INDEXABLE_MIN_SCORE && hasPrimaryTrustSignal && scoreAllowsIndexing(input),
    reasons,
  }
}
