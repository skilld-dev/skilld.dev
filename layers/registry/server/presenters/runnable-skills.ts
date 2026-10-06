export interface RunnableSkillsDto {
  items: Array<{ owner: string, repository: string, name: string }>
}

export function presentRunnableSkills(rows: Array<{ owner: string, repo: string, name: string }>): RunnableSkillsDto {
  return { items: rows.map(row => ({ owner: row.owner, repository: row.repo, name: row.name })) }
}
