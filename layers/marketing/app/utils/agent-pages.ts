/**
 * The Agent targets that get a `/agents/<id>` search page.
 *
 * Ids, project paths, and global paths mirror the CLI registry at
 * `crates/skilld-core/src/target.rs`. The site and the CLI share no code, so
 * update both when a target changes. Only targets with measured search demand
 * (`skilld-seo-opportunities.md`) appear here; the CLI supports more.
 *
 * A page is published only when the CLI on the `beta` npm tag accepts its
 * `--agent` value. `PUBLISHED_CLI_VERSION` names that release; bump it after
 * each CLI release. `scripts/check-published-cli-grammar.ts` checks every
 * published page against the real `install --help` before a deploy.
 */

/** The skilld release on the `beta` npm tag whose `--agent` values these pages print. */
export const PUBLISHED_CLI_VERSION = '3.0.0-beta.3'

export interface AgentPage {
  /** CLI `--agent` value and the route segment. */
  id: string
  /** First skilld release whose `--agent` accepts `id`. */
  cliSince: string
  /** Display name, matching the CLI's `displayName`. */
  label: string
  /** One line for the `/agents` index. */
  summary: string
  /** Where the Agent reads Skills inside a project. */
  projectSkillsDir: string
  /** Where the Agent reads Skills for every project, as a shell path. */
  globalSkillsDir: string
  /** Environment variable that moves the global directory, when one exists. */
  globalSkillsEnv?: string
  /** Registry category whose curated list fits this Agent's readers. */
  cluster: string
  /** Why that category, stated on the page in one line. */
  clusterReason: string
}

export const AGENT_PAGES: readonly AgentPage[] = [
  {
    id: 'claude-code',
    cliSince: '3.0.0-beta.1',
    label: 'Claude Code',
    summary: 'Terminal Agent from Anthropic. Skills load at session start or by name.',
    projectSkillsDir: '.claude/skills',
    globalSkillsDir: '~/.claude/skills',
    globalSkillsEnv: 'CLAUDE_CONFIG_DIR',
    cluster: 'context-engineering',
    clusterReason: 'Claude Code runs subagents and long sessions, so these Skills cover agent workflows.',
  },
  {
    id: 'codex',
    cliSince: '3.0.0-beta.1',
    label: 'Codex',
    summary: 'Terminal and editor Agent from OpenAI. Shares its Skills directory with Amp and Zed.',
    projectSkillsDir: '.agents/skills',
    globalSkillsDir: '~/.agents/skills',
    cluster: 'testing',
    clusterReason: 'Codex CLI work lives in the terminal next to the test runner, so these Skills cover testing and debugging.',
  },
  {
    id: 'cursor',
    cliSince: '3.0.0-beta.1',
    label: 'Cursor',
    summary: 'Editor Agent. Skills sit next to Rules and load on demand.',
    projectSkillsDir: '.cursor/skills',
    globalSkillsDir: '~/.cursor/skills',
    cluster: 'design',
    clusterReason: 'Most Cursor readers build interfaces, so these Skills cover design and front-end polish.',
  },
  {
    id: 'openclaw',
    cliSince: '3.0.0-beta.4',
    label: 'OpenClaw',
    summary: 'Personal assistant Agent that runs on your own machine.',
    projectSkillsDir: 'skills',
    globalSkillsDir: '~/.openclaw/skills',
    cluster: 'anti-slop',
    clusterReason: 'OpenClaw drafts messages and documents, so these Skills cover writing without the machine tells.',
  },
  {
    id: 'hermes',
    cliSince: '3.0.0-beta.4',
    label: 'Hermes Agent',
    summary: 'Agent from Nous Research for long autonomous tasks.',
    projectSkillsDir: '.hermes/skills',
    globalSkillsDir: '~/.hermes/skills',
    cluster: 'planning',
    clusterReason: 'Hermes runs long autonomous tasks, so these Skills cover plans and specs an Agent can follow.',
  },
  {
    id: 'github-copilot',
    cliSince: '3.0.0-beta.1',
    label: 'GitHub Copilot',
    summary: 'Coding agent, CLI, and editor Agent from GitHub. Skills follow the repository.',
    projectSkillsDir: '.github/skills',
    globalSkillsDir: '~/.copilot/skills',
    cluster: 'devops',
    clusterReason: 'Copilot lives in pull requests, so these Skills cover commits, branches, and releases.',
  },
  {
    id: 'gemini-cli',
    cliSince: '3.0.0-beta.1',
    label: 'Gemini CLI',
    summary: 'Terminal Agent from Google. Check loaded Skills with /skills list.',
    projectSkillsDir: '.gemini/skills',
    globalSkillsDir: '~/.gemini/skills',
    cluster: 'coding',
    clusterReason: 'Gemini CLI readers work across many stacks, so these Skills cover everyday coding.',
  },
  {
    id: 'windsurf',
    cliSince: '3.0.0-beta.1',
    label: 'Windsurf',
    summary: 'Editor Agent with Rules, Workflows, and portable Skills.',
    projectSkillsDir: '.windsurf/skills',
    globalSkillsDir: '~/.codeium/windsurf/skills',
    cluster: 'performance',
    clusterReason: 'Windsurf readers ship web apps, so these Skills cover performance and web quality.',
  },
  {
    id: 'opencode',
    cliSince: '3.0.0-beta.1',
    label: 'OpenCode',
    summary: 'Open-source terminal Agent. Global Skills follow XDG_CONFIG_HOME.',
    projectSkillsDir: '.opencode/skills',
    globalSkillsDir: '~/.config/opencode/skills',
    globalSkillsEnv: 'XDG_CONFIG_HOME',
    cluster: 'code-review',
    clusterReason: 'OpenCode readers work in existing codebases, so these Skills cover review and refactoring.',
  },
]

