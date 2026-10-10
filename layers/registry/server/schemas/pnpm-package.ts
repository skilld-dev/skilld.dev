import { z } from 'zod'

export const pnpmPackageQuery = z.object({})
export const pnpmPackageSlug = z.string().regex(/^[\w.-]+\/[\w.-]+\/[\w.-]+$/)
