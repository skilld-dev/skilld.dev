import { z } from 'zod'
import { skilldSelfInstallCmd } from '#shared/skill-commands'

/** The discovery MCP server. `nuxt.config.ts` mounts it at `mcp.route`. */
export const REGISTRY_MCP_URL = 'https://skilld.dev/api/mcp'

/** The key every app's config files the server under. */
const SERVER_NAME = 'skilld'

/** The skilld-maintained Skill that `npx skilld install skilld` writes. */
export const SKILLD_SKILL_SOURCE = 'https://github.com/skilld-dev/skilld/blob/main/skills/skilld/SKILL.md'

export const setupModes = {
  cli: {
    label: 'CLI',
    hint: 'Recommended',
    detail: 'For coding agents with a terminal.',
  },
  mcp: {
    label: 'MCP server',
    hint: 'No terminal',
    detail: 'For ChatGPT, Claude, and any app that speaks MCP.',
  },
  api: {
    label: 'API',
    hint: 'Scripts',
    detail: 'For your own code, with the TypeScript SDK or plain HTTP.',
  },
} as const

export const setupModeSchema = z.enum(['cli', 'mcp', 'api'])

/** Alphabetical, so no vendor leads (VISION principle 6). */
export const mcpApps = {
  'chatgpt': { label: 'ChatGPT' },
  'claude': { label: 'Claude' },
  'claude-code': { label: 'Claude Code' },
  'codex': { label: 'Codex' },
  'cursor': { label: 'Cursor' },
  'vscode': { label: 'VS Code' },
  'other': { label: 'Other apps' },
} as const

export const mcpAppSchema = z.enum(['chatgpt', 'claude', 'claude-code', 'codex', 'cursor', 'vscode', 'other'])

/** Cursor's install link carries the server config as base64 JSON, without the name. */
export function cursorInstallUrl(url: string = REGISTRY_MCP_URL): string {
  const config = btoa(JSON.stringify({ url }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`
}

/** VS Code's install link carries the whole server entry as URI-encoded JSON. */
export function vscodeInstallUrl(url: string = REGISTRY_MCP_URL): string {
  return `vscode:mcp/install?${encodeURIComponent(vscodeServerJson(url))}`
}

function vscodeServerJson(url: string = REGISTRY_MCP_URL): string {
  return JSON.stringify({ name: SERVER_NAME, type: 'http', url })
}

export const setupSnippets = {
  skilldSkill: skilldSelfInstallCmd(),
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

/** The skilld API. Its OpenAPI document is generated from the contract in `packages/sdk`. */
const API_ORIGIN = 'https://skilld.dev'
export const API_OPENAPI_PATH = '/api/v1/openapi.json'

/** Creates a skilld token. The page asks for sign-in first, then returns here. */
export const API_TOKEN_PAGE = '/me/cli-tokens/new'

export const apiSamples = {
  typescript: { label: 'TypeScript SDK' },
  curl: { label: 'cURL' },
} as const

export const apiSampleSchema = z.enum(['typescript', 'curl'])

/**
 * One call the page prints, in both the SDK form and the cURL form. A unit
 * test sends each through the SDK and checks it against the contract, so a
 * printed call cannot drift from the operations the API serves.
 */
export interface ApiSampleCall {
  /** What the call does, printed above it as a comment. */
  note: string
  /** The SDK reaches the operation at `skilld.<namespace>.<key>`. */
  namespace: string
  key: string
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  /** The operation's path template, as the contract declares it. */
  path: `/api/v1/${string}`
  params?: Readonly<Record<string, string>>
  query?: Readonly<Record<string, string>>
  /** An account operation sends the token. A public one sends nothing. */
  account: boolean
}

/** The contract's own example Skill. It is admitted on skilld.dev. */
const SAMPLE_SKILL = { owner: 'vercel-labs', repository: 'agent-skills', name: 'web-design-guidelines' } as const

export const apiSampleCalls = {
  search: {
    note: 'Search the registry',
    namespace: 'skills',
    key: 'search',
    method: 'GET',
    path: '/api/v1/skills',
    query: { q: 'tailwind' },
    account: false,
  },
  get: {
    note: 'Read one Skill with its provenance',
    namespace: 'skills',
    key: 'get',
    method: 'GET',
    path: '/api/v1/skills/{owner}/{repository}/{name}',
    params: SAMPLE_SKILL,
    account: false,
  },
  watch: {
    note: 'Watch its Repository. Account operations send the token.',
    namespace: 'watches',
    key: 'create',
    method: 'PUT',
    path: '/api/v1/account/watches/{owner}/{repository}',
    params: { owner: SAMPLE_SKILL.owner, repository: SAMPLE_SKILL.repository },
    account: true,
  },
} as const satisfies Record<string, ApiSampleCall>

function objectLiteral(record: Readonly<Record<string, string>>): string {
  return `{ ${Object.entries(record).map(([key, value]) => `${key}: '${value}'`).join(', ')} }`
}

/** `const <name> = await skilld.<namespace>.<key>({ ... })` */
export function sdkCall(call: ApiSampleCall, name: string): string {
  const input = [
    call.params && `  params: ${objectLiteral(call.params)},`,
    call.query && `  query: ${objectLiteral(call.query)},`,
  ].filter(Boolean)
  return `const ${name} = await skilld.${call.namespace}.${call.key}({\n${input.join('\n')}\n})`
}

/**
 * The same call as one cURL command. The URL is quoted, because zsh reads an
 * unquoted `?` as a glob and refuses the command.
 */
export function curlCall(call: ApiSampleCall): string {
  const path = call.path.replace(/\{([^{}]+)\}/g, (_match, name: string) => encodeURIComponent(call.params?.[name] ?? ''))
  const search = call.query ? `?${new URLSearchParams(call.query)}` : ''
  const method = call.method === 'GET' ? '' : `-X ${call.method} `
  const url = `curl ${method}'${API_ORIGIN}${path}${search}'`
  return call.account ? `${url} \\\n  -H "Authorization: Bearer $SKILLD_TOKEN"` : url
}

export const apiSnippets = {
  tokenEnv: 'export SKILLD_TOKEN="paste-your-token-here"',
  sdkInstall: 'npm install skilld-sdk',
  sdkQuickStart: [
    `import { createSkilldClient } from 'skilld-sdk'`,
    '',
    '// Public operations work without a token.',
    'const skilld = createSkilldClient({ token: process.env.SKILLD_TOKEN })',
    '',
    sdkCall(apiSampleCalls.search, 'found'),
    `if (found._tag === 'Err')`,
    '  throw new Error(found.error._tag)',
    '',
    'console.log(found.value.items)',
  ].join('\n'),
  curlQuickStart: curlCall(apiSampleCalls.search),
  sdkSamples: [
    `// ${apiSampleCalls.get.note}`,
    sdkCall(apiSampleCalls.get, 'skill'),
    '',
    `// ${apiSampleCalls.watch.note}`,
    sdkCall(apiSampleCalls.watch, 'watched'),
  ].join('\n'),
  curlSamples: [
    `# ${apiSampleCalls.get.note}`,
    curlCall(apiSampleCalls.get),
    '',
    `# ${apiSampleCalls.watch.note}`,
    curlCall(apiSampleCalls.watch),
  ].join('\n'),
} as const
