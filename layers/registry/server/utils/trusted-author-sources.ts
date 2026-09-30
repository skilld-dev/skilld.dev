import { hubRendersSource } from '#shared/repo-identity'
import { officialRepos } from '../data/official-repos'

export interface TrustedAuthorSourceRow {
  owner: string
  repo: string
  skillCount: number
  updatedAt: number | null
  /** GitHub identity stored for the repository, when it differs from the route. */
  sourceOwner?: string | null
  sourceRepo?: string | null
}

export interface TrustedAuthorSitemapEntry {
  loc: string
  changefreq: 'weekly'
  lastmod?: string
}

export const trustedAuthorRepos = officialRepos
  .filter(repo => repo.kind === 'user')
  .map(repo => ({
    owner: repo.owner.toLowerCase(),
    repo: repo.repo.toLowerCase(),
  }))

export const trustedAuthorRepoKeys = trustedAuthorRepos.map(repo => `${repo.owner}/${repo.repo}`)

const trustedAuthorOwners = new Set(trustedAuthorRepos.map(repo => repo.owner))
const trustedAuthorRepoKeySet = new Set(trustedAuthorRepoKeys)

export function isTrustedAuthorOwner(owner: string): boolean {
  return trustedAuthorOwners.has(owner.toLowerCase())
}

export function isTrustedAuthorRepo(owner: string, repo: string): boolean {
  return trustedAuthorRepoKeySet.has(`${owner}/${repo}`.toLowerCase())
}

function sitemapEntry(loc: string, updatedAt: number | null): TrustedAuthorSitemapEntry {
  const entry: TrustedAuthorSitemapEntry = { loc, changefreq: 'weekly' }
  if (updatedAt)
    entry.lastmod = new Date(updatedAt * 1000).toISOString()
  return entry
}

export function buildTrustedAuthorSitemapEntries(rows: readonly TrustedAuthorSourceRow[]): TrustedAuthorSitemapEntry[] {
  const updatedAtByOwner = new Map<string, number | null>()
  for (const row of rows) {
    const owner = row.owner.toLowerCase()
    const previous = updatedAtByOwner.get(owner) ?? null
    if (row.updatedAt != null && (previous == null || row.updatedAt > previous))
      updatedAtByOwner.set(owner, row.updatedAt)
    else if (!updatedAtByOwner.has(owner))
      updatedAtByOwner.set(owner, null)
  }

  const ownerEntries = [...updatedAtByOwner.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, updatedAt]) => sitemapEntry(`/gh/${owner}`, updatedAt))

  const repoEntries = rows
    // A renamed repository renders "Source not found", so its hub is noindex.
    .filter(row => row.skillCount > 1 && hubRendersSource(row, { owner: row.sourceOwner ?? null, repo: row.sourceRepo ?? null }))
    .toSorted((a, b) => a.owner.localeCompare(b.owner) || a.repo.localeCompare(b.repo))
    .map(row => sitemapEntry(`/gh/${row.owner.toLowerCase()}/${row.repo.toLowerCase()}`, row.updatedAt))

  return [...ownerEntries, ...repoEntries]
}
