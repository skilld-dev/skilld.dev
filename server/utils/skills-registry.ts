/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'

export interface RegistrySkill {
  name: string
  owner: string
  repo: string
  displayName: string
  installs: number
  slug: string
}

interface SkillRow {
  name: string
  owner: string
  repo: string
  display_name: string
  installs: number
  slug: string
}

function getDB(event: H3Event) {
  return event.context.cloudflare.env.DB as D1Database
}

function rowToSkill(row: SkillRow): RegistrySkill {
  return {
    name: row.name,
    owner: row.owner,
    repo: row.repo,
    displayName: row.display_name,
    installs: row.installs,
    slug: row.slug,
  }
}

export interface SkillsQuery {
  search?: string
  owner?: string
  official?: boolean
  sort?: 'installs' | 'name' | 'owner'
  page?: number
  limit?: number
  officialOwners?: Set<string>
}

interface SkillsQueryResult {
  items: RegistrySkill[]
  total: number
  page: number
  pages: number
  facets: { owner: string, count: number }[]
}

export async function querySkills(event: H3Event, opts: SkillsQuery): Promise<SkillsQueryResult> {
  const db = getDB(event)
  const { search, owner, official, sort = 'installs', page = 1, limit = 60, officialOwners } = opts

  const conditions: string[] = []
  const params: (string | number)[] = []

  // FTS search
  let usesFts = false
  if (search) {
    // FTS5 match with prefix search
    const ftsQuery = search.split(/\s+/).map(t => `"${t}"*`).join(' ')
    conditions.push('skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?)')
    params.push(ftsQuery)
    usesFts = true
  }

  if (owner) {
    conditions.push('skills.owner = ?')
    params.push(owner)
  }

  if (official && officialOwners?.size) {
    const placeholders = Array.from(officialOwners, () => '?').join(',')
    conditions.push(`skills.owner IN (${placeholders})`)
    params.push(...officialOwners)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  // Count query
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM skills ${where}`).bind(...params)

  // Sort
  let orderBy: string
  if (sort === 'name')
    orderBy = 'skills.name ASC'
  else if (sort === 'owner')
    orderBy = 'skills.owner ASC, skills.name ASC'
  else orderBy = 'skills.installs DESC'

  const offset = (page - 1) * limit
  const dataStmt = db
    .prepare(`SELECT * FROM skills ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)

  // Facets: top owners from filtered results
  const facetStmt = db
    .prepare(`SELECT owner, COUNT(*) as count FROM skills ${where} GROUP BY owner ORDER BY count DESC LIMIT 20`)
    .bind(...params)

  const [countRes, dataRes, facetRes] = await Promise.all([
    countStmt.first<{ total: number }>(),
    dataStmt.all<SkillRow>(),
    facetStmt.all<{ owner: string, count: number }>(),
  ])

  return {
    items: (dataRes.results ?? []).map(rowToSkill),
    total: countRes?.total ?? 0,
    page,
    pages: Math.ceil((countRes?.total ?? 0) / limit),
    facets: facetRes.results ?? [],
  }
}

export async function findSkill(event: H3Event, slug: string): Promise<RegistrySkill | null> {
  const db = getDB(event)
  const row = await db
    .prepare('SELECT * FROM skills WHERE slug = ?')
    .bind(slug)
    .first<SkillRow>()

  if (!row) {
    // Try matching with repo in slug: owner/repo/name
    const parts = slug.split('/')
    if (parts.length >= 3) {
      const owner = parts[0]
      const name = parts.slice(2).join('/')
      const altRow = await db
        .prepare('SELECT * FROM skills WHERE owner = ? AND name = ?')
        .bind(owner, name)
        .first<SkillRow>()
      return altRow ? rowToSkill(altRow) : null
    }
    return null
  }
  return rowToSkill(row)
}
