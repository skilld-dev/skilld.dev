import { describe, expect, it } from 'vitest'
import { resolveSkillPageState } from '../../layers/registry/app/utils/skill-page-state'
import { entityRobots } from '../../shared/entity-robots'

/** What a repository hub tells crawlers: its own decision, else the Skill page's. */
function hubRobots(renderedAsSkill: boolean, indexable: boolean) {
  return entityRobots({ _tag: 'repo-hub', renderedAsSkill })
    ?? resolveSkillPageState({ _tag: 'loaded', indexable, sourceGone: false, registryPath: '/gh/o/r', duplicateCanonicalPath: null }).robots
}

describe('entityRobots', () => {
  it('never indexes an author profile, a collection, or an owner hub', () => {
    expect(entityRobots({ _tag: 'author-profile' })).toBe('noindex,follow')
    expect(entityRobots({ _tag: 'collection' })).toBe('noindex,follow')
    expect(entityRobots({ _tag: 'owner-hub' })).toBe('noindex,follow')
  })

  it('never indexes a multi-Skill repository hub', () => {
    expect(hubRobots(false, true)).toBe('noindex,follow')
  })

  it('leaves an admitted single-Skill hub to the Skill page, which indexes it', () => {
    expect(entityRobots({ _tag: 'repo-hub', renderedAsSkill: true })).toBeNull()
    expect(hubRobots(true, true)).toBe('index,follow')
  })

  it('noindexes a single-Skill hub the trending admission rule did not admit', () => {
    expect(hubRobots(true, false)).toBe('noindex,follow')
  })
})
