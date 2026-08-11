import { z } from 'zod'
import { handleRegistryRepoJob } from './repo-maintenance'

const input = z.object({
  operation: z.literal('submit'),
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
})

export default defineJob({
  name: 'registry/repository-submission',
  queue: 'repo-review-sync',
  input,
  tries: 5,
  backoff: [60, 300, 900, 3600],
  unique: true,
  uniqueId: payload => `${payload.owner.toLowerCase()}/${payload.repo.toLowerCase()}`,
  handle: handleRegistryRepoJob,
})
