import type { QueryUnderstanding } from '../utils/search-intent'
import type { SkillBoxSearchResult } from '../utils/skill-box-search'
import type { AlternateSource, SearchMode } from '../utils/skill-search'
import type { RegistrySkill } from '../utils/skills-registry'

/** One Skill row in the search box: what the row and its run chip draw. */
export interface SkillBoxSearchItem {
  name: string
  owner: string
  repo: string
  slug: string
  registryPath: string
  description: string | null
  stars: number
  official: boolean
  trustTier: string
  modifiedAt: number | null
  pushedAt: number | null
  sourceCount: number
  alternateSources: AlternateSource[]
}

export type SkillBoxRepository
  = | { _tag: 'indexed', owner: string, repo: string, stars: number, skillCount: number, registryPath: string }
    | { _tag: 'not-indexed', owner: string, repo: string, url: string }

/**
 * The internal search box answer. Not part of the public API: the frozen
 * `skills.search` v1 answer stays as it is.
 */
export interface SkillBoxSearchAnswer {
  kind: SkillBoxSearchResult['kind']
  repository: SkillBoxRepository | null
  owner: string | null
  /** What query understanding read from a sentence, or null when it did not run. */
  understood: QueryUnderstanding | null
  items: SkillBoxSearchItem[]
  total: number
  mode: SearchMode | null
}

function presentItem(skill: RegistrySkill, officialOwners: Set<string>): SkillBoxSearchItem {
  return {
    name: skill.name,
    owner: skill.owner,
    repo: skill.repo,
    slug: skill.slug,
    registryPath: skill.registryPath,
    description: skill.description,
    stars: skill.stars,
    official: officialOwners.has(skill.owner),
    trustTier: skill.trustTier,
    modifiedAt: skill.modifiedAt,
    pushedAt: skill.pushedAt,
    sourceCount: skill.sourceCount ?? 1,
    alternateSources: skill.alternateSources ?? [],
  }
}

export function makeSkillBoxSearchPresenter(officialOwners: Set<string>) {
  return (result: SkillBoxSearchResult): SkillBoxSearchAnswer => ({
    kind: result.kind,
    repository: result.repository?._tag === 'indexed'
      ? { ...result.repository, registryPath: `/gh/${result.repository.owner}/${result.repository.repo}` }
      : result.repository,
    owner: result.owner,
    understood: result.intent?._tag === 'understood' ? result.intent.understanding : null,
    items: result.items.map(skill => presentItem(skill, officialOwners)),
    total: result.total,
    mode: result.mode ?? null,
  })
}
