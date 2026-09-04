/**
 * The name a byline shows for a Skill author. GitHub profile names are synced
 * into `owners.name`; a missing or login-only name means the byline falls back
 * to the `owner/repo` slug alone.
 */
export function resolveAuthorName(owner: string, authorName: string | null | undefined): string | null {
  const name = authorName?.replace(/\s+/g, ' ').trim() ?? ''
  if (!name || name.toLowerCase() === owner.toLowerCase())
    return null
  return name
}
