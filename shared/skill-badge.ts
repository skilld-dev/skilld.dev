import { repoHubPath } from './skill-routes'

export interface SkillBadgeMarkdownInput {
  owner: string
  repo: string
  name: string
  registryPath: string
  siteUrl?: string
}

const DEFAULT_SITE_URL = 'https://skilld.dev'

export function skillBadgeMarkdown(input: SkillBadgeMarkdownInput): string {
  const siteUrl = (input.siteUrl ?? DEFAULT_SITE_URL).replace(/\/+$/, '')
  const repoPath = repoHubPath(input.owner, input.repo)
  const badgeSegments = input.registryPath === repoPath
    ? [input.owner, input.repo]
    : [input.owner, input.repo, input.name]
  const badgePath = badgeSegments.map(encodeURIComponent).join('/')
  const registryPath = (input.registryPath.startsWith('/')
    ? input.registryPath
    : `/${input.registryPath}`)
    .split('/')
    .map(encodeURIComponent)
    .join('/')

  return `[![Run on skilld](${siteUrl}/b/${badgePath})](${siteUrl}${registryPath})`
}
