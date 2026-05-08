export function ownerHubPath(owner: string): string {
  return `/gh/${owner}`
}

export function repoHubPath(owner: string, repo: string): string {
  return `${ownerHubPath(owner)}/${repo}`
}

export function repoSkillPath(owner: string, repo: string, name: string): string {
  if (name === repo)
    return repoHubPath(owner, repo)
  return `${repoHubPath(owner, repo)}/${name}`
}
