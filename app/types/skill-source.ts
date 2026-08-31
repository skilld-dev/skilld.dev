export interface SkillSourceItem {
  owner: string
  repo: string
  name: string
  displayName: string
  /** Final public route. UI callers must not rebuild it. */
  registryPath: string
  maintainerName?: string | null
  description?: string | null
  context?: string | null
}
