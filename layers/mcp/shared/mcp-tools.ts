import { z } from 'zod'
import {
  collectionInstallCommand,
  installCommandFor,
  parseInstallRef,
  repoInstallCommand,
} from './mcp-install-command'

const SITE = 'https://skilld.dev'
const MAX_RESULT_CHARS = 48_000

/**
 * Tools read the registry and app layers over their public HTTP APIs only
 * (ADR-0001: cross-layer data via `$fetch('/api/...')`, never imported server
 * utils). The fetcher is injected so handlers stay pure and unit-testable.
 */
export interface McpToolDeps {
  fetchApi: <T>(path: string, opts?: {
    query?: Record<string, string | number>
    signal?: AbortSignal
  }) => Promise<T>
  reportError: (operation: string, error: unknown) => void
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
  description: string
  inputSchema: Record<string, z.ZodType>
  annotations: McpToolAnnotations
  run: (deps: McpToolDeps, args: unknown, signal?: AbortSignal) => Promise<McpToolResult>
}

function ok(data: Record<string, unknown>): McpToolResult {
  const text = JSON.stringify(data, null, 2)
  if (text.length > MAX_RESULT_CHARS)
    return fail('Result exceeded the MCP output limit. Request fewer items.')
  return {
    content: [{ type: 'text', text }],
    structuredContent: data,
  }
}

function fail(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function isNotFound(error: unknown): boolean {
  const e = error as { statusCode?: number, status?: number, response?: { status?: number } } | null
  return e?.statusCode === 404 || e?.status === 404 || e?.response?.status === 404
}

function failUnexpected(deps: McpToolDeps, operation: string, error: unknown): McpToolResult {
  deps.reportError(operation, error)
  return fail(`${operation} failed. Try again later.`)
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value || value.length <= maxLength)
    return value
  return `${value.slice(0, maxLength - 1)}…`
}

function epochToIso(sec: number | null | undefined): string | null {
  return sec ? new Date(sec * 1000).toISOString() : null
}

// --- wire shapes consumed from the public APIs (subset of each response) ---

interface SkillListItem {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
  installs: number
  stars: number
  trustTier: string
  official: boolean
  pushedAt: number | null
  modifiedAt: number | null
}

interface SkillListResponse {
  items: SkillListItem[]
  total: number
}

interface SkillDetailResponse {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string | null
  installs: number
  stars: number
  forks: number
  tier: string
  githubUrl: string
  pushedAt: string | null
  createdAt: string | null
  maturity: { ageDays: number, sinceUpdateDays: number, cadence: string } | null
  trust: { tier: string, score: number, reasons: string[] }
  provenance: {
    owner: string
    repo: string
    branch: string
    skillPath: string | null
    sourceCommitSha: string | null
    sourceCommitUrl: string | null
    skillFileUrl: string | null
    historyUrl: string | null
    modifiedAt: number | null
    lastSyncedAt: number | null
    syncStatus: string | null
  }
}

interface CollectionDetailResponse {
  authorLogin: string
  slug: string
  name: string
  preamble: string | null
  featured: boolean
  createdAt: number
  updatedAt: number
  skills: {
    position: number
    owner: string
    repo: string
    name: string | null
    displayName: string | null
    reason: string | null
  }[]
}

// --- tools ---

const SearchArgs = z.object({
  query: z.string().trim().min(1).max(200).describe('What the skill should help with, such as "nuxt seo" or "database migrations"'),
  limit: z.number().int().min(1).max(20).default(10).describe('Maximum results to return'),
})

const searchSkills: McpTool = {
  name: 'search_skills',
  description: 'Search the skilld.dev registry for agent skills (semantic + lexical ranking). Skills are markdown instructions published by maintainers in their own GitHub repos; results work with any coding agent. Returns ranked matches with source repo, trust tier, and the install command a user can run.',
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
    try {
      const res = await deps.fetchApi<SkillListResponse>('/api/skills', {
        query: { q: query, limit },
        signal,
      })
      return ok({
        query,
        total: res.total,
        results: res.items.slice(0, limit).map(s => ({
          owner: s.owner,
          repo: s.repo,
          name: s.name,
          displayName: s.displayName,
          description: truncate(s.description, 500),
          installs: s.installs,
          stars: s.stars,
          trustTier: s.trustTier,
          official: s.official,
          url: `${SITE}/gh/${s.owner}/${s.repo}/${s.name}`,
          installCommand: repoInstallCommand(s.owner, s.repo, s.name),
        })),
      })
    }
    catch (error) {
      return failUnexpected(deps, 'Search', error)
    }
  },
}

