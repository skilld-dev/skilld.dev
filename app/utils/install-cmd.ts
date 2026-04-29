const PREFIX = 'npx -y skilld add'

export function gitInstallCmd(owner: string, repo: string, skill?: string): string {
  const base = `${PREFIX} gh:${owner}/${repo}`
  return skill ? `${base} -s ${skill}` : base
}

/**
 * Install command for the skills.sh CLI (https://skills.sh).
 * Format: `npx skills add {owner}/{repo}/{skill-name}` for a specific skill,
 * or `npx skills add {owner}/{repo}` for the whole repo.
 */
export function skillsShInstallCmd(owner: string, repo: string, skill?: string): string {
  const path = skill && skill !== repo ? `${owner}/${repo}/${skill}` : `${owner}/${repo}`
  return `npx skills add ${path}`
}

export function npmInstallCmd(name: string): string {
  return `${PREFIX} npm:${name}`
}

export function curatorInstallCmd(handle: string): string {
  return `${PREFIX} @${handle}`
}

export function collectionInstallCmd(handle: string, slug: string): string {
  return `${PREFIX} @${handle}/${slug}`
}
