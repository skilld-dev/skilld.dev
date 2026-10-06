/// <reference types="@cloudflare/workers-types" />
import { z } from 'zod'

/**
 * Skillgen opt-in. A maintainer turns Skillgen on per repository, and the
 * skill-harness Worker queues jobs only for those. Eligibility mirrors the
 * Worker's own checks: a public npm package whose Skill sits where the Worker
 * reads it. Skillgen supports npm only, so a root `package.json` is required.
 */

export interface SkillgenRepository { owner: string, repo: string }

export type SkillgenEligibility
  = | ({ _tag: 'Eligible' } & SkillgenRepository)
    | { _tag: 'NotFound' }
    | { _tag: 'NotPublic' }
    | { _tag: 'NotMaintainer' }
    | { _tag: 'NoPackageJson' }
    | { _tag: 'NoSkill', expected: string }
    | { _tag: 'GithubUnavailable', status: number }

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
const contentSchema = z.object({ content: z.string(), encoding: z.literal('base64') })
const packageSchema = z.object({ name: z.string().min(1) })

function canMaintain(repository: z.infer<typeof repositorySchema>): boolean {
  return !!(repository.permissions?.admin || repository.permissions?.maintain)
}

function splitFullName(fullName: string): SkillgenRepository {
  const [owner = '', repo = ''] = fullName.split('/')
  return { owner, repo }
}

async function packageName(github: GithubGet, prefix: string): Promise<string | null | { status: number }> {
  const response = await github(`${prefix}/contents/package.json`)
  if (response.status === 404)
    return null
  if (!response.ok)
    return { status: response.status }
  const content = contentSchema.safeParse(await response.json())
  if (!content.success)
    return null
  const parsed = packageSchema.safeParse(parseJsonText(atob(content.data.content.replaceAll('\n', ''))))
  return parsed.success ? parsed.data.name : null
}

/** A `package.json` that is not JSON counts as missing, so it returns undefined instead of throwing. */
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

/**
 * Checks one repository the way the Worker will. The account must hold admin
 * or maintain rights, because opting in lets an App write to the repository.
 */
export async function checkSkillgenEligibility(github: GithubGet, ref: SkillgenRepository): Promise<SkillgenEligibility> {
  const prefix = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`
  const response = await github(prefix)
  if (response.status === 404)
    return { _tag: 'NotFound' }
  if (!response.ok)
    return { _tag: 'GithubUnavailable', status: response.status }
  const repository = repositorySchema.parse(await response.json())
  if (repository.private)
    return { _tag: 'NotPublic' }
  if (!canMaintain(repository))
    return { _tag: 'NotMaintainer' }

  const name = await packageName(github, prefix)
  if (name === null)
    return { _tag: 'NoPackageJson' }
  if (typeof name === 'object')
    return { _tag: 'GithubUnavailable', status: name.status }

  // The Worker reads `skills/<package name without scope>/SKILL.md`, then a root `SKILL.md`.
  const expected = `skills/${name.split('/').at(-1)}/SKILL.md`
  for (const path of [expected, 'SKILL.md']) {
    const skill = await github(`${prefix}/contents/${path}`)
    if (skill.ok)
      return { _tag: 'Eligible', ...splitFullName(repository.full_name) }
    if (skill.status !== 404)
      return { _tag: 'GithubUnavailable', status: skill.status }
  }
  return { _tag: 'NoSkill', expected }
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
    case 'NoPackageJson':
      return { statusCode: 422, message: 'Skillgen supports npm packages only. Add a package.json with a name at the repository root.' }
    case 'NoSkill':
      return { statusCode: 422, message: `Skillgen updates an existing Skill. Add it at ${result.expected} or as SKILL.md at the root.` }
    case 'GithubUnavailable':
      return result.status === 401
        ? { statusCode: 401, message: 'Your GitHub access ended. Sign in with GitHub again.' }
        : { statusCode: 502, message: 'GitHub did not answer. Try again.' }
  }
}
