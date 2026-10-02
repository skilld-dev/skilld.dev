import { githubSkillFileUrl } from '#shared/skill-file-url'

export interface SkillFileRef {
  owner: string
  repo: string
  path: string
  /** The default branch. GitHub resolves `HEAD` when it is unknown. */
  branch: string | null
}

/** SKILL.md at the branch. `githubSkillFileUrl` says why it never pins a sha. */
export function githubSkillSourceUrl(input: SkillFileRef): string {
  return githubSkillFileUrl({ owner: input.owner, repo: input.repo, skillPath: input.path, branch: input.branch })
    ?? `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`
}

/**
 * The commit behind a change, or the file history when no commit is recorded.
 * `commitSha` comes from `skill_revisions.sha`, never from `activity.sha`,
 * which is a blob sha.
 */
export function githubSkillChangeUrl(input: SkillFileRef & { commitSha: string | null }): string {
  const repoUrl = `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`
  if (input.commitSha)
    return `${repoUrl}/commit/${encodeURIComponent(input.commitSha)}`
  const path = input.path.split('/').map(encodeURIComponent).join('/')
  return `${repoUrl}/commits/${encodeURIComponent(input.branch || 'HEAD')}/${path}`
}
