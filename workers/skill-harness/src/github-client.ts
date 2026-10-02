import type { ProofInput } from './contracts'
import type { TagRequest } from './github-events'
import { z } from 'zod'
import { parseJson, parseProofInput, readBoundedBody } from './contracts'
import { matchesNpmProvenance } from './npm-provenance'

const sha = z.string().regex(/^[a-f0-9]{40}$/)
const commit = z.object({ sha })
const repoSchema = z.object({ id: z.number().int().positive(), private: z.boolean(), default_branch: z.string().min(1).max(200) })
const packageSchema = z.object({ name: z.string().regex(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/), version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i) })
const treeSchema = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), type: z.string(), sha })).max(20_000) })
const contentSchema = z.object({ encoding: z.literal('base64'), content: z.string().max(96 * 1024) })
const npmSchema = z.object({ name: z.string(), version: z.string(), gitHead: sha.optional(), dist: z.object({ integrity: z.string(), attestations: z.object({ url: z.string().url() }).optional() }) })
export type GithubRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>
export interface PreparedTag extends TagRequest { targetSha: string, baseSha: string, baseBranch: string, skillRoot: string, input: ProofInput }

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function githubInstallationClient(options: { appId: string, privateKey: string, installationId: number, repositoryId: number, fetch: typeof fetch, now: () => number }): Promise<GithubRequest> {
  const encoded = options.privateKey.replace(/-----[^-]+-----|\s/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(encoded), char => char.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const seconds = Math.floor(options.now() / 1000)
  const message = `${base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${base64url(new TextEncoder().encode(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: options.appId })))}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message))
  const token = z.object({ token: z.string().min(1), expires_at: z.string() }).parse(await githubJson(`/app/installations/${options.installationId}/access_tokens`, `${message}.${base64url(new Uint8Array(signature))}`, options.fetch, 'POST', { repository_ids: [options.repositoryId], permissions: { contents: 'write', pull_requests: 'write' } })).token
  return (path, method, body) => githubJson(path, token, options.fetch, method, body)
}

async function githubJson(path: string, token: string, fetcher: typeof fetch, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetcher(`https://api.github.com${path}`, {
    method,
    redirect: 'manual',
    headers: { 'accept': 'application/vnd.github+json', 'authorization': `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'skilld.dev', 'x-github-api-version': '2026-03-10' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404)
    return null
  if (!response.ok)
    throw new Error(`GITHUB_${response.status}`)
  const text = await readBoundedBody(response, 2 * 1024 * 1024)
  if (text === undefined)
    throw new Error('GITHUB_RESPONSE_TOO_LARGE')
  const parsed = parseJson(text)
  if (parsed._tag === 'Err')
    throw new Error('GITHUB_RESPONSE_INVALID')
  return parsed.value
}

async function readContent(api: GithubRequest, prefix: string, path: string, ref: string): Promise<string> {
  const value = contentSchema.parse(await api(`${prefix}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`))
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(value.content.replace(/\s/g, '')), char => char.charCodeAt(0)))
}

export async function prepareTag(request: TagRequest, api: GithubRequest, fetcher: typeof fetch): Promise<{ _tag: 'Prepared', value: PreparedTag } | { _tag: 'Skipped', reason: string } | { _tag: 'Pending', reason: string }> {
  const prefix = `/repos/${request.owner}/${request.name}`
  const repository = repoSchema.parse(await api(prefix))
  if (repository.private || repository.id !== request.repositoryId)
    return { _tag: 'Skipped', reason: 'PUBLIC_REPOSITORY_REQUIRED' }
  let tag = request.tag
  if (tag === '@latest') {
    const tags = z.array(z.object({ name: z.string() })).parse(await api(`${prefix}/tags?per_page=1`))
    if (!tags[0])
      return { _tag: 'Skipped', reason: 'NO_TAGS' }
    tag = tags[0].name
  }
  const target = commit.parse(await api(`${prefix}/commits/${encodeURIComponent(tag)}`)).sha
  const pkg = packageSchema.parse(JSON.parse(await readContent(api, prefix, 'package.json', target)))
  if (tag !== pkg.version && tag !== `v${pkg.version}`)
    return { _tag: 'Skipped', reason: 'TAG_VERSION_MISMATCH' }
  const npm = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (npm.status === 404)
    return { _tag: 'Pending', reason: 'PACKAGE_NOT_PUBLISHED' }
  if (!npm.ok)
    throw new Error(`NPM_${npm.status}`)
  const npmBody = await readBoundedBody(npm, 512 * 1024)
  const published = npmBody === undefined ? undefined : npmSchema.safeParse(JSON.parse(npmBody))
  if (!published?.success || published.data.name !== pkg.name || published.data.version !== pkg.version)
    return { _tag: 'Skipped', reason: 'PACKAGE_TAG_PROVENANCE_MISMATCH' }
  if (published.data.gitHead !== target) {
    if (published.data.gitHead || !published.data.dist.attestations)
      return { _tag: 'Skipped', reason: 'PACKAGE_TAG_PROVENANCE_MISMATCH' }
    const url = new URL(published.data.dist.attestations.url)
    const expected = `/-/npm/v1/attestations/${pkg.name}@${pkg.version}`
    if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || url.search || url.hash || decodeURIComponent(url.pathname) !== expected)
      return { _tag: 'Skipped', reason: 'PACKAGE_TAG_PROVENANCE_MISMATCH' }
    const response = await fetcher(url.href, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    if (!response.ok)
      throw new Error(`NPM_PROVENANCE_${response.status}`)
    const text = await readBoundedBody(response, 1024 * 1024)
    const parsed = text === undefined ? undefined : parseJson(text)
    if (parsed?._tag !== 'Ok' || !matchesNpmProvenance(parsed.value, { ...request, tag, targetSha: target, packageName: pkg.name, version: pkg.version, integrity: published.data.dist.integrity }))
      return { _tag: 'Skipped', reason: 'PACKAGE_TAG_PROVENANCE_MISMATCH' }
  }
  const baseSha = commit.parse(await api(`${prefix}/commits/${encodeURIComponent(repository.default_branch)}`)).sha
  const tree = treeSchema.parse(await api(`${prefix}/git/trees/${baseSha}?recursive=1`))
  if (tree.truncated)
    return { _tag: 'Skipped', reason: 'REPOSITORY_TREE_TOO_LARGE' }
  const expectedRoot = `skills/${pkg.name.split('/').at(-1)}`
  const paths = new Set(tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path))
  const skillRoot = paths.has(`${expectedRoot}/SKILL.md`) ? expectedRoot : paths.has('SKILL.md') ? '' : undefined
  if (skillRoot === undefined)
    return { _tag: 'Skipped', reason: 'EXISTING_SKILL_REQUIRED' }
  const rootPrefix = skillRoot ? `${skillRoot}/` : ''
  const currentSkill = []
  let bytes = 0
  for (const path of [...paths].sort()) {
    if (!path.startsWith(rootPrefix))
      continue
    const relative = path.slice(rootPrefix.length)
    if (relative !== 'SKILL.md' && !/^references\/(?:[\w-]+\/)*[\w.-]+\.md$/i.test(relative))
      continue
    const content = await readContent(api, prefix, path, baseSha)
    bytes += new TextEncoder().encode(content).byteLength
    if (bytes > 64 * 1024 || currentSkill.length >= 9)
      return { _tag: 'Skipped', reason: 'BASELINE_TOO_LARGE' }
    currentSkill.push({ path: relative, content })
  }
  const skillName = /^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/m.exec(currentSkill.find(file => file.path === 'SKILL.md')?.content ?? '')?.[1]
  const input = parseProofInput({ spec: `${pkg.name}@${pkg.version}`, name: skillName, currentSkill })
  if (input._tag === 'Err')
    return { _tag: 'Skipped', reason: 'INVALID_SKILL_BASELINE' }
  const value = { ...request, tag, targetSha: target, baseSha, baseBranch: repository.default_branch, skillRoot, input: input.value }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 96 * 1024)
    return { _tag: 'Skipped', reason: 'BASELINE_TOO_LARGE' }
  return { _tag: 'Prepared', value }
}

const pull = z.object({ html_url: z.string().url() })
export async function publishSkill(context: PreparedTag, files: ProofInput['currentSkill'], api: GithubRequest): Promise<{ _tag: 'Published', url: string } | { _tag: 'Unchanged' | 'Conflict' } | { _tag: 'Rejected', reason: string }> {
  const checked = parseProofInput({ ...context.input, currentSkill: files })
  if (checked._tag === 'Err')
    return { _tag: 'Rejected', reason: 'INVALID_OUTPUT_PATHS' }
  const previous = new Map(context.input.currentSkill.map(file => [file.path, file.content]))
  const next = new Map(files.map(file => [file.path, file.content]))
  const changes = files.filter(file => previous.get(file.path) !== file.content)
  const deleted = context.input.currentSkill.filter(file => !next.has(file.path))
  if (!changes.length && !deleted.length)
    return { _tag: 'Unchanged' }
  const prefix = `/repos/${context.owner}/${context.name}`
  if (commit.parse(await api(`${prefix}/commits/${encodeURIComponent(context.baseBranch)}`)).sha !== context.baseSha)
    return { _tag: 'Conflict' }
  const branch = `skilld/${context.targetSha}`
  const existingPulls = z.array(pull).parse(await api(`${prefix}/pulls?state=all&head=${encodeURIComponent(`${context.owner}:${branch}`)}`))
  if (existingPulls[0])
    return { _tag: 'Published', url: existingPulls[0].html_url }
  const existingBranch = await api(`${prefix}/git/ref/heads/${branch}`)
  // A branch may be left by a timed-out write. Do not replace a human's edits.
  if (existingBranch !== null)
    return { _tag: 'Conflict' }
  const entries: { path: string, mode: string, type: string, sha: string | null }[] = []
  for (const file of changes) {
    const blob = commit.parse(await api(`${prefix}/git/blobs`, 'POST', { content: file.content, encoding: 'utf-8' }))
    entries.push({ path: context.skillRoot ? `${context.skillRoot}/${file.path}` : file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  for (const file of deleted)
    entries.push({ path: context.skillRoot ? `${context.skillRoot}/${file.path}` : file.path, mode: '100644', type: 'blob', sha: null })
  const base = z.object({ tree: z.object({ sha }) }).parse(await api(`${prefix}/git/commits/${context.baseSha}`))
  const tree = commit.parse(await api(`${prefix}/git/trees`, 'POST', { base_tree: base.tree.sha, tree: entries }))
  const title = `docs(skills): update for ${context.tag}`.slice(0, 69)
  const generated = commit.parse(await api(`${prefix}/git/commits`, 'POST', { message: title, tree: tree.sha, parents: [context.baseSha] }))
  await api(`${prefix}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: generated.sha })
  const body = `🤖 This draft was written by the skilld GitHub App.\n\nUpdates the existing Skill for ${context.input.spec}.\nSource tag: ${context.tag}. Source commit: ${context.targetSha}.\n\nThe Harness generated these files and a separate review accepted them.\nA maintainer must check the examples before merging.\n\n> 🤖 AI disclosure: [Harlan Agent Kit](https://github.com/harlan-zw/harlan-agent-kit) modified this description. [My AI open-source policy](https://harlanzw.com/blog/ai-in-open-source).`
  const published = pull.parse(await api(`${prefix}/pulls`, 'POST', { title, head: branch, base: context.baseBranch, body, draft: true }))
  return { _tag: 'Published', url: published.html_url }
}
