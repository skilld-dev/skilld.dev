interface SkillAssetPathInput {
  owner: string
  repo: string
  name: string
  filePath: string
}

/**
 * Old cached markdown briefly emitted registry links without a leading slash.
 * Browsers resolved those links below the current skill route, duplicating the
 * entire `/gh/:owner/:repo/:name/-/` prefix into the asset path.
 *
 * GitHub owner and repository names are case-insensitive, so the duplicated
 * prefix can carry the repository's own casing while the route carries the
 * registry slug (Sentry SKILLD-11).
 */
export function normalizeSkillAssetFilePath(input: SkillAssetPathInput): string {
  const parts = input.filePath.split('/').filter(Boolean)
  const duplicatedPrefix = ['gh', input.owner, input.repo, input.name, '-']
  const isDuplicated = duplicatedPrefix.every(
    (part, index) => parts[index]?.toLowerCase() === part.toLowerCase(),
  )
  return (isDuplicated ? parts.slice(duplicatedPrefix.length) : parts).join('/')
}
