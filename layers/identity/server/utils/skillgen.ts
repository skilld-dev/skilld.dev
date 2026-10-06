/// <reference types="@cloudflare/workers-types" />
import type { SkillgenEntryEligibility } from '../../shared/contracts/skillgen'
import { z } from 'zod'
import { packageJsonPath, packageSkillCandidates, packageSkillRoot } from '../../../../workers/skill-harness/src/package-skills'

/**
 * Skillgen opt-in. A maintainer turns Skillgen on per repository, and the
 * skill-harness Worker queues jobs only for those. Eligibility uses the
 * Worker's own package rule, so the account page never offers a repository the
 * Worker would skip. Skillgen supports npm packages only.
 */

export interface SkillgenRepository { owner: string, repo: string }

/** What the Worker would find in a repository. `packages` names each npm package whose Skill it updates. */
export type SkillgenInspection
  = | { _tag: 'Eligible', packages: string[] }
    | { _tag: 'NotFound' }
    | { _tag: 'NoPackage' }
    | { _tag: 'NoSkill' }
    | { _tag: 'UnpublishedPackage' }
    | { _tag: 'TreeTooLarge' }
    | { _tag: 'GithubUnavailable', status: number }

export type SkillgenEligibility
  = | ({ _tag: 'Eligible', packages: string[] } & SkillgenRepository)
    | Exclude<SkillgenInspection, { _tag: 'Eligible' }>
    | { _tag: 'NotPublic' }
    | { _tag: 'NotMaintainer' }

/** Reads one GitHub REST path as the signed-in account. */
export type GithubGet = (path: string) => Promise<Response>

