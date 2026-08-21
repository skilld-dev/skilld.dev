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

const MAX_DESCRIPTION_BYTES = 500

/**
 * Truncate on the byte budget the CLI enforces. Cutting a multi-byte
 * character in half would emit invalid UTF-8, so walk back to the
 * previous boundary.
 */
function truncateUtf8Bytes(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value)
  if (bytes <= maxBytes)
    return value
  let slice = value.slice(0, maxBytes)
  while (Buffer.byteLength(slice) > maxBytes)
    slice = slice.slice(0, -1)
  return slice
}

export function presentSkillSearch(result: SearchResult) {
  return {
    items: result.items
      .filter(skill => isSkillName(skill.name))
      .map(skill => ({
        name: skill.name,
        description: skill.description
          ? truncateUtf8Bytes(skill.description, MAX_DESCRIPTION_BYTES)
          : null,
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
