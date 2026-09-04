/**
 * GitHub blob URL for a SKILL.md at the revision skilld synced. Every surface
 * that shows a Skill links this file (VISION principle 1), so the builder is
 * shared by the detail payload, the list payload, and the cards that read them.
 */
export function githubSkillFileUrl(input: {
  owner: string
  repo: string
  skillPath: string | null | undefined
  /** Commit sha when known, otherwise the default branch. */
  ref: string | null | undefined
}): string | null {
  const skillPath = input.skillPath?.replace(/^\/+/, '') ?? ''
  const ref = input.ref?.trim() ?? ''
  if (!skillPath || !ref)
    return null
  const encodedPath = skillPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/blob/${encodeURIComponent(ref)}/${encodedPath}`
}
