/**
 * The coding agents skilld can install into.
 *
 * Mirrored by hand from the CLI's agent registry at
 * `skilld/src/agent/targets/*.ts`. The site and the CLI share no code, so this
 * table drifts if a target is added there without being added here. The install
 * command itself never varies by agent; only the explanation does.
 */

export interface AgentTarget {
  id: string
  /** Display name, matching the CLI's `displayName`. */
  label: string
  icon: string
  /** Project-relative install directory. */
  projectDir: string
  /** Home-relative install directory, as a user would recognise it. */
  globalDir: string
  /** What to do after installing, so the user can confirm it worked. */
  verify: string
  /** Shown in the collapsed avatar row rather than behind the overflow. */
  featured?: boolean
}

export const AGENT_TARGETS: readonly AgentTarget[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    icon: 'i-simple-icons-claudecode',
    projectDir: '.claude/skills',
    globalDir: '~/.claude/skills',
    verify: 'Start a new Claude Code session. Skills load automatically.',
    featured: true,
  },
  {
    id: 'codex',
    label: 'Codex',
    icon: 'i-ri-openai-fill',
    projectDir: '.agents/skills',
    globalDir: '~/.agents/skills',
    verify: 'Start a new Codex session. Skills are discovered at startup.',
    featured: true,
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    icon: 'i-simple-icons-googlegemini',
    projectDir: '.gemini/skills',
    globalDir: '~/.gemini/skills',
    verify: 'Start a new Gemini CLI session. Verify with /skills list.',
    featured: true,
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    icon: 'i-simple-icons-githubcopilot',
    projectDir: '.github/skills',
    globalDir: '~/.copilot/skills',
    verify: 'Restart your editor. Copilot reads .github/skills at startup.',
    featured: true,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'i-lucide-square-mouse-pointer',
    projectDir: '.cursor/skills',
    globalDir: '~/.cursor/skills',
    verify: 'Restart Cursor. Skills appear under Settings, Cursor Rules.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    icon: 'i-lucide-wind',
    projectDir: '.windsurf/skills',
    globalDir: '~/.codeium/windsurf/skills',
    verify: 'Restart Windsurf. Skills invoke when their description matches.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    icon: 'i-lucide-square-terminal',
    projectDir: '.opencode/skills',
    globalDir: '~/.config/opencode/skills',
    verify: 'Start a new OpenCode session. Skills are discovered at startup.',
  },
  {
    id: 'amp',
    label: 'Amp',
    icon: 'i-lucide-zap',
    projectDir: '.agents/skills',
    globalDir: '~/.config/agents/skills',
    verify: 'Start a new Amp session. Skill descriptions load at startup.',
  },
  {
    id: 'cline',
    label: 'Cline',
    icon: 'i-lucide-bot',
    projectDir: '.cline/skills',
    globalDir: '~/.cline/skills',
    verify: 'Restart your editor. Cline reads skill descriptions at startup.',
  },
  {
    id: 'roo',
    label: 'Roo Code',
    icon: 'i-lucide-rabbit',
    projectDir: '.roo/skills',
    globalDir: '~/.roo/skills',
    verify: 'Restart your editor. Roo reads skill descriptions at startup.',
  },
  {
    id: 'goose',
    label: 'Goose',
    icon: 'i-lucide-bird',
    projectDir: '.goose/skills',
    globalDir: '~/.config/goose/skills',
    verify: 'Start a new Goose session. Skills are discovered at startup.',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    icon: 'i-lucide-orbit',
    projectDir: '.agent/skills',
    globalDir: '~/.gemini/antigravity/skills',
    verify: 'Restart Antigravity. Skills are discovered at startup.',
  },
] as const

export const FEATURED_AGENT_TARGETS = AGENT_TARGETS.filter(agent => agent.featured)
export const OVERFLOW_AGENT_TARGETS = AGENT_TARGETS.filter(agent => !agent.featured)

/** How a user brings a skill into an agent. */
export type SetupMode = 'project' | 'global' | 'once'

/**
 * The command for one agent and mode. `--agent` is only added when the user
 * picked an agent explicitly, so the copied command still reads as the one
 * universal command in the common case.
 */
export function agentInstallCmd(baseCmd: string, agentId: string, mode: SetupMode): string {
  if (mode === 'once')
    return baseCmd
  const global = mode === 'global' ? ' -g' : ''
  return `${baseCmd} --agent ${agentId}${global}`
}

/**
 * The paste-into-any-agent prompt. Reads the skill over HTTP and follows it
 * without writing anything to disk, which covers chat UIs and one-off use.
 */
export function oncePromptFor(docUrl: string): string {
  return `Read ${docUrl} and follow it.`
}

/** Pristine SKILL.md as text/markdown, served by /api/skills-raw. */
export function skillDocUrl(owner: string, repo: string, name: string): string {
  return `https://skilld.dev/api/skills-raw/${owner}/${repo}/${name}`
}
