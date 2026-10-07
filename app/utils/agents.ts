/**
 * The coding agents skilld can install into.
 *
 * Mirrored by hand from the CLI's agent registry at
 * `crates/skilld-core/src/target.rs`, in the same order, as of skilld 3.6.4.
 * The site and the CLI share no code, so this table drifts if a target is
 * added there without being added here. `/cli` lists these ids as the
 * `--agent` values and counts them.
 *
 * The site never builds a per-agent command. The CLI detects the agent and
 * reports where it installed. Only `verify` survives here, because nothing the
 * CLI prints tells a user how to confirm the install landed in their editor.
 * The 54 targets 3.6.4 added have no checked step yet, so they carry `null`
 * and the site shows their project folder instead. Add a step only after
 * checking it in that Agent's own docs.
 */

export interface AgentTarget {
  id: string
  /** Display name, matching the CLI's `displayName`. */
  label: string
  /** Where a project install lands, matching the CLI's `project_skills_dir`. */
  projectDir: string
  /** What to do after installing, so the user can confirm it worked. Null until someone checks it. */
  verify: string | null
}

export const AGENT_TARGETS: readonly AgentTarget[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    projectDir: '.claude/skills',
    verify: 'Start a new Claude Code session. Skills load automatically.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    projectDir: '.cursor/skills',
    verify: 'Restart Cursor. Skills appear under Settings, Cursor Rules.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    projectDir: '.windsurf/skills',
    verify: 'Restart Windsurf. Skills invoke when their description matches.',
  },
  {
    id: 'cline',
    label: 'Cline',
    projectDir: '.cline/skills',
    verify: 'Restart your editor. Cline reads skill descriptions at startup.',
  },
  {
    id: 'codex',
    label: 'Codex',
    projectDir: '.agents/skills',
    verify: 'Start a new Codex session. Skills are discovered at startup.',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    projectDir: '.github/skills',
    verify: 'Restart your editor. Copilot reads .github/skills at startup.',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    projectDir: '.gemini/skills',
    verify: 'Start a new Gemini CLI session. Verify with /skills list.',
  },
  {
    id: 'goose',
    label: 'Goose',
    projectDir: '.goose/skills',
    verify: 'Start a new Goose session. Skills are discovered at startup.',
  },
  {
    id: 'amp',
    label: 'Amp',
    projectDir: '.agents/skills',
    verify: 'Start a new Amp session. Skill descriptions load at startup.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    projectDir: '.opencode/skills',
    verify: 'Start a new OpenCode session. Skills are discovered at startup.',
  },
  {
    id: 'roo',
    label: 'Roo Code',
    projectDir: '.roo/skills',
    verify: 'Restart your editor. Roo reads skill descriptions at startup.',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    projectDir: '.agent/skills',
    verify: 'Restart Antigravity. Skills are discovered at startup.',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    projectDir: 'skills',
    verify: 'Start a new OpenClaw session. Verify with openclaw skills list.',
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    projectDir: '.hermes/skills',
    verify: 'Start a new Hermes session. Verify with /skills. Project Skills load after hermes skills trust.',
  },
  {
    id: 'kiro',
    label: 'Kiro CLI',
    projectDir: '.kiro/skills',
    verify: 'Start a new Kiro CLI session. Type / to see Skills as slash commands.',
  },
  {
    id: 'kilo',
    label: 'Kilo Code',
    projectDir: '.kilo/skills',
    verify: 'Run /reload in Kilo Code, or start a new session. Then ask which Skills it has.',
  },
  {
    id: 'droid',
    label: 'Droid',
    projectDir: '.factory/skills',
    verify: 'Start a new Droid session. Verify with /skills.',
  },
  {
    id: 'trae',
    label: 'Trae',
    projectDir: '.trae/skills',
    verify: 'Open Trae. Skills appear under Settings, Skills & Commands.',
  },
  {
    id: 'zed',
    label: 'Zed',
    projectDir: '.agents/skills',
    verify: 'No restart needed. Type / in the Zed message editor to pick a Skill.',
  },
  {
    id: 'aider-desk',
    label: 'AiderDesk',
    projectDir: '.aider-desk/skills',
    verify: null,
  },
  {
    id: 'antigravity-cli',
    label: 'Antigravity CLI',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'astrbot',
    label: 'AstrBot',
    projectDir: 'data/skills',
    verify: null,
  },
  {
    id: 'augment',
    label: 'Augment',
    projectDir: '.augment/skills',
    verify: null,
  },
  {
    id: 'bob',
    label: 'IBM Bob',
    projectDir: '.bob/skills',
    verify: null,
  },
  {
    id: 'codearts-agent',
    label: 'CodeArts Agent',
    projectDir: '.codeartsdoer/skills',
    verify: null,
  },
  {
    id: 'codebuddy',
    label: 'CodeBuddy',
    projectDir: '.codebuddy/skills',
    verify: null,
  },
  {
    id: 'codemaker',
    label: 'Codemaker',
    projectDir: '.codemaker/skills',
    verify: null,
  },
  {
    id: 'codestudio',
    label: 'Code Studio',
    projectDir: '.codestudio/skills',
    verify: null,
  },
  {
    id: 'command-code',
    label: 'Command Code',
    projectDir: '.commandcode/skills',
    verify: null,
  },
  {
    id: 'continue',
    label: 'Continue',
    projectDir: '.continue/skills',
    verify: null,
  },
  {
    id: 'cortex',
    label: 'Cortex Code',
    projectDir: '.cortex/skills',
    verify: null,
  },
  {
    id: 'crush',
    label: 'Crush',
    projectDir: '.crush/skills',
    verify: null,
  },
  {
    id: 'deepagents',
    label: 'Deep Agents',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'devin',
    label: 'Devin for Terminal',
    projectDir: '.devin/skills',
    verify: null,
  },
  {
    id: 'dexto',
    label: 'Dexto',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'firebender',
    label: 'Firebender',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'forgecode',
    label: 'ForgeCode',
    projectDir: '.forge/skills',
    verify: null,
  },
  {
    id: 'fx',
    label: 'fx',
    projectDir: '.fx/skills',
    verify: null,
  },
  {
    id: 'inference-sh',
    label: 'inference.sh',
    projectDir: '.inferencesh/skills',
    verify: null,
  },
  {
    id: 'jazz',
    label: 'Jazz',
    projectDir: '.jazz/skills',
    verify: null,
  },
  {
    id: 'junie',
    label: 'Junie',
    projectDir: '.junie/skills',
    verify: null,
  },
  {
    id: 'iflow-cli',
    label: 'iFlow CLI',
    projectDir: '.iflow/skills',
    verify: null,
  },
  {
    id: 'kimchi',
    label: 'Kimchi',
    projectDir: '.kimchi/skills',
    verify: null,
  },
  {
    id: 'kimi-code-cli',
    label: 'Kimi Code CLI',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'kode',
    label: 'Kode',
    projectDir: '.kode/skills',
    verify: null,
  },
  {
    id: 'lingma',
    label: 'Lingma',
    projectDir: '.lingma/skills',
    verify: null,
  },
  {
    id: 'loaf',
    label: 'Loaf',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'mcpjam',
    label: 'MCPJam',
    projectDir: '.mcpjam/skills',
    verify: null,
  },
  {
    id: 'minimax-code',
    label: 'MiniMax Code',
    projectDir: '.minimax/skills',
    verify: null,
  },
  {
    id: 'moxby',
    label: 'Moxby',
    projectDir: '.moxby/skills',
    verify: null,
  },
  {
    id: 'mux',
    label: 'Mux',
    projectDir: '.mux/skills',
    verify: null,
  },
  {
    id: 'openhands',
    label: 'OpenHands',
    projectDir: '.openhands/skills',
    verify: null,
  },
  {
    id: 'ona',
    label: 'Ona',
    projectDir: '.ona/skills',
    verify: null,
  },
  {
    id: 'pi',
    label: 'Pi',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'posit-assistant',
    label: 'Posit Assistant',
    projectDir: '.posit/assistant/skills',
    verify: null,
  },
  {
    id: 'qoder',
    label: 'Qoder',
    projectDir: '.qoder/skills',
    verify: null,
  },
  {
    id: 'qoder-cn',
    label: 'Qoder CN',
    projectDir: '.qoder/skills',
    verify: null,
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    projectDir: '.qwen/skills',
    verify: null,
  },
  {
    id: 'replit',
    label: 'Replit',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'reasonix',
    label: 'Reasonix',
    projectDir: '.reasonix/skills',
    verify: null,
  },
  {
    id: 'rovodev',
    label: 'Rovo Dev',
    projectDir: '.rovodev/skills',
    verify: null,
  },
  {
    id: 'sarvam-code',
    label: 'Sarvam Code',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'tabnine-cli',
    label: 'Tabnine CLI',
    projectDir: '.tabnine/agent/skills',
    verify: null,
  },
  {
    id: 'terramind',
    label: 'Terramind',
    projectDir: '.terramind/skills',
    verify: null,
  },
  {
    id: 'tinycloud',
    label: 'Tinycloud',
    projectDir: '.tinycloud/skills',
    verify: null,
  },
  {
    id: 'trae-cn',
    label: 'Trae CN',
    projectDir: '.trae/skills',
    verify: null,
  },
  {
    id: 'warp',
    label: 'Warp',
    projectDir: '.agents/skills',
    verify: null,
  },
  {
    id: 'zcode',
    label: 'ZCode',
    projectDir: '.zcode/skills',
    verify: null,
  },
  {
    id: 'zencoder',
    label: 'Zencoder',
    projectDir: '.zencoder/skills',
    verify: null,
  },
  {
    id: 'zenflow',
    label: 'Zenflow',
    projectDir: '.zencoder/skills',
    verify: null,
  },
  {
    id: 'neovate',
    label: 'Neovate',
    projectDir: '.neovate/skills',
    verify: null,
  },
  {
    id: 'pochi',
    label: 'Pochi',
    projectDir: '.pochi/skills',
    verify: null,
  },
  {
    id: 'adal',
    label: 'AdaL',
    projectDir: '.adal/skills',
    verify: null,
  },
] as const
