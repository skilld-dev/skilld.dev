/**
 * Agents guess raw.githubusercontent.com layouts against skilld.dev: on
 * 2026-08-19 that was 8,338 requests over 3,772 distinct paths, all 404. The
 * shape is always `/<owner>/<repo>/<branch>/<dirs...>/<name>/SKILL.md`, and the
 * pristine markdown they want is already served by `/api/skills-raw`.
 */
const RESERVED_PREFIXES = ['api', 'gh', 'repos', 'skills', 'collections', 'learn', 'auth', 'oauth', '_nuxt', '_scripts', '_dev', 'weekly', '.well-known']

export function skillsRawPathFromProbe(pathname: string): string | null {
  if (!pathname.endsWith('/SKILL.md'))
    return null
  const segments = pathname.replace(/^\/+/, '').split('/')
  if (segments.some(segment => !segment))
    return null
  // owner, repo, branch, then at least SKILL.md itself.
  if (segments.length < 4)
    return null
  const [owner, repo, , ...tail] = segments as [string, string, string, ...string[]]
  if (RESERVED_PREFIXES.includes(owner) || owner.startsWith('@') || owner.startsWith('.'))
    return null
  // A repo-root SKILL.md is a skill named after its repository, so it has no
  // `/<name>/` segment of its own.
  const name = tail.length > 1 ? tail[tail.length - 2]! : repo
  return `/api/skills-raw/${owner}/${repo}/${name}`
}
