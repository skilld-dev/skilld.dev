/**
 * The Agent targets that get a `/agents/<id>` search page.
 *
 * Ids, project paths, and global paths mirror the CLI registry at
 * `crates/skilld-core/src/target.rs`. The site and the CLI share no code, so
 * update both when a target changes. Only targets with measured search demand
 * (`skilld-seo-opportunities.md`) appear here; the CLI supports more.
 */

export interface AgentPage {
  /** CLI `--agent` value and the route segment. */
  id: string
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
    label: 'Codex',
    summary: 'Terminal and editor Agent from OpenAI. Shares its Skills directory with Amp and Zed.',
    projectSkillsDir: '.agents/skills',
    globalSkillsDir: '~/.agents/skills',
    cluster: 'testing',
    clusterReason: 'Codex CLI work lives in the terminal next to the test runner, so these Skills cover testing and debugging.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    summary: 'Editor Agent. Skills sit next to Rules and load on demand.',
    projectSkillsDir: '.cursor/skills',
    globalSkillsDir: '~/.cursor/skills',
    cluster: 'design',
    clusterReason: 'Most Cursor readers build interfaces, so these Skills cover design and front-end polish.',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    summary: 'Personal assistant Agent that runs on your own machine.',
    projectSkillsDir: 'skills',
    globalSkillsDir: '~/.openclaw/skills',
    cluster: 'anti-slop',
    clusterReason: 'OpenClaw drafts messages and documents, so these Skills cover writing without the machine tells.',
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    summary: 'Agent from Nous Research for long autonomous tasks.',
    projectSkillsDir: '.hermes/skills',
    globalSkillsDir: '~/.hermes/skills',
    cluster: 'planning',
    clusterReason: 'Hermes runs long autonomous tasks, so these Skills cover plans and specs an Agent can follow.',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    summary: 'Coding agent, CLI, and editor Agent from GitHub. Skills follow the repository.',
    projectSkillsDir: '.github/skills',
    globalSkillsDir: '~/.copilot/skills',
    cluster: 'devops',
    clusterReason: 'Copilot lives in pull requests, so these Skills cover commits, branches, and releases.',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    summary: 'Terminal Agent from Google. Check loaded Skills with /skills list.',
    projectSkillsDir: '.gemini/skills',
    globalSkillsDir: '~/.gemini/skills',
    cluster: 'coding',
    clusterReason: 'Gemini CLI readers work across many stacks, so these Skills cover everyday coding.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    summary: 'Editor Agent with Rules, Workflows, and portable Skills.',
    projectSkillsDir: '.windsurf/skills',
    globalSkillsDir: '~/.codeium/windsurf/skills',
    cluster: 'performance',
    clusterReason: 'Windsurf readers ship web apps, so these Skills cover performance and web quality.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    summary: 'Open-source terminal Agent. Global Skills follow XDG_CONFIG_HOME.',
    projectSkillsDir: '.opencode/skills',
    globalSkillsDir: '~/.config/opencode/skills',
    globalSkillsEnv: 'XDG_CONFIG_HOME',
    cluster: 'code-review',
    clusterReason: 'OpenCode readers work in existing codebases, so these Skills cover review and refactoring.',
  },
]

export function agentPageById(id: string): AgentPage | undefined {
  return AGENT_PAGES.find(page => page.id === id)
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
