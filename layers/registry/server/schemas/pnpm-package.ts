import { z } from 'zod'

export const pnpmPackageQuery = z.object({})
export const pnpmPackageSlug = z.string().max(512).regex(/^[\w.-]+\/[\w.-]+\/[^/\\]+$/).refine(value => !['.', '..'].includes(value.split('/')[2]!))
