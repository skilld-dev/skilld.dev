import { officialRepos } from '~~/layers/registry/server/data/official-repos'

export type SupportedRepoTier = 'core-official' | 'trusted-author' | 'curated' | 'candidate'

export interface SupportedRepoSeed {
  owner: string
  repo: string
  supportTier: SupportedRepoTier
  reason: string
}

export const initialSupportedRepos: SupportedRepoSeed[] = officialRepos.map(repo => ({
  owner: repo.owner,
  repo: repo.repo,
  supportTier: repo.kind === 'org' ? 'core-official' : 'trusted-author',
  reason: repo.kind === 'org'
    ? 'Seeded from official skill repository allowlist.'
    : 'Seeded from trusted author repository allowlist.',
}))

export const SUPPORTED_SKILL_SQL = `
  NOT EXISTS (
    SELECT 1
    FROM supported_skills excluded_skill
    WHERE excluded_skill.owner = skills.owner
      AND excluded_skill.name = skills.name
      AND excluded_skill.support_mode = 'exclude'
  )
  AND (
    EXISTS (
      SELECT 1
      FROM supported_repos supported_repo
      WHERE supported_repo.owner = skills.owner
        AND supported_repo.repo = skills.repo
        AND supported_repo.enabled = 1
    )
    OR EXISTS (
      SELECT 1
      FROM supported_skills included_skill
      WHERE included_skill.owner = skills.owner
        AND included_skill.name = skills.name
        AND included_skill.support_mode = 'include'
    )
  )
`
