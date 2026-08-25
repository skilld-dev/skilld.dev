/**
 * Install-command handoff. The MCP server only ever *returns* these commands
 * as text for the user (or their agent, with the user's consent) to run in
 * their own environment; nothing is executed here.
 *
 * Formats mirror `app/utils/install-cmd.ts` (the client-side source of
 * truth). Duplicated rather than imported: ADR-0001 forbids reaching into
 * another layer's code, and the command shape is a product-wide convention,
 * not layer domain data.
 */

const PREFIX = 'npx skilld add'

/**
 * The default handoff. `skilld run` gives the calling agent the skill now and
 * installs nothing, so a discovery client never has to write to a repository.
 */
export function skillRunCommand(owner: string, repo: string, skill: string): string {
  return `npx skilld run skilld:${owner}/${repo}/${skill}`
}

export function repoInstallCommand(owner: string, repo: string, skill?: string): string {
  const base = `${PREFIX} gh:${owner}/${repo}`
  return skill ? `${base} -s ${skill}` : base
}

export function curatorInstallCommand(login: string): string {
  return `${PREFIX} @${login}`
}

export function collectionInstallCommand(login: string, slug: string): string {
  return `${PREFIX} @${login}/${slug}`
}

export function npmInstallCommand(name: string): string {
  return `${PREFIX} npm:${name}`
}

export type InstallRef
  = | { kind: 'skill', owner: string, repo: string, name: string }
    | { kind: 'repo', owner: string, repo: string }
    | { kind: 'collection', login: string, slug: string }
    | { kind: 'curator', login: string }
    | { kind: 'npm', package: string }

const SEGMENT_RE = /^[\w.-]+$/

function validSegments(...segments: string[]): boolean {
  return segments.every(s => s.length > 0 && SEGMENT_RE.test(s))
}

/**
 * Parse a discovery ref into an installable target. Accepted forms:
 * - `gh:owner/repo` or `owner/repo` (all skills in a repo)
 * - `gh:owner/repo/name` or `owner/repo/name` (one skill)
 * - `@login` (everything a curator publishes)
 * - `@login/slug` (one collection)
 * - `npm:package` (package skill)
 */
export function parseInstallRef(raw: string): InstallRef | null {
  const ref = raw.trim()
  if (!ref)
    return null

  if (ref.startsWith('@')) {
    const parts = ref.slice(1).split('/')
    if (parts.length === 1 && validSegments(parts[0]!))
      return { kind: 'curator', login: parts[0]! }
    if (parts.length === 2 && validSegments(parts[0]!, parts[1]!))
      return { kind: 'collection', login: parts[0]!, slug: parts[1]! }
    return null
  }

  if (ref.startsWith('npm:')) {
    const pkg = ref.slice(4)
    // npm names may be scoped (@scope/name); validate the two halves.
    const parts = pkg.startsWith('@') ? pkg.slice(1).split('/') : [pkg]
    if ((parts.length === 1 || parts.length === 2) && validSegments(...parts))
      return { kind: 'npm', package: pkg }
    return null
  }

  const path = ref.startsWith('gh:') ? ref.slice(3) : ref
  const parts = path.split('/')
  if (parts.length === 2 && validSegments(parts[0]!, parts[1]!))
    return { kind: 'repo', owner: parts[0]!, repo: parts[1]! }
  if (parts.length === 3 && validSegments(parts[0]!, parts[1]!, parts[2]!))
    return { kind: 'skill', owner: parts[0]!, repo: parts[1]!, name: parts[2]! }
  return null
}

export function installCommandFor(ref: InstallRef): string {
  switch (ref.kind) {
    case 'skill':
      return repoInstallCommand(ref.owner, ref.repo, ref.name)
    case 'repo':
      return repoInstallCommand(ref.owner, ref.repo)
    case 'collection':
      return collectionInstallCommand(ref.login, ref.slug)
    case 'curator':
      return curatorInstallCommand(ref.login)
    case 'npm':
      return npmInstallCommand(ref.package)
  }
}
