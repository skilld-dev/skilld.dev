/** Whether Skillgen can run on a repository. `packages` names each npm package whose Skill it updates. */
export type SkillgenEntryEligibility
  = | { _tag: 'Eligible', packages: string[] }
    | { _tag: 'Ineligible', message: string }

/** One repository on the account's Skillgen page. */
export interface SkillgenRepositoryEntry {
  owner: string
  repo: string
  optedIn: boolean
  eligibility: SkillgenEntryEligibility
}

/** A refusal is an expected answer, so it arrives as a value with the sentence to show. */
export type SkillgenOptInResult
  = | { _tag: 'Saved', owner: string, repo: string, optedIn: boolean }
    | { _tag: 'Refused', message: string }