const GetSkillArgs = z.object({
  owner: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('GitHub owner'),
  repo: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('GitHub repository name'),
  name: z.string().trim().min(1).max(100).regex(/^[\w.-]+$/).describe('Skill name'),
})

const getSkill: McpTool = {
  name: 'get_skill',
  description: 'Look up one skill by owner/repo/name. Returns detail plus provenance: who publishes it, the exact SKILL.md source file and commit on GitHub, and freshness (last repo push, last content change, last registry sync).',
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
    try {
      const s = await deps.fetchApi<SkillDetailResponse>(
        `/api/skills/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(name)}`,
        { signal },
      )
      return ok({
        owner: s.owner,
        repo: s.repo,
        name: s.name,
        displayName: s.displayName,
        description: truncate(s.description, 1_000),
        installs: s.installs,
        stars: s.stars,
        forks: s.forks,
        tier: s.tier,
        trust: {
          tier: s.trust.tier,
          score: s.trust.score,
          reasons: s.trust.reasons.slice(0, 10).map(reason => truncate(reason, 500)),
        },
        url: `${SITE}/gh/${s.owner}/${s.repo}/${s.name}`,
        installCommand: repoInstallCommand(s.owner, s.repo, s.name),
        provenance: {
          author: s.provenance.owner,
          sourceRepoUrl: s.githubUrl,
          skillFileUrl: s.provenance.skillFileUrl,
          sourceCommitUrl: s.provenance.sourceCommitUrl,
          historyUrl: s.provenance.historyUrl,
          branch: s.provenance.branch,
          skillPath: s.provenance.skillPath,
          freshness: {
            repoPushedAt: s.pushedAt,
            contentModifiedAt: epochToIso(s.provenance.modifiedAt),
            lastSyncedAt: epochToIso(s.provenance.lastSyncedAt),
            cadence: s.maturity?.cadence ?? null,
          },
        },
      })
    }
    catch (error) {
      if (isNotFound(error))
        return fail(`Skill not found: ${owner}/${repo}/${name}. Try search_skills to find the right ref.`)
      return failUnexpected(deps, 'Skill lookup', error)
    }
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
  description: 'Look up a curated collection by curator login and collection slug (the /@login/slug pages on skilld.dev). Returns the collection, its skills with the curator\'s reasons, and the one-command install for the whole collection.',
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
    try {
      const c = await deps.fetchApi<CollectionDetailResponse>(
        `/api/collections/by-author/${encodeURIComponent(login)}/${encodeURIComponent(slug)}`,
        { signal },
      )
      const skills = c.skills.slice(offset, offset + limit)
      return ok({
        author: c.authorLogin,
        slug: c.slug,
        name: c.name,
        preamble: truncate(c.preamble, 2_000),
        featured: c.featured,
        updatedAt: epochToIso(c.updatedAt),
        url: `${SITE}/@${c.authorLogin}/${c.slug}`,
        installCommand: collectionInstallCommand(c.authorLogin, c.slug),
        totalSkills: c.skills.length,
        offset,
        limit,
        hasMore: offset + skills.length < c.skills.length,
        skills: skills.map(s => ({
          position: s.position,
          owner: s.owner,
          repo: s.repo,
          name: s.name,
          displayName: s.displayName,
          reason: truncate(s.reason, 1_000),
          url: s.name ? `${SITE}/gh/${s.owner}/${s.repo}/${s.name}` : `${SITE}/gh/${s.owner}/${s.repo}`,
          installCommand: repoInstallCommand(s.owner, s.repo, s.name ?? undefined),
        })),
      })
    }
    catch (error) {
      if (isNotFound(error))
        return fail(`Collection not found: @${login}/${slug}`)
      return failUnexpected(deps, 'Collection lookup', error)
    }
  },
}

const InstallCommandArgs = z.object({
  ref: z.string().trim().min(1).max(300).describe('Skill, repo, collection, curator, or npm package reference'),
})

const installCommand: McpTool = {
  name: 'install_command',
  description: 'Return the exact skilld CLI command that installs a skill, repo, collection, curator, or package ref. Accepted refs: "owner/repo", "gh:owner/repo", "owner/repo/skill-name", "@login", "@login/collection-slug", "npm:package". This tool only returns the command as text for the user to run; nothing is executed.',
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
        `Unrecognized ref: "${parsed.data.ref}". Accepted forms: "owner/repo", "gh:owner/repo", "owner/repo/skill-name", "@login", "@login/collection-slug", "npm:package".`,
      )
    }
    return ok({
      ref: parsed.data.ref,
      kind: ref.kind,
      command: installCommandFor(ref),
      note: 'Run this in the project root. It installs skill files locally and works with any coding agent.',
    })
  },
}

export const mcpTools: McpTool[] = [searchSkills, getSkill, getCollection, installCommand]
