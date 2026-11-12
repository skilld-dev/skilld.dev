export interface RunnableSkillsDto {
  /** `revision` is the Skill folder's Git tree SHA. It changes only when a file in that folder changes. Null when sync has not read it. */
  items: Array<{ owner: string, repository: string, name: string, revision: string | null }>
}

export function presentRunnableSkills(rows: Array<{ owner: string, repo: string, name: string, revision: string | null }>): RunnableSkillsDto {
  return {
    items: rows.map(row => ({ owner: row.owner, repository: row.repo, name: row.name, revision: row.revision })),
  }
}
