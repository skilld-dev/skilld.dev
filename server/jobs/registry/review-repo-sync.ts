/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod'
import { handleRegistryRepoJob } from './repo-maintenance'

const input = z.object({
  operation: z.literal('sync'),
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
  ownerVerified: z.boolean(),
  claimDiscovery: z.literal(true),
})

export default defineJob({
  name: 'registry/review-repo-sync',
  queue: 'repo-review-sync',
  input,
  tries: 5,
  backoff: [60, 300, 900, 3600],
  handle: handleRegistryRepoJob,
})
