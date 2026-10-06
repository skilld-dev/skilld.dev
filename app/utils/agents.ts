/**
 * The coding agents skilld can install into.
 *
 * Mirrored by hand from the CLI's agent registry at
 * `crates/skilld-core/src/target.rs`, in the same order, as of skilld 3.6.0.
 * The site and the CLI share no code, so this table drifts if a target is
 * added there without being added here. `/cli` lists these ids as the
 * `--agent` values and counts them.
 *
 * The site never builds a per-agent command. The CLI detects the agent and
 * reports where it installed. Only `verify` survives here, because nothing the
 * CLI prints tells a user how to confirm the install landed in their editor.
 */

export interface AgentTarget {
  id: string
  /** Display name, matching the CLI's `displayName`. */
  label: string
  /** What to do after installing, so the user can confirm it worked. */
  verify: string
}

export const AGENT_TARGETS: readonly AgentTarget[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    verify: 'Start a new Claude Code session. Skills load automatically.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    verify: 'Restart Cursor. Skills appear under Settings, Cursor Rules.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    verify: 'Restart Windsurf. Skills invoke when their description matches.',
  },
  {
    id: 'cline',
    label: 'Cline',
    verify: 'Restart your editor. Cline reads skill descriptions at startup.',
  },
  {
    id: 'codex',
    label: 'Codex',
    verify: 'Start a new Codex session. Skills are discovered at startup.',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    verify: 'Restart your editor. Copilot reads .github/skills at startup.',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    verify: 'Start a new Gemini CLI session. Verify with /skills list.',
  },
  {
    id: 'goose',
    label: 'Goose',
    verify: 'Start a new Goose session. Skills are discovered at startup.',
  },
  {
    id: 'amp',
    label: 'Amp',
    verify: 'Start a new Amp session. Skill descriptions load at startup.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    verify: 'Start a new OpenCode session. Skills are discovered at startup.',
  },
  {
    id: 'roo',
    label: 'Roo Code',
    verify: 'Restart your editor. Roo reads skill descriptions at startup.',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    verify: 'Restart Antigravity. Skills are discovered at startup.',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    verify: 'Start a new OpenClaw session. Verify with openclaw skills list.',
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    verify: 'Start a new Hermes session. Verify with /skills. Project Skills load after hermes skills trust.',
  },
  {
    id: 'kiro',
    label: 'Kiro CLI',
    verify: 'Start a new Kiro CLI session. Type / to see Skills as slash commands.',
  },
  {
    id: 'kilo',
    label: 'Kilo Code',
    verify: 'Run /reload in Kilo Code, or start a new session. Then ask which Skills it has.',
  },
  {
    id: 'droid',
    label: 'Droid',
    verify: 'Start a new Droid session. Verify with /skills.',
  },
  {
    id: 'trae',
    label: 'Trae',
    verify: 'Open Trae. Skills appear under Settings, Skills & Commands.',
  },
  {
    id: 'zed',
    label: 'Zed',
    verify: 'No restart needed. Type / in the Zed message editor to pick a Skill.',
  },
] as const
