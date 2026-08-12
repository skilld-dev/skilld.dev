export interface CollectionOgSkill {
  repo: string
  name: string | null
  displayName: string | null
  reason: string | null
}

export interface CollectionOgSource {
  authorLogin: string
  authorName: string | null
  authorAvatar: string | null
  name: string
  preamble: string | null
  skills: CollectionOgSkill[]
}

export function resolveCollectionOgProps(collection: CollectionOgSource) {
  const reasonedSkill = collection.skills.find(skill => skill.reason?.trim())
  const skillTitle = (skill: CollectionOgSkill) => skill.displayName || skill.name || skill.repo

  return {
    name: collection.name,
    description: collection.preamble ?? '',
    curatorHandle: collection.authorLogin,
    curatorName: collection.authorName || collection.authorLogin,
    curatorAvatar: collection.authorAvatar || `https://github.com/${collection.authorLogin}.png?size=128`,
    skillCount: collection.skills.length,
    skills: collection.skills.map(skillTitle),
    reason: reasonedSkill?.reason?.trim() ?? '',
    reasonSkill: reasonedSkill ? skillTitle(reasonedSkill) : '',
  }
}
