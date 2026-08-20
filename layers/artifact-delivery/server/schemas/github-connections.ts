import { z } from 'zod'

export const createGithubConnectionSchema = z.object({
  installationId: z.number().int().positive().safe(),
}).strict()

export const githubConnectionSchema = z.object({
  installationId: z.number().int().positive().safe(),
  state: z.enum(['active', 'suspended', 'revoked']),
  repositoryCount: z.number().int().nonnegative().max(500),
}).strict()
