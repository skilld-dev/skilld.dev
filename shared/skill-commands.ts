const SITE_ORIGIN = 'https://skilld.dev'
/** The v3 CLI, on the npm `latest` tag. */
export const CLI_PREFIX = 'npx skilld'

/**
 * Every install and run command the site prints, in the v3 CLI grammar.
 *
 * They live in `shared` because the Skill page, its cards, the markdown twin
 * an Agent fetches, and the deploy gate all hand out the same strings. This
 * module imports nothing, so the gate can load it from a fresh checkout that
 * has no generated `#shared` alias, while the app reaches it through that
 * alias and the bundler resolves it.
 */
const ADD_PREFIX = `${CLI_PREFIX} add`

/** Every Skill one GitHub Repository carries. */
export function gitInstallCmd(owner: string, repo: string): string {
  return `${ADD_PREFIX} ${owner}/${repo} --all`
}

/** Every Skill one curator's collections name. */
export function curatorInstallCmd(handle: string): string {
  return `${ADD_PREFIX} @${handle} --all`
}

/** Every Skill one collection names. */
export function collectionInstallCmd(handle: string, slug: string): string {
  return `${ADD_PREFIX} @${handle}/${slug} --all`
}

function skillRef(owner: string, repo: string, skill: string): string {
  return `${owner}/${repo}/${skill}`
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

/** Installs the skilld-maintained skilld Skill, which teaches an Agent to drive the CLI. */
export function skilldSelfInstallCmd(): string {
  return `${CLI_PREFIX} install skilld --global`
}

/** Prints the matching Skills, each with the selector `run` and `install` take. */
export function skillSearchCmd(query: string): string {
  return `${CLI_PREFIX} search ${query}`
}

/** Reports the installed Skills whose source moved. */
export function skillOutdatedCmd(): string {
  return `${CLI_PREFIX} outdated`
}

/** Moves one installed Skill to its current source commit. Takes the installed name. */
export function skillUpdateCmd(name: string): string {
  return `${CLI_PREFIX} update ${name}`
}

/** Removes one installed Skill. Takes the installed name. */
export function skillRemoveCmd(name: string): string {
  return `${CLI_PREFIX} remove ${name}`
}

const CLI_RELEASE_DOWNLOAD = 'https://github.com/skilld-dev/skilld/releases/latest/download'

/**
 * The native install scripts, by the site path that serves them. Each path is a
 * 302 to the latest release asset, so the printed command stays short and
 * GitHub Releases stays the source. `latest` moves, so it is never a 301.
 */
export const CLI_INSTALL_SCRIPTS = {
  '/install.sh': `${CLI_RELEASE_DOWNLOAD}/install.sh`,
  '/install.ps1': `${CLI_RELEASE_DOWNLOAD}/install.ps1`,
} as const

/**
 * Installs the CLI itself. npm runs it, so it is no skilld subcommand and the
 * grammar gate does not check it. The package selects a native executable, and
 * npm owns its upgrades.
 */
export function cliGlobalInstallCmd(): string {
  return 'npm install --global skilld'
}

/**
 * Installs the CLI as one native binary in `~/.skilld/bin`, with no Node.js.
 * macOS and Linux. This install upgrades itself from signed releases.
 */
export function cliNativeInstallCmd(): string {
  return `curl -fsSL ${SITE_ORIGIN}/install.sh | sh`
}

/** The same native binary on Windows, from PowerShell, in `%LOCALAPPDATA%\skilld\bin`. */
export function cliWindowsInstallCmd(): string {
  return `irm ${SITE_ORIGIN}/install.ps1 | iex`
}

/**
 * The account commands `/developers` teaches. Signing in once lets an Agent
 * like, watch, and read the digest for the user. They live here, beside every
 * other printed command, so the deploy gate checks them against npm `latest`.
 */
export const accountCmds = [
  `${CLI_PREFIX} auth login`,
  `${CLI_PREFIX} watch vercel-labs/agent-skills`,
  `${CLI_PREFIX} like vercel-labs/agent-skills/web-design-guidelines`,
  `${CLI_PREFIX} changes`,
] as const
