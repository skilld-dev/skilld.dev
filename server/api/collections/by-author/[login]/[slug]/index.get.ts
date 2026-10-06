import { collectionDetailPresenter } from '~~/server/presenters/collection'
import { loadCollectionDetail } from '~~/server/utils/collections'
import { runCheckFlagKey } from '#shared/run-check-flags'
import { defineApiHandler } from '#shared/server/handler'
import { fetchFlaggedSkillKeys } from '#shared/server/run-check-flags'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    const [detail, flagged] = await Promise.all([
      loadCollectionDetail(platform.db, login, slug),
      fetchFlaggedSkillKeys('collection-detail'),
    ])
    if (!detail)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    // A Skill whose run checks keep failing leaves the page until a check
    // passes. A Repository entry names no single Skill, so it stays.
    const skills = detail.skills.filter(skill => !skill.name || !flagged.has(runCheckFlagKey(skill.owner, skill.repo, skill.name)))
    return collectionDetailPresenter(detail.collection, skills)
  },
})
