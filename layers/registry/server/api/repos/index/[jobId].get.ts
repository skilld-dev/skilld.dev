import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import {
  findIndexedRepositorySkills,
  readRepositoryJobState,
} from '../../../utils/repository-index'

const input = z.object({
  jobId: z.string().uuid(),
})

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const parsed = input.safeParse({ jobId: getRouterParam(event, 'jobId') })
    if (!parsed.success)
      throw createError({ statusCode: 400, message: 'Invalid repository indexing job' })
    const state = await readRepositoryJobState(platform.db, parsed.data.jobId)
    if (state._tag === 'missing')
      throw createError({ statusCode: 404, message: 'Repository indexing job not found' })
    if (state._tag === 'queued' || state._tag === 'failed')
      return state

    const skills = await findIndexedRepositorySkills(platform.db, state.repository)
    return skills.length
      ? { _tag: 'indexed' as const, repository: state.repository, skills }
      : {
          _tag: 'failed' as const,
          repository: state.repository,
          reason: 'No supported SKILL.md files were found.',
        }
  },
})
