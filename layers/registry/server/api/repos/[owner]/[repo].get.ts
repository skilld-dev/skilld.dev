import { getDB } from '#server/utils/db'
import { getRepo, getTree, resolveGithubBindings } from '../../../utils/github-client'
import { resolveRepoRouteTarget } from '../../../utils/repo-route-target'
import { resolveRepoSourceIdentity } from '../../../utils/repo-source-identity'
import { buildUnavailableRepoSourceProfile } from '../../../utils/repo-source-profile'
import { isTrustedAuthorRepo } from '../../../utils/trusted-author-sources'

export interface RepoSourceProfile {
  owner: string
  repo: string
  description: string | null
  githubUrl: string
  defaultBranch: string
  stars: number
  forks: number
  pushedAt: string
  createdAt: string
  archived: boolean
  fork: boolean
  skillFileScanStatus: 'ok' | 'unavailable' | 'truncated'
  skillFileCount: number
  skillFiles: string[]
  routeTarget: ReturnType<typeof resolveRepoRouteTarget>
  seoIndexable: boolean
}

export default defineCachedEventHandler(async (event) => {
  const ownerParam = getRouterParam(event, 'owner')
  const repoParam = getRouterParam(event, 'repo')
  if (!ownerParam || !repoParam)
    throw createError({ statusCode: 400, message: 'Missing owner or repo parameter' })

  const owner = ownerParam.toLowerCase()
  const repo = repoParam.toLowerCase()
  const seoIndexable = isTrustedAuthorRepo(owner, repo)
  const db = getDB(event)
  const [source, indexedSkills] = await Promise.all([
    resolveRepoSourceIdentity(db, { owner, repo }),
    db
      .prepare(
        `SELECT name
         FROM skills
         WHERE owner = ?
           AND repo = ?
           AND source_resolved = 1
         ORDER BY name
         LIMIT 2`,
      )
      .bind(owner, repo)
      .all<{ name: string }>(),
  ])
  const routeTarget = resolveRepoRouteTarget((indexedSkills.results ?? []).map(row => row.name))
  const bindings = resolveGithubBindings(event.context.platform.env)

  const repoRes = await getRepo(source.owner, source.repo, bindings)
  if (repoRes.status === 404)
    throw createError({ statusCode: 404, message: 'Repository not found' })
  if (!repoRes.data) {
    emitOperationalEvent(createWideEvent({
      'operation': 'repo-source-profile',
      'outcome': 'unavailable',
      'upstream.status': repoRes.status || null,
    }))
    return {
      ...buildUnavailableRepoSourceProfile(owner, repo),
      routeTarget,
      seoIndexable,
    } satisfies RepoSourceProfile
  }

  const meta = repoRes.data
  const repoOwner = meta.owner.login
  const repoName = meta.name
  const treeRes = await getTree(repoOwner, repoName, meta.default_branch, bindings)
  const skillFiles = (treeRes.data?.tree ?? [])
    .filter(entry => entry.type === 'blob' && entry.path.split('/').at(-1) === 'SKILL.md')
    .map(entry => entry.path)
    .sort()
  const skillFileScanStatus = !treeRes.data
    ? 'unavailable'
    : treeRes.data.truncated
      ? 'truncated'
      : 'ok'

  return {
    owner: repoOwner,
    repo: repoName,
    description: meta.description,
    githubUrl: meta.html_url || `https://github.com/${repoOwner}/${repoName}`,
    defaultBranch: meta.default_branch,
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    pushedAt: meta.pushed_at,
    createdAt: meta.created_at,
    archived: Boolean(meta.archived),
    fork: Boolean(meta.fork),
    skillFileScanStatus,
    skillFileCount: skillFiles.length,
    skillFiles,
    routeTarget,
    seoIndexable,
  } satisfies RepoSourceProfile
}, {
  maxAge: 60 * 15,
  swr: true,
  getKey: (event) => {
    const owner = (getRouterParam(event, 'owner') ?? '').toLowerCase()
    const repo = (getRouterParam(event, 'repo') ?? '').toLowerCase()
    return `repo-source:v3:${owner}/${repo}`
  },
})
