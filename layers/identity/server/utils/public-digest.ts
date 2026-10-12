import type { WeeklyLikedChange } from './weekly-template'
import { z } from 'zod'

const updateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('skill'),
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
    occurredAt: z.number(),
  }),
  z.object({
    kind: z.literal('repo'),
    owner: z.string(),
    repo: z.string(),
    occurredAt: z.number(),
    skills: z.array(z.object({ name: z.string() })),
  }),
])

export const publicDigestUpdatesSchema = z.object({ items: z.array(updateSchema) })
export const publicDigestSkillSchema = z.object({
  description: z.string().nullable(),
  sourceUrl: z.string().url(),
  sourceGone: z.boolean(),
  sourceCommit: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
})
export const publicDigestCommitsSchema = z.object({
  commits: z.array(z.object({
    sha: z.string().min(1),
    message: z.string(),
    date: z.string(),
    url: z.string().url(),
  })),
})

interface PublicDigestUpdate {
  owner: string
  repo: string
  name: string
  occurredAt: number | null
}

export interface PublicDigestDependencies {
  windowStart: number
  windowEnd: number
  loadUpdates: () => Promise<z.infer<typeof publicDigestUpdatesSchema>>
  loadSkill: (update: PublicDigestUpdate) => Promise<z.infer<typeof publicDigestSkillSchema>>
  loadCommits: (skill: Pick<PublicDigestUpdate, 'owner' | 'repo' | 'name'>) => Promise<z.infer<typeof publicDigestCommitsSchema>>
}

/** Public changes only. Never read an account's watches for an anonymous example. */
export async function loadPublicDigestChanges(deps: PublicDigestDependencies): Promise<WeeklyLikedChange[]> {
  const updates = await deps.loadUpdates()
  const seen = new Set<string>()
  const recent = updates.items.filter(item =>
    item.occurredAt >= deps.windowStart
    && item.occurredAt <= deps.windowEnd,
  ).flatMap((item): PublicDigestUpdate[] => item.kind === 'skill'
    ? [item]
    : item.skills.map(skill => ({
        owner: item.owner,
        repo: item.repo,
        name: skill.name,
        // Repository cards span 90 days. Their timestamp and summary belong
        // to the latest entry, not every Skill named on the card.
        occurredAt: null,
      }))).filter((item) => {
    const key = JSON.stringify([item.owner.toLowerCase(), item.repo.toLowerCase(), item.name])
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  }).slice(0, 30)
  const changes = await Promise.all(recent.map(async (item): Promise<WeeklyLikedChange | null> => {
    const skill = await deps.loadSkill(item)
    if (skill.sourceGone)
      return null
    const changedAt = item.occurredAt ?? (skill.updatedAt === null ? null : Date.parse(skill.updatedAt) / 1000)
    if (changedAt === null || changedAt < deps.windowStart || changedAt > deps.windowEnd)
      return null
    return {
      owner: item.owner,
      repo: item.repo,
      name: item.name,
      slug: item.name,
      description: skill.description,
      changeCount: 1,
      changedAt,
      commitMessages: [],
      sourceUrl: skill.sourceUrl,
      // Feed hashes identify blobs. The detail API identifies revision commits.
      changeUrl: skill.sourceCommit
        ? `https://github.com/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/commit/${encodeURIComponent(skill.sourceCommit)}`
        : skill.sourceUrl.replace('/blob/', '/commits/'),
    }
  }))
  const admitted = changes.filter((item): item is WeeklyLikedChange => item !== null).slice(0, 5)
  return Promise.all(admitted.map(async (skill) => {
    // Only admitted Skills fetch history. This endpoint scopes GitHub commits
    // to the exact SKILL.md file, rather than every commit in its Repository.
    const history = await deps.loadCommits(skill)
    const recentCommits = history.commits.map(commit => ({ ...commit, occurredAt: Date.parse(commit.date) / 1000 }))
      .filter(commit => Number.isFinite(commit.occurredAt)
        && commit.occurredAt >= deps.windowStart && commit.occurredAt <= deps.windowEnd)
      .sort((a, b) => b.occurredAt - a.occurredAt)
    return {
      ...skill,
      changedAt: recentCommits[0]?.occurredAt ?? skill.changedAt,
      changeCount: recentCommits.length || skill.changeCount,
      commitMessages: recentCommits.map(commit => commit.message.split('\n')[0]!.trim()).filter(Boolean),
      changeUrl: recentCommits[0]?.url ?? skill.changeUrl,
    }
  }))
}
