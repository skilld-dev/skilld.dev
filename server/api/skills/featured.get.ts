import type { TagPayload } from '../../jobs/generate-tags'
import { officialRepos } from '../../data/official-repos'
import { getDB } from '../../utils/db'
import { getGeneratedBatch } from '../../utils/skill-generated'
import { getFeaturedOfficialSections, getTopOwnersByCount } from '../../utils/skills-registry'

const DEFAULT_ORG_COUNT = 6
const DEFAULT_PER_ORG = 4

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const orgCount = Math.min(Math.max(Number(query.orgs) || DEFAULT_ORG_COUNT, 1), 20)
  const perOrg = Math.min(Math.max(Number(query.perOrg) || DEFAULT_PER_ORG, 1), 12)

  const orgRepos = officialRepos.filter(r => r.kind === 'org')
  const ownerToRepo = new Map(orgRepos.map(r => [r.owner, r.repo]))
  const officialOwners = new Set(ownerToRepo.keys())

  const ranked = await getTopOwnersByCount(event, officialOwners, orgCount)
  const featuredOrgs = ranked.map(({ owner }) => ({
    owner,
    repo: ownerToRepo.get(owner) ?? 'skills',
  }))

  const sections = await getFeaturedOfficialSections(event, featuredOrgs, perOrg)

  const allKeys = sections.flatMap(s => s.skills.map(sk => ({ owner: sk.owner, name: sk.name })))
  const tagMap = await getGeneratedBatch<TagPayload>(getDB(event), allKeys, 'tags')

  const enriched = sections.map(section => ({
    ...section,
    skills: section.skills.map(skill => ({
      ...skill,
      tags: tagMap.get(`${skill.owner}/${skill.name}`)?.payload.tags ?? [],
    })),
  }))

  return { sections: enriched }
})
