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
 * The comparison is case-insensitive because the route segments carry the
 * lowercase registry slug while the stale link carries GitHub's own casing.
 * `microsoft/GitHub-Copilot-for-Azure` missed an exact match, so the prefix
 * survived into the upstream path and every fetch 502'd (Sentry `SKILLD-11`).
 */
export function normalizeSkillAssetFilePath(input: SkillAssetPathInput): string {
  const parts = input.filePath.split('/').filter(Boolean)
  const duplicatedPrefix = ['gh', input.owner, input.repo, input.name, '-']
  const isDuplicated = duplicatedPrefix.every(
    (part, index) => parts[index]?.toLowerCase() === part.toLowerCase(),
  )
  return (isDuplicated ? parts.slice(duplicatedPrefix.length) : parts).join('/')
}

const SKILL_FILE_PAGE_RE = /^\/gh\/[^/?#]+\/[^/?#]+\/[^/?#]+\/-\/[^/?#]/

/**
 * Whether a request path opens one file inside a Skill:
 * `/gh/<owner>/<repo>/<name>/-/<file>`. The URL ends in the file's own name,
 * so `/-/reference.md` is reference.md itself, never a page's Markdown twin.
 */
export function isSkillFilePagePath(path: string): boolean {
  return SKILL_FILE_PAGE_RE.test(path)
}
