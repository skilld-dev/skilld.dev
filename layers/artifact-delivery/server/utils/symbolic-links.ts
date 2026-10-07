import type { SourceRejection } from './github-source'
import { compareArtifactPaths } from './ustar'

/** One Git tree entry, as GitHub lists it. */
export interface GitTreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

/**
 * A tree entry of the Skill. `from` is the Repository path of its bytes when
 * a symbolic link put it at `path`. Without `from`, the bytes sit at `path`
 * inside the Skill folder.
 */
export type SkillEntry = GitTreeEntry & { from?: string }

/**
 * A symbolic link in the Skill folder, and what the build did with it. The
 * `symbolic-links` check result lists each one. Paths are inside the Skill
 * folder; `target` is the path the link holds.
 */
export type SymbolicLinkNote
  = | { _tag: 'followed', path: string, target: string }
    /** A link to a folder that holds the link. The Skill already packs every file in it. */
    | { _tag: 'holds-itself', path: string, target: string }
    /** A link inside a folder another link names. It is not read. */
    | { _tag: 'inside-followed-folder', path: string }

export interface FollowedLinks {
  _tag: 'followed'
  entries: SkillEntry[]
  notes: SymbolicLinkNote[]
  /** GitHub reads the links cost, each one a Worker subrequest. */
  reads: number
}

export type LinkText = { _tag: 'text', value: string } | { _tag: 'invalid' }

/** The GitHub reads that following links needs. Each may answer a read failure. */
export interface LinkSourceReader {
  /** The entries of one tree, one level deep. */
  level: (treeSha: string) => Promise<GitTreeEntry[] | SourceRejection>
  /** Every entry under one tree, with paths relative to it. */
  all: (treeSha: string) => Promise<GitTreeEntry[] | SourceRejection>
  /** The path a symbolic link's blob holds. */
  linkText: (blobSha: string) => Promise<LinkText | SourceRejection>
}

/** Links one path may pass through after the link itself. */
export const MAX_LINK_HOPS = 8
/** Symbolic links one Skill folder may hold. */
const MAX_SKILL_LINKS = 64
/**
 * GitHub reads one Skill may spend to follow its links: link blobs and trees.
 * simota/agent-skills spends at most 12 per Skill, and a public build caches
 * each read by its SHA.
 */
const MAX_LINK_READS = 128
/** Entries the folders that links name may add, as one Skill folder listing may hold. */
const MAX_FOLLOWED_FOLDER_ENTRIES = 20_000
/** The longest path a Unix system follows. A longer link blob holds no path. */
export const MAX_LINK_TARGET_BYTES = 4096

const SYMBOLIC_LINK_MODE = '120000'

type Refusal = 'absolute' | 'outside' | 'git' | 'missing' | 'submodule' | 'loop' | 'chain' | 'holds-skill' | 'invalid'

const REFUSALS: Record<Refusal, string> = {
  'absolute': 'the target is an absolute path',
  'outside': 'the target is outside the Repository',
  'git': 'the target is inside .git',
  'missing': 'the target does not exist at this commit',
  'submodule': 'the target is in a Git submodule',
  'loop': 'the link loops',
  'chain': `the target passes through more than ${MAX_LINK_HOPS} links`,
  'holds-skill': 'the target folder holds the Skill folder',
  'invalid': 'the link does not hold a valid path',
}

type Resolved
  = | { _tag: 'file', entry: GitTreeEntry, path: string }
    | { _tag: 'folder', path: string }
    | { _tag: 'refused', refusal: Refusal }

/** True for a tree entry that is a symbolic link. */
export function isSymbolicLink(entry: GitTreeEntry): boolean {
  return entry.type === 'blob' && entry.mode === SYMBOLIC_LINK_MODE
}

/**
 * The Skill entries with each symbolic link in the Skill folder replaced by
 * the files it names, as `tar --dereference` would pack them.
 *
 * A link resolves from its own folder by POSIX rules, at the same commit:
 * `..` leaves the folder that holds the link, and a link on the way resolves
 * in turn. It must end at a file or a folder inside the Repository. A file
 * becomes one entry at the link path. A folder becomes every file in it,
 * under the link path. Each entry keeps its Git blob SHA, so the build checks
 * the bytes as it checks any other file.
 *
 * Two kinds of link are left out, and the check result names them:
 *
 * - A link inside a folder that a link names. tar --dereference follows
 *   these too, and on simota/agent-skills it recursed 5,800 folders deep:
 *   `_common` links every Skill folder, and each Skill links `_common`.
 * - A link to a folder inside the Skill that holds the link, such as
 *   `atlas/reference/atlas -> ../../atlas`. The Skill already packs those files.
 *
 * Any other link that does not end at a file or folder refuses the Skill.
 */
