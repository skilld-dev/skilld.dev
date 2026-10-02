import { z } from 'zod'
import { parseGitHubRepositoryUrl } from '#shared/github-repository'
import { defineApiHandler } from '#shared/server/handler'
import { submitRepositoryIndex } from '../../utils/repository-index'

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
  handler: ({ body: repository, platform }) => submitRepositoryIndex(platform, repository),
})
