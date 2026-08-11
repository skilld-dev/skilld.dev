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
 */
export function normalizeSkillAssetFilePath(input: SkillAssetPathInput): string {
  const parts = input.filePath.split('/').filter(Boolean)
  const duplicatedPrefix = ['gh', input.owner, input.repo, input.name, '-']
  const isDuplicated = duplicatedPrefix.every((part, index) => parts[index] === part)
  return (isDuplicated ? parts.slice(duplicatedPrefix.length) : parts).join('/')
}
