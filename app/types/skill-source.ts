export interface SkillSourceItem {
  owner: string
  repo: string
  name: string
  displayName: string
  maintainerName?: string | null
  description?: string | null
  context?: string | null
}
