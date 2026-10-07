/**
 * Where Skillgen finds a package skill. The account page's opt-in check and
 * the skill-harness Worker share this rule, so the page never offers a
 * repository the Worker would skip.
 *
 * A package sits at the repository root or one level under `packages/`, beside
 * its `package.json`. Its Skill sits in its own `skills/<dir>/SKILL.md`. A root
 * package may keep a single `SKILL.md` at the root instead.
 */
export interface PackageSkillCandidate {
  /** `''` for the repository root, else `packages/<dir>`. */
  packageDir: string
  /** Skill directories that hold a `SKILL.md`. `''` is the root `SKILL.md`. */
  skillRoots: string[]
}

const SKILL_PATH = /^(?:(packages\/[\w.-]+)\/)?skills\/([\w.-]+)\/SKILL\.md$/

export function packageJsonPath(packageDir: string): string {
  return packageDir ? `${packageDir}/package.json` : 'package.json'
}

/** Packages in a repository tree that hold a Skill, root first. */
export function packageSkillCandidates(paths: Iterable<string>): PackageSkillCandidate[] {
  const blobs = new Set(paths)
  const roots = new Map<string, string[]>()
  for (const path of blobs) {
    const match = SKILL_PATH.exec(path)
    if (!match)
      continue
    const packageDir = match[1] ?? ''
    if (!blobs.has(packageJsonPath(packageDir)))
      continue
    roots.set(packageDir, [...roots.get(packageDir) ?? [], `${packageDir ? `${packageDir}/` : ''}skills/${match[2]}`])
  }
  if (!roots.has('') && blobs.has('SKILL.md') && blobs.has('package.json'))
    roots.set('', [''])
  return [...roots]
    .map(([packageDir, skillRoots]) => ({ packageDir, skillRoots: skillRoots.sort() }))
    .sort((a, b) => a.packageDir.localeCompare(b.packageDir))
}

/**
 * The one Skill a package's runs update: its only Skill directory, or the one
 * named after the package. `generate-package-skill` names `@nuxtjs/seo` as
 * `nuxtjs-seo`; older Skills drop the scope. Undefined when nothing decides.
 */
export function packageSkillRoot(candidate: PackageSkillCandidate, packageName: string): string | undefined {
  if (candidate.skillRoots.length === 1)
    return candidate.skillRoots[0]
  const prefix = `${candidate.packageDir ? `${candidate.packageDir}/` : ''}skills/`
  const names = [packageName.replace(/^@/, '').replace('/', '-'), packageName.split('/').at(-1)]
  return names.map(name => `${prefix}${name}`).find(root => candidate.skillRoots.includes(root))
}

/** A release tag names a package version as `1.2.3`, `v1.2.3`, or `name@1.2.3`. */
export function tagMatchesVersion(tag: string, name: string, version: string): boolean {
  return tag === version || tag === `v${version}` || tag === `${name}@${version}`
}
