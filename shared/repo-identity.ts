export interface RepoIdentityLike {
  owner: string
  repo: string
}

/** Case-insensitive match, because GitHub names are. */
export function sameRepoIdentity(a: RepoIdentityLike, b: RepoIdentityLike): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
}

/**
 * Whether a repository hub renders its source card at `registry`.
 *
 * GitHub reports a new identity for a renamed repository. The hub page then
 * shows "Source not found", so it must be `noindex` and stay out of every
 * sitemap. A missing source identity means the source is the registry route.
 */
export function hubRendersSource(
  registry: RepoIdentityLike,
  source: { owner: string | null, repo: string | null } | null,
): boolean {
  if (!source?.owner || !source.repo)
    return true
  return sameRepoIdentity(registry, { owner: source.owner, repo: source.repo })
}
