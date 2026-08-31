import { getDB } from '#server/utils/db'
import { canonicalRepoSkillPath } from '#shared/skill-routes'

interface ActivityRow {
  owner: string
  name: string
  occurred_at: number
  sha: string
  display_name: string | null
  repo: string | null
  description: string | null
  slug: string | null
  sync_status: string | null
  change_summary: string | null
  repo_skill_count: number
}

interface SkillEntry {
  owner: string
  name: string
  displayName: string
  repo: string
  description: string | null
  slug: string
  sha: string
  occurredAt: number
  hasReceipts: boolean
  changeSummary: string | null
  registryPath: string
}

interface SkillCard extends SkillEntry {
  kind: 'skill'
  avatarUrl: string
}

interface RepoCard {
  kind: 'repo'
  owner: string
  repo: string
  avatarUrl: string
  occurredAt: number
  skillCount: number
  changeSummary: string | null
  skills: { name: string, displayName: string, slug: string }[]
}

export type RecentUpdateCard = SkillCard | RepoCard

export interface RecentUpdatesResponse {
  items: RecentUpdateCard[]
}

const MAX_CARDS = 12
const FETCH_LIMIT = 60
const REPO_COLLAPSE_THRESHOLD = 2

function avatarFor(owner: string): string {
  return `https://github.com/${owner}.png?size=80`
}

function summarizeChange(message: string | null): string | null {
  const firstLine = message
    ?.split('\n')
    .map(line => line.trim())
    .find(Boolean)
  if (!firstLine)
    return null
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine
}

export default defineCachedEventHandler(
  async (event): Promise<RecentUpdatesResponse> => {
    const db = getDB(event)
    const res = await db
      .prepare(
        `SELECT a.owner, a.name, a.occurred_at, a.sha,
                s.display_name, s.repo, s.description, s.slug, s.sync_status,
                revisions.message AS change_summary,
                (SELECT COUNT(*) FROM skills repo_skills
                 WHERE repo_skills.owner = s.owner
                   AND repo_skills.repo = s.repo
                   AND repo_skills.source_resolved = 1) AS repo_skill_count
         FROM activity a
         INNER JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
         INNER JOIN repos r ON r.owner = a.owner AND r.repo = a.repo
         LEFT JOIN skill_revisions revisions
           ON revisions.owner = a.owner
          AND revisions.repo = a.repo
          AND revisions.name = a.name
          AND revisions.sha = (
            SELECT candidate.sha
            FROM skill_revisions candidate
            WHERE candidate.owner = a.owner
              AND candidate.repo = a.repo
              AND candidate.name = a.name
              AND candidate.modified_at <= a.occurred_at
            ORDER BY candidate.modified_at DESC, candidate.sha DESC
            LIMIT 1
          )
         WHERE a.type = 'skill_updated'
           AND r.stars >= 100
           AND s.is_abstract = 1 AND s.is_official = 1
         ORDER BY a.occurred_at DESC
         LIMIT ?`,
      )
      .bind(FETCH_LIMIT)
      .all<ActivityRow>()

    const rows = res.results ?? []
    const skillEntries: SkillEntry[] = rows.map(row => ({
      owner: row.owner,
      name: row.name,
      displayName: row.display_name ?? row.name,
      repo: row.repo ?? 'skills',
      description: row.description,
      slug: row.slug ?? `${row.owner}/${row.name}`,
      sha: row.sha,
      occurredAt: row.occurred_at,
      hasReceipts: row.sync_status === 'ok',
      changeSummary: summarizeChange(row.change_summary),
      registryPath: canonicalRepoSkillPath({
        owner: row.owner,
        repo: row.repo ?? 'skills',
        name: row.name,
        repoSkillCount: row.repo_skill_count,
      }),
    }))

    // Group by (owner, repo) preserving order of first appearance.
    const groups = new Map<string, SkillEntry[]>()
    for (const e of skillEntries) {
      const key = `${e.owner}/${e.repo}`
      let arr = groups.get(key)
      if (!arr) {
        arr = []
        groups.set(key, arr)
      }
      arr.push(e)
    }

    const cards: RecentUpdateCard[] = []
    for (const [, entries] of groups) {
      if (cards.length >= MAX_CARDS)
        break
      if (entries.length >= REPO_COLLAPSE_THRESHOLD) {
        const head = entries[0]!
        cards.push({
          kind: 'repo',
          owner: head.owner,
          repo: head.repo,
          avatarUrl: avatarFor(head.owner),
          occurredAt: Math.max(...entries.map(e => e.occurredAt)),
          skillCount: entries.length,
          changeSummary: entries.find(entry => entry.changeSummary)?.changeSummary ?? null,
          skills: entries.slice(0, 6).map(e => ({
            name: e.name,
            displayName: e.displayName,
            slug: e.slug,
          })),
        })
      }
      else {
        const e = entries[0]!
        cards.push({ kind: 'skill', ...e, avatarUrl: avatarFor(e.owner) })
      }
    }

    return { items: cards }
  },
  { maxAge: 30, swr: false, name: 'feed-recent-updates-origin-v1' },
)
