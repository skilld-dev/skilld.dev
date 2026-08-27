import { createError, getRouterParam } from 'h3'
import { getDB } from '#server/utils/db'
import { createSkillBadgeResponse, loadSkillBadgeLikeCount, parseSkillBadgeTarget } from '../../utils/skill-badge'

export default defineEventHandler(async (event) => {
  const target = parseSkillBadgeTarget(getRouterParam(event, 'slug') ?? '')
  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Badge not found',
    })
  }

  const likeCount = await loadSkillBadgeLikeCount(getDB(event), target)
  return createSkillBadgeResponse(likeCount)
})
