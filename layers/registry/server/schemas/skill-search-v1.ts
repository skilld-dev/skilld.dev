import { z } from 'zod'

const skillName = z.string()
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9]|-(?!-)){0,62}[a-z0-9]$|^[a-z0-9]$/)

const source = z.object({
  provider: z.literal('github'),
  owner: z.string().min(1).max(39),
  repository: z.string().min(1).max(100),
  selector: z.object({
    type: z.literal('named-skill'),
    name: skillName,
  }).strict(),
}).strict()

export const SkillSearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()

export const SkillSearchResponse = z.object({
  items: z.array(z.object({
    name: skillName,
    description: z.string().max(500).nullable(),
    source,
    stargazerCount: z.number().int().nonnegative(),
  }).strict()).max(50),
  total: z.number().int().nonnegative(),
}).strict()

export const isSkillName = (value: string): boolean => skillName.safeParse(value).success
