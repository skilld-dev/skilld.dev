import type { RegistrySkill } from '../utils/skills-registry'
import type { TaskSearchOutcome } from '../utils/task-search-run'
import type { SkillBoxSearchItem } from './skill-box-search'
import { presentSkillBoxItem } from './skill-box-search'

export interface TaskSearchRouteResult {
  outcome: TaskSearchOutcome
  /** The found Skills in the model's order. Empty for every other outcome. */
  skills: RegistrySkill[]
}

/**
 * The internal task search answer. Every outcome but `found` tells the panel
 * to keep the search results it already shows.
 */
export type TaskSearchAnswer
  = | { _tag: 'found', items: SkillBoxSearchItem[] }
    | { _tag: 'none' }
    | { _tag: 'limited', scope: 'visitor' | 'daily' }
    | { _tag: 'off' }
    | { _tag: 'failed' }

export function makeTaskSearchPresenter(officialOwners: Set<string>) {
  return ({ outcome, skills }: TaskSearchRouteResult): TaskSearchAnswer => {
    switch (outcome._tag) {
      case 'found':
        // A cached ref whose Skill has since left the registry finds no row.
        return skills.length
          ? { _tag: 'found', items: skills.map(skill => presentSkillBoxItem(skill, officialOwners)) }
          : { _tag: 'none' }
      case 'none':
        return { _tag: 'none' }
      case 'limited':
        return { _tag: 'limited', scope: outcome.scope }
      case 'off':
        return { _tag: 'off' }
      case 'failed':
        return { _tag: 'failed' }
    }
  }
}
