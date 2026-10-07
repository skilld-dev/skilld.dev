import type { FetchImplementation, OperationOutput, Result, SkilldFailure } from 'skilld-sdk'
import type { skillsV1 } from 'skilld-sdk/contract'
import { createSkilldClient } from 'skilld-sdk'
import { z } from 'zod'
import {
  installCommandFor,
  parseInstallRef,
  skillRunCommand,
} from './mcp-install-command'

const MAX_RESULT_CHARS = 48_000
/** Skill pages live on the public site, whatever API origin the tools call. */
const SITE_ORIGIN = 'https://skilld.dev'
/**
 * One spelling for every place an agent reads the accepted refs: the tool
 * description, the input schema, and the unrecognized-ref failure.
 */
const ACCEPTED_REFS = ['"owner/repo"', '"owner/repo/skill-name"', '"@login"', '"@login/collection-slug"'].join(', ')

/** Raw HTTP transport is injected. The SDK owns request and response parsing. */
export interface McpToolDeps {
  fetchApi: FetchImplementation
  baseUrl?: string
  reportError: (operation: string, error: unknown) => void
}

function clientFor(deps: McpToolDeps) {
  return createSkilldClient({
    fetch: deps.fetchApi,
    baseUrl: deps.baseUrl,
    // Each tool call is one request. Let the caller retry after a rate limit.
    retry: { maxAttempts: 1 },
  })
}

interface TextContent {
  type: 'text'
  text: string
}

