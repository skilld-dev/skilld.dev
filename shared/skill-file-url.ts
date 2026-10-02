/**
 * GitHub blob URL for a SKILL.md at the default branch. Every surface that
 * shows a Skill links this file (VISION principle 1), so the builder is shared
 * by the detail payload, the list payload, and the cards that read them.
 *
 * The link never pins a sha. `skills.current_sha` and `activity.sha` hold the
 * blob sha of the file, and GitHub answers 404 for a blob sha used as a ref.
 * A `skill_revisions` commit only changes when the content changes, so after a
 * rename it no longer holds the file at its current path. Link that commit on
 * its own commit page instead.
 */
export function githubSkillFileUrl(input: {
  owner: string
  repo: string
  skillPath: string | null | undefined
  /** The default branch. GitHub resolves `HEAD` when it is unknown. */
  branch: string | null | undefined
}): string | null {
  const skillPath = input.skillPath?.replace(/^\/+/, '') ?? ''
  if (!skillPath)
    return null
  const ref = input.branch?.trim() || 'HEAD'
  const encodedPath = skillPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/blob/${encodeURIComponent(ref)}/${encodedPath}`
}
