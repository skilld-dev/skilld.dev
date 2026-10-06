import type { SkillgenOptInResult, SkillgenRepositoryEntry } from '../../shared/contracts/skillgen'
import type { SkillgenInspectedRow } from '../utils/skillgen'

export function skillgenRepositoriesPresenter(rows: SkillgenInspectedRow[]): { items: SkillgenRepositoryEntry[] } {
  return { items: rows.map(row => ({ owner: row.owner, repo: row.repo, optedIn: row.optedIn, eligibility: row.eligibility })) }
}

export function skillgenOptInPresenter(result: SkillgenOptInResult): SkillgenOptInResult {
  return result._tag === 'Saved'
    ? { _tag: 'Saved', owner: result.owner, repo: result.repo, optedIn: result.optedIn }
    : { _tag: 'Refused', message: result.message }
}

/** The Worker reads `repositories`: lowercased `owner/repo` names that opted in. */
export function skillgenOptInsPresenter(fullNames: string[]): { repositories: string[] } {
  return { repositories: fullNames }
}
