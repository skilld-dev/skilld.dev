import type { FetchImplementation, Result, SkilldFailure } from 'skilld-sdk'
import type { Presented, TrackListAnswer, TrendingAnswer } from './mcp-presenters'
import { createSkilldClient } from 'skilld-sdk'
import { z } from 'zod'
import { parseInstallRef } from './mcp-install-command'
import {
  indexRequestOutputSchema,
  installCommandOutputSchema,
  presentIndexRequest,
  presentInstallCommand,
  presentRepository,
  presentSearch,
  presentSkill,
  presentTrack,
  presentTrackList,
  presentTrending,
  repositoryOutputSchema,
  searchOutputSchema,
  skillOutputSchema,
  trackListOutputSchema,
  trackOutputSchema,
  trendingOutputSchema,
} from './mcp-presenters'

const MAX_RESULT_CHARS = 48_000
/**
 * One spelling for every place an agent reads the accepted refs: the tool
 * description, the input schema, and the unrecognized-ref failure.
 */
const ACCEPTED_REFS = ['"owner/repo"', '"owner/repo/skill-name"'].join(', ')

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
  /** Shape of structuredContent. The MCP SDK checks every answer against it. */
  outputSchema: z.ZodObject<z.ZodRawShape>
  annotations: McpToolAnnotations
  /** A prompt that calls the tool. /developers/mcp prints it beside the tool. */
  examplePrompt: string
  run: (deps: McpToolDeps, args: unknown, signal?: AbortSignal) => Promise<McpToolResult>
}

type OutputPolicy = 'paginated' | 'complete'

/** The Markdown answer goes to content, the typed copy to structuredContent. */
function ok(presented: Presented<Record<string, unknown>>, policy: OutputPolicy = 'paginated'): McpToolResult {
  const size = presented.text.length + JSON.stringify(presented.structured).length
  if (policy === 'paginated' && size > MAX_RESULT_CHARS)
    return fail('Result exceeded the MCP output limit. Request fewer items.')
  return {
    content: [{ type: 'text', text: presented.text }],
    structuredContent: presented.structured,
  }
}

function fail(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function presentResult<T>(
  deps: McpToolDeps,
  operation: string,
  result: Result<T, SkilldFailure>,
  present: (value: T) => Presented<Record<string, unknown>>,
  notFoundMessage?: string,
  outputPolicy: OutputPolicy = 'paginated',
): McpToolResult {
  if (result._tag === 'Ok')
    return ok(present(result.value), outputPolicy)

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
  outputSchema: searchOutputSchema,
  examplePrompt: 'Find a skill for Tailwind CSS.',
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
    return presentResult(deps, 'Search', result, answer => presentSearch(query, answer))
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
  description: 'Look up one skill by GitHub owner, repository, and skill name. Returns its provenance: the publisher, the exact SKILL.md file and commit on GitHub, and freshness (the last repository push and the last skill change). Also returns the full SKILL.md text, the skilld.dev page, runCommand, and installCommand. runCommand gives the skill to a coding agent for one session and writes no files. installCommand writes the skill into the project for every session. files lists the files beside SKILL.md without their contents. skilld does not check whether a skill is safe.',
  inputSchema: GetSkillArgs.shape,
  outputSchema: skillOutputSchema,
  examplePrompt: 'Who wrote vercel-labs/agent-skills/web-design-guidelines, and when did it last change?',
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
      presentSkill,
      `Skill not found: ${owner}/${repo}/${name}. Try search_skills to find the right ref.`,
      // A single Skill cannot be paginated. Keep its complete SKILL.md.
      'complete',
    )
  },
}

const SEGMENT = z.string().trim().min(1).max(100).regex(/^[\w.-]+$/)
const TRACK_SLUG = z.string().trim().min(1).max(64).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)

const ListTracksArgs = z.object({})

const listTracks: McpTool = {
  name: 'list_tracks',
  title: 'List tracks',
  description: 'List skilld\'s tracks. A track is a page of Skills for one kind of work a developer wants done, such as testing and debugging, planning and specs, or design and interface work. A person picks its first Skills, and a classifier adds the rest. Returns each track\'s slug, label, the goal it serves, its skilld.dev page, and its Skill count.',
  inputSchema: ListTracksArgs.shape,
  outputSchema: trackListOutputSchema,
  examplePrompt: 'What kinds of work does skilld have Skills for?',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, _args, signal) => {
    const result = await clientFor(deps).tracks.list(undefined, { signal })
    // The client parsed the items with trackSummarySchema. Only the SDK's types lost them.
    return presentResult(deps, 'Track list', result, answer => presentTrackList(answer as TrackListAnswer))
  },
}

const GetTrackArgs = z.object({
  slug: TRACK_SLUG.describe('Track slug, such as "testing" or "design"'),
  limit: z.number().int().min(1).max(25).default(10).describe('Maximum Skills to return'),
  offset: z.number().int().min(0).max(10_000).default(0).describe('Skills to skip for pagination'),
})

const getTrack: McpTool = {
  name: 'get_track',
  title: 'Get track',
  description: 'Get the Skills in one track, the page of Skills for one kind of work, such as testing or design. Takes the track slug. Returns the track\'s label, its goal line, its skilld.dev page, and its Skills in page order: the hand-picked Skills first, then the rest by GitHub stars. Each Skill has its GitHub owner and repository, its skilld.dev page, and its run command. total counts every Skill in the track, and limit and offset page through them.',
  inputSchema: GetTrackArgs.shape,
  outputSchema: trackOutputSchema,
  examplePrompt: 'Which skills help with testing and debugging?',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = GetTrackArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: slug is a lowercase track slug, such as "testing"')
    const { slug, limit, offset } = parsed.data
    const result = await clientFor(deps).tracks.get({ params: { slug }, query: { limit, offset } }, { signal })
    return presentResult(deps, 'Track lookup', result, answer => presentTrack(answer, offset), `Track not found: ${slug}`)
  },
}