/**
 * Order two skilld versions of the form `MAJOR.MINOR.PATCH[-PRE.N]`.
 * A release without a prerelease tag sorts after one with it.
 */
export function compareCliVersions(a: string, b: string): number {
  const [aCore, aPre] = a.split('-', 2) as [string, string?]
  const [bCore, bPre] = b.split('-', 2) as [string, string?]
  const aParts = aCore.split('.').map(Number)
  const bParts = bCore.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0)
    if (diff !== 0)
      return diff
  }
  if (aPre === bPre)
    return 0
  if (aPre === undefined)
    return 1
  if (bPre === undefined)
    return -1
  const aIds = aPre.split('.')
  const bIds = bPre.split('.')
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    const x = aIds[i]
    const y = bIds[i]
    if (x === y)
      continue
    if (x === undefined)
      return -1
    if (y === undefined)
      return 1
    const xn = Number(x)
    const yn = Number(y)
    if (!Number.isNaN(xn) && !Number.isNaN(yn))
      return xn - yn
    return x < y ? -1 : 1
  }
  return 0
}

/** Pages whose `--agent` value the CLI at `cliVersion` accepts. */
export function publishedAgentPages(cliVersion = PUBLISHED_CLI_VERSION): AgentPage[] {
  return AGENT_PAGES.filter(page => compareCliVersions(page.cliSince, cliVersion) <= 0)
}

/** Route paths for pages that wait on a CLI release, so the sitemap skips them. */
export function unpublishedAgentPaths(cliVersion = PUBLISHED_CLI_VERSION): string[] {
  return AGENT_PAGES
    .filter(page => compareCliVersions(page.cliSince, cliVersion) > 0)
    .map(page => `/agents/${page.id}`)
}

export function agentPageById(id: string, cliVersion = PUBLISHED_CLI_VERSION): AgentPage | undefined {
  return publishedAgentPages(cliVersion).find(page => page.id === id)
}

export interface AgentSkillCandidate {
  owner: string
}

/**
 * Trim a curated category list down to a short, mixed shortlist.
 *
 * Categories rank by pinned examples then stars, so one prolific repository
 * can fill the top of the list. Capping each owner keeps several authors on
 * the page, which is the point of showing authors at all.
 */
export function selectAgentSkills<T extends AgentSkillCandidate>(
  items: readonly T[],
  options: { max: number, perOwner: number },
): T[] {
  const perOwner = new Map<string, number>()
  const selected: T[] = []
  for (const item of items) {
    if (selected.length >= options.max)
      break
    const seen = perOwner.get(item.owner) ?? 0
    if (seen >= options.perOwner)
      continue
    perOwner.set(item.owner, seen + 1)
    selected.push(item)
  }
  return selected
}
