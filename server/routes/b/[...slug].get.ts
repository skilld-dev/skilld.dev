import { createError, getQuery, getRouterParam } from 'h3'
import { getDB } from '#server/utils/db'
import { createSkillBadgeResponse, loadSkillBadgeAward, loadSkillBadgeLikeCount, parseSkillBadgeAppearance, parseSkillBadgeTarget } from '../../utils/skill-badge'

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
  const wantsLikes = query.likes === '1'
  const wantsAward = query.trending === '1'

  if (!wantsLikes && !wantsAward)
    return createSkillBadgeResponse({ target, ...appearance })

  const db = getDB(event)
  const [likeCount, award] = await Promise.all([
    wantsLikes ? loadSkillBadgeLikeCount(db, target) : undefined,
    wantsAward ? loadSkillBadgeAward(db, target) : undefined,
  ])
  return createSkillBadgeResponse({ target, ...appearance, likeCount, award })
})
