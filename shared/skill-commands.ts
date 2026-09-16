const SITE_ORIGIN = 'https://skilld.dev'
/** The v3 CLI. It ships on the `beta` npm tag; `latest` is still v2. */
export const CLI_PREFIX = 'npx skilld@beta'

/**
 * Skill-level commands and addresses speak the v3 CLI grammar. They live in
 * `shared` because the Skill page, its cards, and the markdown twin an Agent
 * fetches all hand out the same strings. Repository, curator and collection
 * commands speak the same grammar from `app/utils/install-cmd.ts`.
 */
function skillRef(owner: string, repo: string, skill: string): string {
  return `skilld:${owner}/${repo}/${skill}`
}

/** The Skill page. An Agent that fetches it receives the SKILL.md as markdown. */
export function skillPageUrl(owner: string, repo: string, skill: string): string {
  return `${SITE_ORIGIN}/gh/${owner}/${repo}/${skill}`
}

/** Pristine SKILL.md, or a file beside it, as text/markdown. */
export function skillRawUrl(owner: string, repo: string, skill: string, filePath?: string): string {
  const base = `${SITE_ORIGIN}/api/skills-raw/${owner}/${repo}/${skill}`
  return filePath ? `${base}/${filePath}` : base
}

export const SKILL_RUN_PROMPT_LEAD = 'Use this Skill:'

/**
 * The text a developer gives an Agent for one transient Skill load. The Agent
 * fetches the page and the markdown twin tells it what to do next.
 */
export function skillRunPrompt(pageUrl: string): string {
  return `${SKILL_RUN_PROMPT_LEAD} ${pageUrl}`
}

/** The CLI form of a transient load. The Agent reads the Skill now and installs nothing. */
export function skillRunCmd(owner: string, repo: string, skill: string): string {
  return `${CLI_PREFIX} run ${skillRef(owner, repo, skill)}`
}

/** The opt-in command. Files land in the repository and the lockfile records them. */
export function skillInstallCmd(owner: string, repo: string, skill: string): string {
  return `${CLI_PREFIX} install ${skillRef(owner, repo, skill)}`
}
