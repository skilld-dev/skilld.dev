export interface RunnableSkillsDto {
  /** `revision` changes whenever the repository gets a push. Null when sync has not read it. */
  items: Array<{ owner: string, repository: string, name: string, revision: string | null }>
}

export function presentRunnableSkills(rows: Array<{ owner: string, repo: string, name: string, pushedAt: number | null }>): RunnableSkillsDto {
  return {
    items: rows.map(row => ({
      owner: row.owner,
      repository: row.repo,
      name: row.name,
      revision: row.pushedAt === null ? null : String(row.pushedAt),
    })),
  }
}
