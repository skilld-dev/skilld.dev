/** One repository on the account's Skillgen page, with its opt-in. */
export interface SkillgenRepositoryEntry {
  owner: string
  repo: string
  optedIn: boolean
}

/** A refusal is an expected answer, so it arrives as a value with the sentence to show. */
export type SkillgenOptInResult
  = | ({ _tag: 'Saved' } & SkillgenRepositoryEntry)
    | { _tag: 'Refused', message: string }
