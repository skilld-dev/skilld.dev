import { z } from 'zod'

/**
 * The `/developers` query parsers. They live apart from `developer-setup.ts`
 * because `/cli` imports that file for its snippets, and zod there put about
 * 90 kB raw of JavaScript in the `/cli` preloads.
 */
export const setupModeSchema = z.enum(['cli', 'mcp', 'api'])

export const mcpAppSchema = z.enum(['chatgpt', 'claude', 'claude-code', 'codex', 'cursor', 'vscode', 'other'])

export const apiSampleSchema = z.enum(['typescript', 'curl'])