export async function followSymbolicLinks(input: {
  /** The Skill folder listing, with paths inside the Skill folder. */
  entries: GitTreeEntry[]
  skillPath: string
  rootTreeSha: string
  read: LinkSourceReader
}): Promise<FollowedLinks | SourceRejection> {
  const links = input.entries.filter(isSymbolicLink)
  if (links.length === 0)
    return { _tag: 'followed', entries: input.entries, notes: [], reads: 0 }
  if (links.length > MAX_SKILL_LINKS)
    return limitRejection(`The Skill folder holds more than ${MAX_SKILL_LINKS} symbolic links.`)

  const skillFolder = input.skillPath === '.' ? '' : input.skillPath
  const inRepository = (path: string) => skillFolder ? `${skillFolder}/${path}` : path
  let reads = 0
  const overBudget = () => ++reads > MAX_LINK_READS
  const budgetRejection = () => limitRejection(`The symbolic links of the Skill need more than ${MAX_LINK_READS} GitHub reads.`)

  // The Skill folder listing answers every lookup inside it with no read.
  const levels = new Map<string, GitTreeEntry[]>([[skillFolder, []]])
  for (const entry of input.entries) {
    if (entry.type === 'tree' && !levels.has(inRepository(entry.path)))
      levels.set(inRepository(entry.path), [])
    const separator = entry.path.lastIndexOf('/')
    const folder = separator === -1 ? skillFolder : inRepository(entry.path.slice(0, separator))
    const level = levels.get(folder) ?? []
    level.push({ ...entry, path: entry.path.slice(separator + 1) })
    levels.set(folder, level)
  }
  const levelAt = async (segments: string[]): Promise<GitTreeEntry[] | SourceRejection | null> => {
    const key = segments.join('/')
    const known = levels.get(key)
    if (known)
      return known
    let sha = input.rootTreeSha
    if (segments.length > 0) {
      const parent = await levelAt(segments.slice(0, -1))
      if (parent === null || !Array.isArray(parent))
        return parent
      const entry = parent.find(candidate => candidate.path === segments.at(-1) && candidate.type === 'tree')
      if (!entry)
        return null
      sha = entry.sha
    }
    if (overBudget())
      return budgetRejection()
    const listed = await input.read.level(sha)
    if (Array.isArray(listed))
      levels.set(key, listed)
    return listed
  }
  const texts = new Map<string, LinkText>()
  const textOf = async (entry: GitTreeEntry): Promise<LinkText | SourceRejection> => {
    if (entry.size !== undefined && entry.size > MAX_LINK_TARGET_BYTES)
      return { _tag: 'invalid' }
    const known = texts.get(entry.sha)
    if (known)
      return known
    if (overBudget())
      return budgetRejection()
    const read = await input.read.linkText(entry.sha)
    if (read._tag !== 'rejected')
      texts.set(entry.sha, read)
    return read
  }

  /** Where the link at `linkPath`, a Repository path, ends. */
  const resolve = async (linkPath: string, text: string): Promise<Resolved | SourceRejection> => {
    if (text.startsWith('/'))
      return { _tag: 'refused', refusal: 'absolute' }
    const folder = linkPath.split('/').slice(0, -1)
    const pending = text.split('/')
    const seen = new Set([linkPath])
    let hops = 0
    while (pending.length > 0) {
      const name = pending.shift()!
      if (name === '' || name === '.')
        continue
      if (name === '..') {
        if (folder.length === 0)
          return { _tag: 'refused', refusal: 'outside' }
        folder.pop()
        continue
      }
      if (name.toLowerCase() === '.git')
        return { _tag: 'refused', refusal: 'git' }
      const level = await levelAt(folder)
      if (level !== null && !Array.isArray(level))
        return level
      const entry = level?.find(candidate => candidate.path === name)
      if (!entry)
        return { _tag: 'refused', refusal: 'missing' }
      const path = [...folder, name].join('/')
      if (isSymbolicLink(entry)) {
        if (seen.has(path))
          return { _tag: 'refused', refusal: 'loop' }
        if (++hops > MAX_LINK_HOPS)
          return { _tag: 'refused', refusal: 'chain' }
        seen.add(path)
        const next = await textOf(entry)
        if (next._tag === 'rejected')
          return next
        if (next._tag === 'invalid')
          return { _tag: 'refused', refusal: 'invalid' }
        if (next.value.startsWith('/'))
          return { _tag: 'refused', refusal: 'absolute' }
        pending.unshift(...next.value.split('/'))
        continue
      }
      if (entry.type === 'tree') {
        folder.push(name)
        continue
      }
      if (entry.type === 'commit')
        return { _tag: 'refused', refusal: 'submodule' }
      // A file cannot hold the rest of the path, not even a trailing slash.
      return pending.length > 0 ? { _tag: 'refused', refusal: 'missing' } : { _tag: 'file', entry, path }
    }
    return { _tag: 'folder', path: folder.join('/') }
  }

  const listings = new Map<string, GitTreeEntry[]>()
  let followedFolderEntries = 0
  const entries: SkillEntry[] = input.entries.filter(entry => !isSymbolicLink(entry))
  const notes: SymbolicLinkNote[] = []
  const refusals: string[] = []
  for (const link of [...links].sort((left, right) => compareArtifactPaths(left.path, right.path))) {
    const text = await textOf(link)
    if (text._tag === 'rejected')
      return text
    if (text._tag === 'invalid') {
      refusals.push(`${link.path}: ${REFUSALS.invalid}`)
      continue
    }
    const linkPath = inRepository(link.path)
    const resolved = await resolve(linkPath, text.value)
    if (resolved._tag === 'rejected')
      return resolved
    if (resolved._tag === 'refused') {
      refusals.push(`${link.path} -> ${text.value}: ${REFUSALS[resolved.refusal]}`)
      continue
    }
    if (resolved._tag === 'file') {
      entries.push({ ...resolved.entry, path: link.path, from: resolved.path })
      notes.push({ _tag: 'followed', path: link.path, target: text.value })
      continue
    }
    if (resolved.path === '' || linkPath.startsWith(`${resolved.path}/`)) {
      const insideSkill = skillFolder === '' || resolved.path === skillFolder || resolved.path.startsWith(`${skillFolder}/`)
      if (insideSkill)
        notes.push({ _tag: 'holds-itself', path: link.path, target: text.value })
      else
        refusals.push(`${link.path} -> ${text.value}: ${REFUSALS['holds-skill']}`)
      continue
    }
    const listed = await listingOf(resolved.path)
    if (!Array.isArray(listed))
      return listed
    followedFolderEntries += listed.length
    if (followedFolderEntries > MAX_FOLLOWED_FOLDER_ENTRIES)
      return limitRejection(`The folders the symbolic links of the Skill name hold more than ${MAX_FOLLOWED_FOLDER_ENTRIES.toLocaleString('en-US')} entries.`)
    for (const entry of listed) {
      const path = `${link.path}/${entry.path}`
      if (isSymbolicLink(entry))
        notes.push({ _tag: 'inside-followed-folder', path })
      else if (entry.type === 'tree')
        entries.push({ ...entry, path })
      else
        entries.push({ ...entry, path, from: `${resolved.path}/${entry.path}` })
    }
    notes.push({ _tag: 'followed', path: link.path, target: text.value })
  }
  if (refusals.length > 0)
    return { _tag: 'rejected', code: 'INVALID_SOURCE', summary: 'The Skill source layout was rejected.', findings: refusals.slice(0, 100) }
  return { _tag: 'followed', entries, notes: notes.sort((left, right) => compareArtifactPaths(left.path, right.path)), reads }

  /**
   * Every entry under a folder `resolve` reached. A folder inside the Skill
   * comes from its own listing. Any other is read once, by its tree SHA.
   */
  async function listingOf(path: string): Promise<GitTreeEntry[] | SourceRejection> {
    if (skillFolder === '' || path.startsWith(`${skillFolder}/`)) {
      const prefix = `${skillFolder === '' ? path : path.slice(skillFolder.length + 1)}/`
      return input.entries
        .filter(entry => entry.path.startsWith(prefix))
        .map(entry => ({ ...entry, path: entry.path.slice(prefix.length) }))
    }
    const segments = path.split('/')
    // `resolve` listed every folder on the way, so this reads nothing.
    const parent = await levelAt(segments.slice(0, -1))
    if (parent !== null && !Array.isArray(parent))
      return parent
    const folder = parent?.find(candidate => candidate.path === segments.at(-1) && candidate.type === 'tree')
    if (!folder)
      throw new Error(`A resolved folder is missing from its parent listing: ${path}`)
    const known = listings.get(folder.sha)
    if (known)
      return known
    if (overBudget())
      return budgetRejection()
    const read = await input.read.all(folder.sha)
    if (Array.isArray(read))
      listings.set(folder.sha, read)
    return read
  }
}

function limitRejection(summary: string): SourceRejection {
  return { _tag: 'rejected', code: 'INVALID_SOURCE', summary, findings: [] }
}
