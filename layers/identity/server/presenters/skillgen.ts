import type { SkillgenOptInResult, SkillgenRepositoryEntry } from '../../shared/contracts/skillgen'
import type { SkillgenRepositoryRow } from '../utils/skillgen'

export function skillgenRepositoriesPresenter(rows: SkillgenRepositoryRow[]): { items: SkillgenRepositoryEntry[] } {
  return { items: rows.map(row => ({ owner: row.owner, repo: row.repo, optedIn: row.optedIn })) }
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
