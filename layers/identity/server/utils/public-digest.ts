import type { WeeklyLikedChange } from './weekly-template'
import { z } from 'zod'

const updateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('skill'),
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
    occurredAt: z.number(),
    changeSummary: z.string().nullable(),
  }),
  z.object({ kind: z.literal('repo') }),
])

export const publicDigestUpdatesSchema = z.object({ items: z.array(updateSchema) })
export const publicDigestSkillSchema = z.object({
  description: z.string().nullable(),
  sourceUrl: z.string().url(),
  sourceGone: z.boolean(),
  sourceCommit: z.string().nullable(),
})

type PublicDigestUpdate = Extract<z.infer<typeof updateSchema>, { kind: 'skill' }>

export interface PublicDigestDependencies {
  windowStart: number
  windowEnd: number
  loadUpdates: () => Promise<z.infer<typeof publicDigestUpdatesSchema>>
  loadSkill: (update: PublicDigestUpdate) => Promise<z.infer<typeof publicDigestSkillSchema>>
}

/** Public changes only. Never read an account's watches for an anonymous example. */
export async function loadPublicDigestChanges(deps: PublicDigestDependencies): Promise<WeeklyLikedChange[]> {
  const updates = await deps.loadUpdates()
  const recent = updates.items.filter((item): item is PublicDigestUpdate =>
    item.kind === 'skill'
    && item.occurredAt >= deps.windowStart
    && item.occurredAt <= deps.windowEnd,
  ).slice(0, 5)
  const changes = await Promise.all(recent.map(async (item): Promise<WeeklyLikedChange | null> => {
    const skill = await deps.loadSkill(item)
    if (skill.sourceGone)
      return null
    return {
      owner: item.owner,
      repo: item.repo,
      name: item.name,
      slug: item.name,
      description: skill.description,
      changeCount: 1,
      changedAt: item.occurredAt,
      commitMessages: item.changeSummary ? [item.changeSummary] : [],
      sourceUrl: skill.sourceUrl,
      // Feed hashes identify blobs. The detail API identifies revision commits.
      changeUrl: skill.sourceCommit
        ? `https://github.com/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/commit/${encodeURIComponent(skill.sourceCommit)}`
        : skill.sourceUrl.replace('/blob/', '/commits/'),
    }
  }))
  return changes.filter((item): item is WeeklyLikedChange => item !== null)
}
