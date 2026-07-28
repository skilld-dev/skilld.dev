import { z } from 'zod'
import { createRegistryReviewJobBatch } from '~~/server/utils/registry-jobs-runtime'
import { upsertDiscoveryCandidate } from '#layers/registry/server/utils/discovery-candidates'
import { recordSkillRepoReview } from '#layers/registry/server/utils/skill-repo-review'
import { defineApiHandler } from '#shared/server/handler'

const repositorySegment = z.string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\w.-]+$/, 'Use a GitHub repository segment')

const input = z.object({
  owner: repositorySegment,
  repo: repositorySegment,
  status: z.enum(['eligible', 'rejected']),
  reason: z.string().trim().min(20).max(300),
})

export default defineApiHandler({
  schema: input,
  handler: async ({ body, event, platform }) => {
    const admin = await requireAdmin(event)
    const reviewedAt = Math.floor(Date.now() / 1000)
    const result = await recordSkillRepoReview(platform.db, {
      ...body,
      reviewedBy: admin.email,
      reviewedAt,
    })

    if (result._tag === 'owner_not_individual') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Leaderboard repositories must belong to an individual GitHub user.',
      })
    }

    if (result._tag !== 'eligible_sync_required') {
      return {
        result: result._tag,
        prioritySyncQueued: false,
      }
    }

    await upsertDiscoveryCandidate(platform.db, {
      owner: body.owner,
      repo: body.repo,
      source: 'manual',
      discoveredAt: reviewedAt,
      ownerVerified: false,
      manualReconsideration: true,
    })
    const batch = await createRegistryReviewJobBatch(
      platform.env as Cloudflare.Env & Record<string, unknown>,
      {
        name: `leaderboard-review:${body.owner}/${body.repo}:${reviewedAt}`,
        jobs: [{
          operation: 'sync',
          owner: body.owner,
          repo: body.repo,
          ownerVerified: false,
          claimDiscovery: true,
        }],
      },
    )

    return {
      result: result._tag,
      prioritySyncQueued: true,
      batchId: batch.batchId,
    }
  },
})
