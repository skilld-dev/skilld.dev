import { z } from 'zod'

export const createGithubConnectionSchema = z.object({
  installationId: z.number().int().positive().safe(),
}).strict()

export const authorizeGithubConnectionSchema = z.object({
  return_to: z.string().max(2048).optional(),
}).strict()

export const githubConnectionCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  installation_id: z.coerce.number().int().positive().safe(),
  setup_action: z.enum(['install', 'update']).optional(),
  state: z.string().length(43).regex(/^[\w-]+$/),
}).strict()

export const githubConnectionSchema = z.object({
  installationId: z.number().int().positive().safe(),
  state: z.enum(['active', 'suspended', 'revoked']),
  repositoryCount: z.number().int().nonnegative().max(500),
}).strict()