const ListTrendingArgs = z.object({
  window: z.enum(['week', 'month']).default('week').describe('Board period: the past week or the past month'),
  limit: z.number().int().min(1).max(20).default(10).describe('Maximum rows to return'),
})

const listTrending: McpTool = {
  name: 'list_trending',
  title: 'List trending Skills',
  description: 'See which Skills developers talked about recently. Returns the skilld.dev trending board for the past week or month, in rank order. Each row says why it is on the board: a social row counts the devs and the public X and Bluesky posts that mentioned the Skill and links one post, a star-surge row counts new GitHub stars, and a star-count row fills the rest of the board. Each row has its GitHub owner and repository, its skilld.dev page, and its run command.',
  inputSchema: ListTrendingArgs.shape,
  outputSchema: trendingOutputSchema,
  examplePrompt: 'What skills are developers talking about this week?',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = ListTrendingArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: window is "week" or "month", and limit is 1 to 20')
    const { window, limit } = parsed.data
    const result = await clientFor(deps).trending.list({ query: { window, limit } }, { signal })
    // The client parsed the items with trendingSkillSchema. Only the SDK's types lost them.
    return presentResult(deps, 'Trending', result, answer => presentTrending(window, answer as TrendingAnswer))
  },
}

const GetRepositoryArgs = z.object({
  owner: SEGMENT.describe('GitHub owner'),
  repo: SEGMENT.describe('GitHub repository name'),
  limit: z.number().int().min(1).max(30).default(20).describe('Maximum Skills to return'),
})

const getRepository: McpTool = {
  name: 'get_repository',
  title: 'Get repository',
  description: 'See every Skill that one GitHub repository publishes. Takes the owner and the repository name. Returns the repository\'s description, GitHub star count, last push, skilld.dev page, and the command that installs all of its Skills. Its Skills come most recently changed first, each with its skilld.dev page and run command. total counts every Skill in the repository.',
  inputSchema: GetRepositoryArgs.shape,
  outputSchema: repositoryOutputSchema,
  examplePrompt: 'Which skills does vercel-labs/agent-skills publish?',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = GetRepositoryArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: owner and repo are required strings, and limit is 1 to 30')
    const { owner, repo, limit } = parsed.data
    const result = await clientFor(deps).repositories.get({ params: { owner, repository: repo } }, { signal })
    // The answer has no pages. The presenter bounds it so a large Repository stays under the output limit.
    return presentResult(deps, 'Repository lookup', result, answer => presentRepository(answer, limit), `Repository not found: ${owner}/${repo}`)
  },
}

const SubmitRepositoryArgs = z.object({
  repository: z.string().trim().min(3).max(2048).regex(/^(?:[\w.-]+\/[\w.-]+|https?:\/\/\S+)$/).describe('owner/repo, or the URL of a public GitHub repository'),
})

const submitRepository: McpTool = {
  name: 'submit_repository',
  title: 'Submit a repository',
  description: 'Ask skilld.dev to index the Skills in a public GitHub repository. Takes owner/repo or a GitHub URL. If the registry already holds Skills from the repository, returns status indexed with its Skill count and the repository\'s skilld.dev page. Otherwise it queues an index request and returns status queued, its id, and a status URL. The status URL reports progress, or the reason the request failed, such as a private or missing repository. A second request for a queued repository returns the same id. A person still reviews which Skills the registry admits. This changes nothing in the repository.',
  inputSchema: SubmitRepositoryArgs.shape,
  outputSchema: indexRequestOutputSchema,
  examplePrompt: 'Add github.com/vercel-labs/agent-skills to skilld.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  run: async (deps, args, signal) => {
    const parsed = SubmitRepositoryArgs.safeParse(args)
    if (!parsed.success)
      return fail('Invalid arguments: repository is owner/repo or the URL of a public GitHub repository')
    const { repository } = parsed.data
    const result = await clientFor(deps).indexRequests.create({ body: { repository } }, { signal })
    if (result._tag === 'Err' && result.error._tag === 'ApiFailure' && result.error.code === 'INVALID_REQUEST')
      return fail(`Cannot index ${repository}. Send owner/repo or the URL of a public GitHub repository.`)
    return presentResult(deps, 'Repository submission', result, presentIndexRequest)
  },
}

const InstallCommandArgs = z.object({
  ref: z.string().trim().min(1).max(300).describe(`Skill or repository reference: ${ACCEPTED_REFS}`),
})

const installCommand: McpTool = {
  name: 'install_command',
  title: 'Get run and install commands',
  description: `Return the exact skilld CLI commands for a skill or a repository ref. For a single skill, runCommand gives the skill to a coding agent for one session and writes no files. command installs the skills into the project. Accepted refs: ${ACCEPTED_REFS}. This tool returns text only. It runs and installs nothing.`,
  inputSchema: InstallCommandArgs.shape,
  outputSchema: installCommandOutputSchema,
  examplePrompt: 'Give me the command to try anthropics/skills/skill-creator without installing it.',
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
    return ok(presentInstallCommand(ref, parsed.data.ref))
  },
}

export const mcpTools: McpTool[] = [searchSkills, getSkill, installCommand, listTracks, getTrack, listTrending, getRepository, submitRepository]
