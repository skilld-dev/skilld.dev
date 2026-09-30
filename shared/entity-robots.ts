/**
 * The robots directive for pages that are not Skill pages.
 *
 * Owner decision, 2026-10-01: author profiles, collections, owner hubs and
 * multi-Skill repository hubs stay live and linked, and are never indexed. No
 * sitemap lists them, so the sitemap equals the indexable set.
 *
 * A single-Skill repository hub is the Skill's own page. It returns `null`
 * here, so the page emits no robots tag of its own and the Skill page decision
 * (`resolveSkillPageState`) is the only one. Two competing tags would let a
 * default noindex override an admitted Skill.
 */
export type EntityPage
  = | { _tag: 'author-profile' }
    | { _tag: 'collection' }
    | { _tag: 'owner-hub' }
    | { _tag: 'repo-hub', renderedAsSkill: boolean }

export function entityRobots(page: EntityPage): 'noindex,follow' | null {
  if (page._tag === 'repo-hub' && page.renderedAsSkill)
    return null
  return 'noindex,follow'
}
