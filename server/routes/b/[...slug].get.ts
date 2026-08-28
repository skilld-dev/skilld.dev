import { createError, getQuery, getRouterParam } from 'h3'
import { getDB } from '#server/utils/db'
import { createSkillBadgeResponse, loadSkillBadgeLikeCount, parseSkillBadgeAppearance, parseSkillBadgeTarget } from '../../utils/skill-badge'

export default defineEventHandler(async (event) => {
  const target = parseSkillBadgeTarget(getRouterParam(event, 'slug') ?? '')
  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Badge not found',
    })
  }

  const query = getQuery(event)
  const appearance = parseSkillBadgeAppearance(query)

  if (query.likes !== '1')
    return createSkillBadgeResponse({ target, ...appearance })

  const likeCount = await loadSkillBadgeLikeCount(getDB(event), target)
  return createSkillBadgeResponse({ target, ...appearance, likeCount })
})
