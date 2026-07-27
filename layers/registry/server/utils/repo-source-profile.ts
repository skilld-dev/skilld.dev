export interface UnavailableRepoSourceProfile {
  owner: string
  repo: string
  description: null
  githubUrl: string
  defaultBranch: 'main'
  stars: 0
  forks: 0
  pushedAt: ''
  createdAt: ''
  archived: false
  fork: false
  skillFileScanStatus: 'unavailable'
  skillFileCount: 0
  skillFiles: []
}

export function buildUnavailableRepoSourceProfile(
  owner: string,
  repo: string,
): UnavailableRepoSourceProfile {
  return {
    owner,
    repo,
    description: null,
    githubUrl: `https://github.com/${owner}/${repo}`,
    defaultBranch: 'main',
    stars: 0,
    forks: 0,
    pushedAt: '',
    createdAt: '',
    archived: false,
    fork: false,
    skillFileScanStatus: 'unavailable',
    skillFileCount: 0,
    skillFiles: [],
  }
}
