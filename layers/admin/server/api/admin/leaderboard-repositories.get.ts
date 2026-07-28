import { listSkillRepoReviewQueue } from '#layers/registry/server/utils/skill-repo-review'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    await requireAdmin(event)
    return await listSkillRepoReviewQueue(platform.db, {
      now: Math.floor(Date.now() / 1000),
      candidateLimit: 50,
      decisionLimit: 30,
    })
  },
})
