import type { H3Event } from 'h3'
import type { EmbeddingNeighbor } from '../../jobs/generate-embeddings'
import type { CoOccurrenceNeighbor } from '../../utils/skill-co-occurrence'
import { defineApiHandler } from '#shared/server/handler'
import { getEmbeddingNeighbors } from '../../jobs/generate-embeddings'
import { resolveRepoSourceIdentity } from '../../utils/repo-source-identity'
import { getCoOccurrenceNeighbors } from '../../utils/skill-co-occurrence'
import { findRelatedSkills, findSkill, findSkillsByLookups } from '../../utils/skills-registry'

const COMMITS_CACHE_TTL = 60 * 60 * 12

interface SkillCommit {
  sha: string
  shortSha: string
  message: string
  authorName: string
  authorAvatar: string | null
  date: string
  url: string
  verified: boolean
  verifiedReason: string
}

interface NeighborSkill {
  name: string
  owner: string
  repo: string
  slug: string
  displayName: string
  description: string | null
  installs: number
  score: number
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    const skill = await findSkill(event, slug)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    // skillPath is needed for commits; cheap KV lookup since the critical handler primed it
    const skillPath = await useStorage('cache').getItem<string | null>(
      `skills:skill-path:v5:${skill.owner}/${skill.repo}/${skill.name}`,
    )
    const source = await resolveRepoSourceIdentity(platform.db, skill)

    const [commits, related, coOccurrenceNeighbors, embeddingNeighbors] = await Promise.all([
      skillPath ? getSkillCommits(source.owner, source.repo, skillPath) : Promise.resolve([]),
      findRelatedSkills(event, { owner: skill.owner, repo: skill.repo, excludeName: skill.name, limit: 6 }),
      getCoOccurrenceNeighbors(platform.db, skill.name),
      getEmbeddingNeighbors(platform.env.SKILL_EMBEDDINGS, { owner: skill.owner, repo: skill.repo, name: skill.name }),
    ])

    const [coOccurrenceSkills, semanticSiblings] = await resolveNeighborSkills(
      event,
      coOccurrenceNeighbors,
      embeddingNeighbors,
      skill.name,
    )

    return {
      commits,
      relatedRepoSkills: related.sameRepo,
      relatedOwnerSkills: related.sameOwner,
      coOccurrenceSkills,
      semanticSiblings,
    }
  },
})

async function resolveNeighborSkills(
  event: H3Event,
  coOccurrence: CoOccurrenceNeighbor[],
  embedding: EmbeddingNeighbor[],
  excludeName: string,
): Promise<[NeighborSkill[], NeighborSkill[]]> {
  const coNames = coOccurrence.filter(n => n.name !== excludeName).slice(0, 8)
  const embedNames = embedding.filter(n => n.name !== excludeName).slice(0, 8)
  const lookups = [
    ...coNames.map(n => ({ packageName: n.name })),
    ...embedNames.map(n => ({ packageName: n.name, owner: n.owner })),
  ]
  if (!lookups.length)
    return [[], []]

  const map = await findSkillsByLookups(event, lookups)

  function hydrate<N extends { name: string }>(neighbors: N[], scoreKey: keyof N): NeighborSkill[] {
    return neighbors
      .map((n) => {
        const row = map.get(n.name)
        if (!row)
          return null
        return {
          name: row.name,
          owner: row.owner,
          repo: row.repo,
          slug: row.slug,
          displayName: row.displayName,
          description: row.description,
          installs: row.installs,
          score: Number(n[scoreKey]) || 0,
        }
      })
      .filter((s): s is NeighborSkill => s !== null)
      .slice(0, 6)
  }

  return [hydrate(coNames, 'score'), hydrate(embedNames, 'similarity')]
}

interface GhCommitResponse {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string, date: string } | null
    verification?: { verified: boolean, reason: string } | null
  }
  author: { login: string, avatar_url: string } | null
}

async function getSkillCommits(owner: string, repo: string, path: string): Promise<SkillCommit[]> {
  const cacheKey = `skills:commits:v2:${owner}/${repo}:${path}`
  const cached = await useStorage('cache').getItem<SkillCommit[]>(cacheKey)
  if (cached)
    return cached

  const data = await $fetch<GhCommitResponse[]>(`https://api.github.com/repos/${owner}/${repo}/commits`, {
    query: { path, per_page: 5 },
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'skilld.dev' },
  }).catch((err) => {
    console.warn(`[skills] Failed to fetch commits for ${owner}/${repo}:${path}:`, err?.statusCode || err)
    return null
  })

  if (!Array.isArray(data))
    return []

  const commits: SkillCommit[] = data.map(c => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: (c.commit?.message ?? '').split('\n')[0]!.slice(0, 140),
    authorName: c.author?.login ?? c.commit?.author?.name ?? 'unknown',
    authorAvatar: c.author?.avatar_url ?? null,
    date: c.commit?.author?.date ?? '',
    url: c.html_url,
    verified: c.commit?.verification?.verified ?? false,
    verifiedReason: c.commit?.verification?.reason ?? 'unsigned',
  }))

  await useStorage('cache').setItem(cacheKey, commits, { ttl: COMMITS_CACHE_TTL })
  return commits
}
