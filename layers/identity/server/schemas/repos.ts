import { z } from 'zod'

export const ReposScanBody = z.object({}).default({})

export type ReposScanBody = z.infer<typeof ReposScanBody>
