export function githubSkillSourceUrl(input: {
  owner: string
  repo: string
  name: string
  currentSha: string
  path: string
}): string {
  const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/blob/${encodeURIComponent(input.currentSha)}/${encodePath(input.path)}`
}

export function githubSkillChangeUrl(input: {
  owner: string
  repo: string
  sha: string
}): string {
  return `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/commit/${encodeURIComponent(input.sha)}`
}
