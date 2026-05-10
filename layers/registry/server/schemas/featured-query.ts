import { z } from 'zod'

function num(fallback: number, min: number, max: number) {
  return z.coerce.number().pipe(z.number().min(min).max(max)).catch(fallback)
}

export const FeaturedSkillsQuery = z.object({
  orgs: num(6, 0, 20),
  perOrg: num(4, 1, 12),
  devs: num(12, 0, 30),
  perDev: num(12, 1, 12),
})

export type FeaturedSkillsQuery = z.infer<typeof FeaturedSkillsQuery>
