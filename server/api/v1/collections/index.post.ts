import { collectionsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { loadSkillCardRows, skillCardKey } from '#shared/server/skill-cards'
import { presentCollection } from '../../../presenters/collection-v1'
import { createCollection, loadCollectionPage } from '../../../utils/collections'

/** The contract caps a new collection at 100 Skills, so one page holds all of them. */
const CREATED_PAGE = { limit: 100, offset: 0 }

export default defineApiOperation({
  operation: collectionsV1.operations.create,
  handler: async ({ platform, input, user }) => {
    const { slug, title, description, skills } = input.body
    const entries = skills.map(skill => ({
      owner: skill.owner,
      repo: skill.repository,
      name: skill.name,
      reason: skill.reason ?? null,
    }))

    // A collection entry for a Skill the registry lacks would never show, so
    // refuse it here instead of storing it.
    const known = await loadSkillCardRows(platform.db, entries)
    const unknown = entries.map(skillCardKey).filter(key => !known.has(key))
    if (unknown.length)
      return operationFailure('INVALID_REQUEST', `The registry has no Skill ${unknown.slice(0, 3).join(', ')}.`)

    const outcome = await createCollection(platform.db, user.id, {
      slug,
      name: title,
      preamble: description ?? null,
      skills: entries,
    })
    if (outcome._tag === 'SlugTaken')
      return operationFailure('CONFLICT', `You already have a collection with the slug ${slug}.`)

    const page = await loadCollectionPage(platform.db, user.login, slug, CREATED_PAGE)
    if (!page)
      throw new Error(`collection @${user.login}/${slug} is missing after create`)
    return presentCollection(page)
  },
})
