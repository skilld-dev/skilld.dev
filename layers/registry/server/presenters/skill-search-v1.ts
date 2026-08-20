import { isSkillName } from '../schemas/skill-search-v1'

interface SearchSkill {
  name: string
  owner: string
  repo: string
  description: string | null
  stars: number
}

interface SearchResult {
  items: SearchSkill[]
  total: number
}

export function presentSkillSearch(result: SearchResult) {
  return {
    items: result.items
      .filter(skill => isSkillName(skill.name))
      .map(skill => ({
        name: skill.name,
        description: skill.description?.slice(0, 500) ?? null,
        source: {
          provider: 'github' as const,
          owner: skill.owner,
          repository: skill.repo,
          selector: { type: 'named-skill' as const, name: skill.name },
        },
        stargazerCount: Math.max(0, Math.trunc(skill.stars)),
      })),
    total: Math.max(0, Math.trunc(result.total)),
  }
}
