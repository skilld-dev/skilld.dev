import { z } from 'zod'

/** The discovery MCP server. `nuxt.config.ts` mounts it at `mcp.route`. */
export const REGISTRY_MCP_URL = 'https://skilld.dev/api/mcp'

/** The key every client config files the server under. */
const SERVER_NAME = 'skilld'

/** The skilld-maintained Skill that `npx skilld install skilld` writes. */
export const SKILLD_SKILL_SOURCE = 'https://github.com/skilld-dev/skilld/blob/main/skills/skilld/SKILL.md'

export const setupModes = {
  cli: {
    label: 'CLI',
    hint: 'Recommended',
    detail: 'For coding Agents with a terminal.',
  },
  mcp: {
    label: 'MCP server',
    hint: 'No terminal',
    detail: 'For ChatGPT, Claude, and other MCP clients.',
  },
} as const

export const setupModeSchema = z.enum(['cli', 'mcp'])
export type SetupMode = z.infer<typeof setupModeSchema>

/** Alphabetical, so no vendor leads (VISION principle 6). */
export const mcpClients = {
  'chatgpt': { label: 'ChatGPT' },
  'claude': { label: 'Claude' },
  'claude-code': { label: 'Claude Code' },
  'codex': { label: 'Codex' },
  'cursor': { label: 'Cursor' },
  'vscode': { label: 'VS Code' },
  'other': { label: 'Other clients' },
} as const

export const mcpClientSchema = z.enum(['chatgpt', 'claude', 'claude-code', 'codex', 'cursor', 'vscode', 'other'])
export type McpClient = z.infer<typeof mcpClientSchema>

/** Cursor's install link carries the server config as base64 JSON, without the name. */
export function cursorInstallUrl(url: string = REGISTRY_MCP_URL): string {
  const config = btoa(JSON.stringify({ url }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`
}

/** VS Code's install link carries the whole server entry as URI-encoded JSON. */
export function vscodeInstallUrl(url: string = REGISTRY_MCP_URL): string {
  return `vscode:mcp/install?${encodeURIComponent(vscodeServerJson(url))}`
}

export function vscodeServerJson(url: string = REGISTRY_MCP_URL): string {
  return JSON.stringify({ name: SERVER_NAME, type: 'http', url })
}

export const setupSnippets = {
  skilldSkill: 'npx skilld install skilld --global',
  cliPrompt: 'Use skilld to find a Skill for Tailwind CSS, then run it.',
  mcpPrompt: 'Search skilld for a Skill for Tailwind CSS and give me the run command.',
  claudeCodePlugin: '/plugin marketplace add skilld-dev/skilld\n/plugin install skilld@skilld',
  claudeCodeMcp: `claude mcp add --transport http ${SERVER_NAME} ${REGISTRY_MCP_URL}`,
  codexMcp: `codex mcp add ${SERVER_NAME} --url ${REGISTRY_MCP_URL}`,
  codexToml: `[mcp_servers.${SERVER_NAME}]\nurl = "${REGISTRY_MCP_URL}"`,
  cursorJson: JSON.stringify({ mcpServers: { [SERVER_NAME]: { url: REGISTRY_MCP_URL } } }, null, 2),
  vscodeCli: `code --add-mcp '${vscodeServerJson()}'`,
  genericJson: JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: 'http', url: REGISTRY_MCP_URL } } }, null, 2),
} as const
