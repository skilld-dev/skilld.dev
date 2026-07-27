export interface RepoIdentity {
  owner: string
  repo: string
}

export interface RepoSourceIdentityRow {
  source_owner: string | null
  source_repo: string | null
}

interface OwnerRepoSourceIdentityRow extends RepoSourceIdentityRow {
  repo: string
}

export function resolveRepoSourceIdentityFromRow(
  registry: RepoIdentity,
  row: RepoSourceIdentityRow | null | undefined,
): RepoIdentity {
  if (!row?.source_owner || !row.source_repo)
    return registry
  return {
    owner: row.source_owner,
    repo: row.source_repo,
  }
}

export async function resolveRepoSourceIdentity(
  db: D1Database,
  registry: RepoIdentity,
): Promise<RepoIdentity> {
  const row = await db
    .prepare(`
      SELECT source_owner, source_repo
      FROM repos
      WHERE owner = ? AND repo = ?
    `)
    .bind(registry.owner, registry.repo)
    .first<RepoSourceIdentityRow>()
  return resolveRepoSourceIdentityFromRow(registry, row)
}

export async function resolveRepoSourceIdentitiesForOwner(
  db: D1Database,
  owner: string,
): Promise<Map<string, RepoIdentity>> {
  const rows = await db
    .prepare(`
      SELECT repo, source_owner, source_repo
      FROM repos
      WHERE owner = ?
      ORDER BY repo
    `)
    .bind(owner)
    .all<OwnerRepoSourceIdentityRow>()
  return new Map((rows.results ?? []).map(row => [
    row.repo,
    resolveRepoSourceIdentityFromRow({ owner, repo: row.repo }, row),
  ]))
}
