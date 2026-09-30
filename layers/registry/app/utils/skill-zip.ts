/** Progress of a Skill ZIP the browser is building. */
export type ZipState
  = | { _tag: 'idle' }
    | { _tag: 'building', done: number, total: number }
    | { _tag: 'error', message: string }

export interface SkillZipEntry {
  /** Path inside the ZIP. The Skill folder is the root, as Claude and ChatGPT expect. */
  zipPath: string
  url: string
}

/**
 * Every file of a Skill as a raw GitHub URL pinned to one commit. The browser
 * fetches them and builds the ZIP, so the bytes match the commit on the page
 * and skilld serves nothing.
 */
export function resolveSkillZipEntries(input: {
  owner: string
  repo: string
  /** Commit SHA, or the branch when no commit is recorded. */
  ref: string
  /** Path of SKILL.md inside the repository. */
  skillPath: string
  name: string
  /** Files inside the Skill folder, without SKILL.md. */
  files: { path: string }[]
}): SkillZipEntry[] {
  const dir = input.skillPath.replace(/\/?SKILL\.md$/i, '')
  const base = `https://raw.githubusercontent.com/${input.owner}/${input.repo}/${input.ref}`
  return ['SKILL.md', ...input.files.map(file => file.path)].map(path => ({
    zipPath: `${input.name}/${path}`,
    url: `${base}/${[dir, path].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/')}`,
  }))
}
