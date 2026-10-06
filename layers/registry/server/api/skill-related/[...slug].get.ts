import type { H3Event } from 'h3'
import type { EmbeddingNeighbor } from '../../jobs/generate-embeddings'
import type { GithubBindings } from '../../utils/github-client'
import type { CoOccurrenceNeighbor } from '../../utils/skill-co-occurrence'
import type { SkillCommitSourceRow } from '../../utils/skill-commit-source'
import type { CachedRelated } from '../../utils/skill-related'
import { readCache, readThroughCache, writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { getEmbeddingNeighbors } from '../../jobs/generate-embeddings'
import { getGithubJson, GITHUB_PAGE_READ_TIMEOUT_MS, resolveGithubBindings } from '../../utils/github-client'
import { getCoOccurrenceNeighbors } from '../../utils/skill-co-occurrence'
import { skillCommitSourceFromRow } from '../../utils/skill-commit-source'
import {
  isCachedRelated,
  RELATED_CACHE_STALE_TTL,
  RELATED_CACHE_TTL,
  relatedCacheKey,
  relatedCacheWindows,
} from '../../utils/skill-related'
import { findRelatedSkills, findSkillsByLookups, findSkillWithRow } from '../../utils/skills-registry'

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
  score: number
  registryPath: string
}

type RelatedSkills = Awaited<ReturnType<typeof findRelatedSkills>>

interface SkillRelatedResponse {
  commits: SkillCommit[]
  relatedRepoSkills: RelatedSkills['sameRepo']
  relatedOwnerSkills: RelatedSkills['sameOwner']
  coOccurrenceSkills: NeighborSkill[]
  semanticSiblings: NeighborSkill[]
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing skill slug' })

    // The slug lookup sits inside the cached function on purpose. It is one
    // to two D1 reads, and running it ahead of the cache made every request
    // cost a read even on a hit. See the note in `skill-related.ts`.
    const cached = await readThroughCache<CachedRelated<SkillRelatedResponse>>(
      useStorage('edge-cache'),
      relatedCacheKey(slug),
      async () => {
        // The shared Skill select already carries the commit source columns.
        const found = await findSkillWithRow<SkillCommitSourceRow>(event, slug, '')
        if (!found)
          return { _tag: 'missing' as const }

        const { skill } = found
        const source = skillCommitSourceFromRow(skill, found.row)

        const [commits, related, coOccurrenceNeighbors, embeddingNeighbors] = await Promise.all([
          source
            ? getSkillCommits(source.owner, source.repo, source.path, resolveGithubBindings(platform.env))
            : Promise.resolve([]),
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

        const response: SkillRelatedResponse = {
          commits,
          relatedRepoSkills: related.sameRepo,
          relatedOwnerSkills: related.sameOwner,
          coOccurrenceSkills,
          semanticSiblings,
        }
        return { _tag: 'found' as const, response }
      },
      {
        ttl: RELATED_CACHE_TTL,
        staleTtl: RELATED_CACHE_STALE_TTL,
        windowsFor: relatedCacheWindows,
        validate: isCachedRelated,
      },
    )

    if (cached._tag === 'missing')
      throw createError({ statusCode: 404, message: 'Skill not found' })

    return cached.response
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
          score: Number(n[scoreKey]) || 0,
          registryPath: row.registryPath,
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

async function getSkillCommits(owner: string, repo: string, path: string, bindings: GithubBindings): Promise<SkillCommit[]> {
  const cacheKey = `skills:commits:v2:${owner}/${repo}:${path}`
  const cached = await readCache<SkillCommit[]>(useStorage('edge-cache'), cacheKey)
  if (cached)
    return cached

  // Authenticated and conditional: an unchanged history answers 304 from the
  // ETag cache for free. Anonymous, this read shared the Worker IP's 60
  // requests an hour with every other Cloudflare tenant, and about 330 a day
  // failed (2026-10-06). The commit list is optional decoration, so a slow
  // GitHub costs the list, never the page.
  const query = new URLSearchParams({ path, per_page: '5' })
  const response = await getGithubJson<GhCommitResponse[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query.toString()}`,
    bindings,
    { timeoutMs: GITHUB_PAGE_READ_TIMEOUT_MS },
  ).catch((error: unknown) => {
    emitOperationalEvent(createWideEvent({ operation: 'skill-related-commits-fetch', outcome: 'failed', reason: error instanceof Error ? error.message : String(error) }))
    return null
  })
  const data = response?.data
  if (!Array.isArray(data)) {
    if (response)
      emitOperationalEvent(createWideEvent({ 'operation': 'skill-related-commits-fetch', 'outcome': 'failed', 'upstream.status': response.status }))
    return []
  }

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

  await writeCache(useStorage('edge-cache'), cacheKey, commits, { ttl: COMMITS_CACHE_TTL })
  return commits
}
