import { z } from 'zod'
import { enqueueRegistryRepoJob } from '~~/server/utils/registry-jobs-runtime'
import { parseGitHubRepositoryUrl } from '#shared/github-repository'
import { defineApiHandler } from '#shared/server/handler'
import { findIndexedRepositorySkills } from '../../utils/repository-index'

const input = z.object({
  url: z.string().trim().min(1).max(2048),
}).transform(({ url }, context) => {
  const repository = parseGitHubRepositoryUrl(url)
  if (repository._tag === 'repository')
    return repository
  context.addIssue({
    code: 'custom',
    path: ['url'],
    message: 'Paste a public GitHub repository URL.',
  })
  return z.NEVER
})

export default defineApiHandler({
  schema: input,
  handler: async ({ body: repository, platform }) => {
    const skills = await findIndexedRepositorySkills(platform.db, repository)
    if (skills.length)
      return { _tag: 'indexed' as const, repository, skills }

    const queued = await enqueueRegistryRepoJob(
      platform.env as Cloudflare.Env & Record<string, unknown>,
      {
        operation: 'submit',
        owner: repository.owner,
        repo: repository.repo,
      },
    )
    return {
      _tag: 'queued' as const,
      repository,
      jobId: queued.jobId,
      progress: { _tag: 'queued' as const },
    }
  },
})