export function githubUserGet(token: string, fetcher: typeof fetch = fetch): GithubGet {
  return path => fetcher(`https://api.github.com${path}`, {
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${token}`,
      'user-agent': 'skilld.dev',
      'x-github-api-version': '2022-11-28',
    },
  })
}

const repositorySchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  archived: z.boolean().optional(),
  permissions: z.object({ admin: z.boolean().optional(), maintain: z.boolean().optional() }).optional(),
})
const treeSchema = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), type: z.string() })) })
const contentSchema = z.object({ content: z.string(), encoding: z.literal('base64') })
const packageSchema = z.object({ name: z.string().min(1), private: z.boolean().optional() })

function canMaintain(repository: z.infer<typeof repositorySchema>): boolean {
  return !!(repository.permissions?.admin || repository.permissions?.maintain)
}

function splitFullName(fullName: string): SkillgenRepository {
  const [owner = '', repo = ''] = fullName.split('/')
  return { owner, repo }
}

function repositoryPath(ref: SkillgenRepository): string {
  return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`
}

/** A `package.json` that is not JSON counts as unpublished, so it returns undefined instead of throwing. */
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

/** The published name of the package at `packageDir`, or null when it is private or unnamed. */
async function publishedName(github: GithubGet, prefix: string, packageDir: string): Promise<string | null | { status: number }> {
  const response = await github(`${prefix}/contents/${packageJsonPath(packageDir)}`)
  if (response.status === 404)
    return null
  if (!response.ok)
    return { status: response.status }
  const content = contentSchema.safeParse(await response.json())
  if (!content.success)
    return null
  const parsed = packageSchema.safeParse(parseJsonText(atob(content.data.content.replaceAll('\n', ''))))
  return parsed.success && !parsed.data.private ? parsed.data.name : null
}

/**
 * Reads the default branch the way the Worker will: each package at the root
 * or under `packages/` that holds a Skill, and whether npm can publish it.
 */
export async function inspectSkillgenRepository(github: GithubGet, ref: SkillgenRepository): Promise<SkillgenInspection> {
  const prefix = repositoryPath(ref)
  const response = await github(`${prefix}/git/trees/HEAD?recursive=1`)
  if (response.status === 404 || response.status === 409)
    return response.status === 404 ? { _tag: 'NotFound' } : { _tag: 'NoPackage' }
  if (!response.ok)
    return { _tag: 'GithubUnavailable', status: response.status }
  const tree = treeSchema.parse(await response.json())
  if (tree.truncated)
    return { _tag: 'TreeTooLarge' }
  const paths = tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path)
  const candidates = packageSkillCandidates(paths)
  if (!candidates.length)
    return paths.some(path => path === 'package.json' || /^packages\/[\w.-]+\/package\.json$/.test(path)) ? { _tag: 'NoSkill' } : { _tag: 'NoPackage' }

  const packages: string[] = []
  for (const candidate of candidates) {
    const name = await publishedName(github, prefix, candidate.packageDir)
    if (name !== null && typeof name === 'object')
      return { _tag: 'GithubUnavailable', status: name.status }
    if (name !== null && packageSkillRoot(candidate, name) !== undefined)
      packages.push(name)
  }
  return packages.length ? { _tag: 'Eligible', packages } : { _tag: 'UnpublishedPackage' }
}

/**
 * Checks one repository before an opt-in. The account must hold admin or
 * maintain rights, because opting in lets an App write to the repository.
 */
export async function checkSkillgenEligibility(github: GithubGet, ref: SkillgenRepository): Promise<SkillgenEligibility> {
  const response = await github(repositoryPath(ref))
  if (response.status === 404)
    return { _tag: 'NotFound' }
  if (!response.ok)
    return { _tag: 'GithubUnavailable', status: response.status }
  const repository = repositorySchema.parse(await response.json())
  if (repository.private)
    return { _tag: 'NotPublic' }
  if (!canMaintain(repository))
    return { _tag: 'NotMaintainer' }
  const canonical = splitFullName(repository.full_name)
  const inspection = await inspectSkillgenRepository(github, canonical)
  return inspection._tag === 'Eligible' ? { ...inspection, ...canonical } : inspection
}

const MAX_REPOSITORY_PAGES = 3

/** Public repositories the account can maintain, newest push first. At most 300. */
export async function listMaintainedRepositories(github: GithubGet): Promise<{ _tag: 'Ok', repositories: SkillgenRepository[] } | { _tag: 'GithubUnavailable', status: number }> {
  const repositories: SkillgenRepository[] = []
  for (let page = 1; page <= MAX_REPOSITORY_PAGES; page++) {
    const response = await github(`/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`)
    if (!response.ok)
      return { _tag: 'GithubUnavailable', status: response.status }
    const items = z.array(repositorySchema).parse(await response.json())
    for (const item of items) {
      if (!item.private && !item.archived && canMaintain(item))
        repositories.push(splitFullName(item.full_name))
    }
    if (items.length < 100)
      break
  }
  return { _tag: 'Ok', repositories }
}

export interface SkillgenRepositoryRow extends SkillgenRepository { optedIn: boolean }

/**
 * Keeps the repositories that hold at least one Skill in the registry, and
 * marks the ones already opted in. Uses the registry's casing.
 */
export async function skillgenCandidates(db: D1Database, repositories: SkillgenRepository[]): Promise<SkillgenRepositoryRow[]> {
  if (!repositories.length)
    return []
  const { results } = await db.prepare(
    `SELECT r.owner AS owner, r.repo AS repo, o.owner IS NOT NULL AS opted_in
     FROM json_each(?1) AS j
     JOIN repos r ON r.owner = json_extract(j.value, '$[0]') COLLATE NOCASE
       AND r.repo = json_extract(j.value, '$[1]') COLLATE NOCASE
     LEFT JOIN skillgen_repositories o ON o.owner = r.owner AND o.repo = r.repo
     WHERE EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo)
     ORDER BY j.key`,
  ).bind(JSON.stringify(repositories.map(item => [item.owner, item.repo]))).all<{ owner: string, repo: string, opted_in: number }>()
  return results.map(row => ({ owner: row.owner, repo: row.repo, optedIn: row.opted_in === 1 }))
}

export async function optInSkillgenRepository(db: D1Database, userId: number, repository: SkillgenRepository, now: number): Promise<void> {
  await db.prepare(
    `INSERT INTO skillgen_repositories (owner, repo, user_id, opted_in_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (owner, repo) DO UPDATE SET user_id = excluded.user_id, opted_in_at = excluded.opted_in_at`,
  ).bind(repository.owner, repository.repo, userId, now).run()
}

export async function optOutSkillgenRepository(db: D1Database, repository: SkillgenRepository): Promise<void> {
  await db.prepare(`DELETE FROM skillgen_repositories WHERE owner = ?1 AND repo = ?2`).bind(repository.owner, repository.repo).run()
}

/** The subset of `owner/repo` names that opted in, lowercased. The Worker asks with at most 100. */
export async function optedInSkillgenRepositories(db: D1Database, fullNames: string[]): Promise<string[]> {
  if (!fullNames.length)
    return []
  const { results } = await db.prepare(
    `SELECT lower(owner || '/' || repo) AS full_name FROM skillgen_repositories
     WHERE lower(owner || '/' || repo) IN (SELECT lower(value) FROM json_each(?1))`,
  ).bind(JSON.stringify(fullNames)).all<{ full_name: string }>()
  return results.map(row => row.full_name)
}

/** The account that opted the repository in, or null when it is off. */
export async function skillgenOptInUser(db: D1Database, repository: SkillgenRepository): Promise<number | null> {
  const row = await db.prepare(`SELECT user_id FROM skillgen_repositories WHERE owner = ?1 AND repo = ?2`)
    .bind(repository.owner, repository.repo)
    .first<{ user_id: number }>()
  return row?.user_id ?? null
}

type Ineligible = Exclude<SkillgenEligibility, { _tag: 'Eligible' }>

/** The HTTP status and the sentence the account page shows for a refused opt-in. */
export function skillgenRefusal(result: Ineligible): { statusCode: number, message: string } {
  switch (result._tag) {
    case 'NotFound':
      return { statusCode: 404, message: 'GitHub has no public repository with that name.' }
    case 'NotPublic':
      return { statusCode: 422, message: 'Skillgen runs only on public repositories.' }
    case 'NotMaintainer':
      return { statusCode: 403, message: 'You need admin or maintain access to this repository.' }
    case 'NoPackage':
      return { statusCode: 422, message: 'Skillgen supports npm packages only. Add a package.json at the root or under packages/.' }
    case 'NoSkill':
      return { statusCode: 422, message: 'Skillgen updates an existing Skill. Add one at skills/<name>/SKILL.md beside the package.json.' }
    case 'UnpublishedPackage':
      return { statusCode: 422, message: 'Each package with a Skill is private or has no name. Skillgen updates published npm packages only.' }
    case 'TreeTooLarge':
      return { statusCode: 422, message: 'This repository is too large for Skillgen to read.' }
    case 'GithubUnavailable':
      return result.status === 401
        ? { statusCode: 401, message: 'Your GitHub access ended. Sign in with GitHub again.' }
        : { statusCode: 502, message: 'GitHub did not answer. Try again.' }
  }
}

export interface SkillgenInspectedRow extends SkillgenRepositoryRow { eligibility: SkillgenEntryEligibility }

/**
 * Inspects every listed repository so the page shows each reason up front.
 * At most `concurrency` repositories read GitHub at once.
 */
export async function inspectSkillgenRows(github: GithubGet, rows: SkillgenRepositoryRow[], concurrency = 6): Promise<SkillgenInspectedRow[]> {
  const inspected: SkillgenInspectedRow[] = Array.from({ length: rows.length })
  let next = 0
  async function work(): Promise<void> {
    while (next < rows.length) {
      const index = next++
      const row = rows[index]!
      const inspection = await inspectSkillgenRepository(github, row)
      inspected[index] = {
        ...row,
        eligibility: inspection._tag === 'Eligible'
          ? { _tag: 'Eligible', packages: inspection.packages }
          : { _tag: 'Ineligible', message: skillgenRefusal(inspection).message },
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, work))
  return inspected
}