export interface McpToolResult {
  content: TextContent[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface McpTool {
  name: string
  /** Human-readable name. Claude and ChatGPT show it in the tool list and the approval prompt. */
  title: string
  description: string
  inputSchema: Record<string, z.ZodType>
  annotations: McpToolAnnotations
  run: (deps: McpToolDeps, args: unknown, signal?: AbortSignal) => Promise<McpToolResult>
}

type OutputPolicy = 'paginated' | 'complete'

function ok(data: Record<string, unknown>, policy: OutputPolicy = 'paginated'): McpToolResult {
  const text = JSON.stringify(data, null, 2)
  if (policy === 'paginated' && text.length > MAX_RESULT_CHARS)
    return fail('Result exceeded the MCP output limit. Request fewer items.')
  return {
    content: [{ type: 'text', text }],
    structuredContent: data,
  }
}

function fail(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function presentResult(
  deps: McpToolDeps,
  operation: string,
  result: Result<Record<string, unknown>, SkilldFailure>,
  notFoundMessage?: string,
  outputPolicy: OutputPolicy = 'paginated',
): McpToolResult {
  if (result._tag === 'Ok')
    return ok(result.value, outputPolicy)

  const error = result.error
  if (error._tag === 'ApiFailure') {
    if (error.code === 'NOT_FOUND' && notFoundMessage)
      return fail(notFoundMessage)
    if (error.code === 'RATE_LIMITED')
      return fail('Too many requests. Try again later.')
    if (error.status >= 500)
      deps.reportError(operation, error)
    return fail(`${operation} failed. Try again later.`)
  }
  if (error._tag === 'RequestFailure')
    return fail('Invalid arguments. Check the tool input.')
  if (error._tag === 'TransportFailure' && error.reason === 'aborted')
    return fail('Request cancelled.')

  deps.reportError(operation, error)
  return fail(`${operation} failed. Try again later.`)
}

/**
 * The search answer names each Skill by its source only. Every result also
 * links its Skill page, so provenance is one click away (VISION principle 1).
 * The long path answers 301 to the canonical page of a one-Skill repository.
 */
function withSkillLinks(answer: OperationOutput<typeof skillsV1.operations.search>): Record<string, unknown> {
  return {
    ...answer,
    items: answer.items.map((item) => {
      const { owner, repository, selector } = item.source
      return {
        ...item,
        pageUrl: `${SITE_ORIGIN}/gh/${owner}/${repository}/${selector.name}`,
        runCommand: skillRunCommand(owner, repository, selector.name),
      }
    }),
  }
}

// --- tools ---

const SearchArgs = z.object({
  query: z.string().trim().min(1).max(200).describe('What the skill should help with, such as "nuxt seo" or "database migrations"'),
  limit: z.number().int().min(1).max(20).default(10).describe('Maximum results to return'),
})

const searchSkills: McpTool = {
  name: 'search_skills',
  title: 'Search Skills',
  description: 'Search the skilld.dev registry for agent skills that match a topic. A skill is a SKILL.md file that a maintainer publishes in their own GitHub repository, and it works with any coding agent. Returns each match with its source repository, GitHub star count, skilld.dev page, and run command.',
  inputSchema: SearchArgs.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = SearchArgs.safeParse(args)
    if (!parsed.success)
      return fail(`Invalid arguments: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    const { query, limit } = parsed.data
    const result = await clientFor(deps).skills.search({ query: { q: query, limit } }, { signal })
    return presentResult(deps, 'Search', result._tag === 'Ok' ? { _tag: 'Ok', value: withSkillLinks(result.value) } : result)
  },
}

const GetSkillArgs = z.object({
  owner: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('GitHub owner'),
  repo: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('GitHub repository name'),
  name: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('Skill name'),
})

const getSkill: McpTool = {
  name: 'get_skill',
  title: 'Get Skill details',
  description: 'Look up one skill by GitHub owner, repository, and skill name. Returns its provenance: the publisher, the exact SKILL.md file and commit on GitHub, and freshness (the last repository push and the last skill change). Also returns the SKILL.md text, the skilld.dev page, runCommand, and installCommand. runCommand gives the skill to a coding agent for one session and writes no files. installCommand writes the skill into the project for every session. Without a shell, such as in a chat app, follow the SKILL.md text in markdown for this session. Tell the user the skill name and source repository first. Files beside SKILL.md are listed in files, not included.',
  inputSchema: GetSkillArgs.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = GetSkillArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: owner, repo and name are required strings')
    const { owner, repo, name } = parsed.data
    const result = await clientFor(deps).skills.get({
      params: { owner, repository: repo, name },
    }, { signal })
    return presentResult(
      deps,
      'Skill lookup',
      result,
      `Skill not found: ${owner}/${repo}/${name}. Try search_skills to find the right ref.`,
      // A single Skill cannot be paginated. Preserve its complete SDK answer.
      'complete',
    )
  },
}

const GetCollectionArgs = z.object({
  login: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('Curator GitHub login'),
  slug: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('Collection slug'),
  limit: z.number().int().min(1).max(50).default(25).describe('Maximum skills to return'),
  offset: z.number().int().min(0).max(10_000).default(0).describe('Skills to skip for pagination'),
})

const getCollection: McpTool = {
  name: 'get_collection',
  title: 'Get collection',
  description: 'Look up a curated collection by curator GitHub login and collection slug, as in skilld.dev/@login/slug. Returns the collection, its skills with the reason the curator gives for each, and one command that installs the whole collection.',
  inputSchema: GetCollectionArgs.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = GetCollectionArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: login and slug are required strings')
    const { login, slug, limit, offset } = parsed.data
    const result = await clientFor(deps).collections.get({
      params: { login, slug },
      query: { limit, offset },
    }, { signal })
    return presentResult(deps, 'Collection lookup', result, `Collection not found: @${login}/${slug}`)
  },
}

const InstallCommandArgs = z.object({
  ref: z.string().trim().min(1).max(300).describe(`Skill, repo, collection, or curator reference: ${ACCEPTED_REFS}`),
})

// Only a single-skill ref has a run command, so the note must not promise one
// for a repo, collection, or curator ref.
function noteFor(runCommand: string | null): string {
  const install = 'The install command writes skill files locally and works with any coding agent.'
  if (!runCommand)
    return `Run this in the project root. ${install}`
  return `Run these in the project root. skilld run prints the skill for this session and writes nothing. ${install}`
}

const installCommand: McpTool = {
  name: 'install_command',
  title: 'Get run and install commands',
  description: `Return the exact skilld CLI commands for a skill, repository, collection, or curator ref. For a single skill, runCommand gives the skill to a coding agent for one session and writes no files. command installs the skills into the project. Accepted refs: ${ACCEPTED_REFS}. This tool returns text only. It runs and installs nothing.`,
  inputSchema: InstallCommandArgs.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async (_deps, args) => {
    const parsed = InstallCommandArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: ref is a required string')
    const ref = parseInstallRef(parsed.data.ref)
    if (!ref) {
      return fail(
        `Unrecognized ref: "${parsed.data.ref}". Accepted forms: ${ACCEPTED_REFS}.`,
      )
    }
    const runCommand = ref.kind === 'skill' ? skillRunCommand(ref.owner, ref.repo, ref.name) : null
    return ok({
      ref: parsed.data.ref,
      kind: ref.kind,
      runCommand,
      command: installCommandFor(ref),
      note: noteFor(runCommand),
    })
  },
}

export const mcpTools: McpTool[] = [searchSkills, getSkill, getCollection, installCommand]
