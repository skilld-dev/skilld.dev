import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { readRepositoryIndexStatus } from '../../../utils/repository-index'

const input = z.object({
  jobId: z.string().uuid(),
})

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const parsed = input.safeParse({ jobId: getRouterParam(event, 'jobId') })
    if (!parsed.success)
      throw createError({ statusCode: 400, message: 'Invalid repository indexing job' })
    const status = await readRepositoryIndexStatus(platform.db, parsed.data.jobId)
    if (status._tag === 'missing')
      throw createError({ statusCode: 404, message: 'Repository indexing job not found' })
    return status
  },
})
