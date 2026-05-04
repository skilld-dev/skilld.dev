export function ownerHubPath(owner: string): string {
  return `/gh/${owner}`
}

export function repoHubPath(owner: string, repo: string): string {
  return `${ownerHubPath(owner)}/${repo}`
}

export function repoSkillPath(owner: string, repo: string, name: string): string {
  return `${repoHubPath(owner, repo)}/${name}`
}

export function legacySkillPath(owner: string, repo: string, name: string): string {
  const tail = repo === 'skills' ? name : `${repo}/${name}`
  return `/skills/${owner}/${tail}`
}
